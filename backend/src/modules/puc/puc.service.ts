import createError from 'http-errors';
import { pucRepository } from './puc.repository';
import { BlockchainManager } from '@/lib/blockchain.manager';
import { EntityType, PucStatus, TransferStatus } from '@/generated/prisma/client';
import { parseEthersError } from '@/utils/blockchainErrorHandler';
import { logger } from '@/lib/logger';
import prisma from '@/lib/prisma';
import type { IssuePucBody, ListPucQuery } from './puc.schema';

export const pucService = {
    async issuePuc(pucEntityId: string, memberId: string, data: IssuePucBody) {
        const ownTidBigInt = BigInt(data.ownTid);

        // 1. Validate vehicle ownership exists
        const ownership = await prisma.vehicleOwnership.findUnique({
            where: { ownTid: ownTidBigInt },
            include: { passport: true, transferRequests: { where: { status: TransferStatus.PENDING } } }
        });

        // Mirror: CenterNotActive — check entity is still active before submitting
        const pucEntity = await prisma.b2BEntity.findUnique({ where: { id: pucEntityId } });
        if (!pucEntity || !pucEntity.isActive) {
            throw createError(403, 'PUC center is inactive. Contact the Government Administrator.');
        }

        if (!ownership) {
            throw createError(404, 'Vehicle ownership not found.');
        }

        if (!ownership.isActive) {
            throw createError(400, 'Vehicle is not active (e.g. scraped).');
        }

        if (ownership.transferRequests.length > 0) {
            throw createError(400, 'Vehicle ownership transfer is currently pending.');
        }

        // 2. Validate bounds based on contract limits if passed=true
        if (data.passed) {
            if (data.co > 10.00) throw createError(400, 'CO cannot exceed 10.00% for a passing test');
            if (data.hc > 300) throw createError(400, 'HC cannot exceed 300 ppm for a passing test');
            if (data.smoke > 75.0) throw createError(400, 'Smoke cannot exceed 75.0% for a passing test');
            
            if (!data.expiryDate) throw createError(400, 'Expiry date required for passing test');
            const expiryTime = Math.floor(new Date(data.expiryDate).getTime() / 1000);
            if (expiryTime <= Math.floor(Date.now() / 1000)) {
                throw createError(400, 'Expiry date must be in the future.');
            }
        }

        // 3. Scale values for contract
        // CO: 1.05% -> 105
        // HC: 150ppm -> 150
        // Smoke: 60.5% -> 605
        const coScaled = Math.round(data.co * 100);
        const hcScaled = Math.round(data.hc); // already int, just ensuring type
        const smokeScaled = Math.round(data.smoke * 10);

        const expiryUnix = data.passed && data.expiryDate ? Math.floor(new Date(data.expiryDate).getTime() / 1000) : 0;

        // 4. Submit to Blockchain
        // issuePUC(uint256 ownTid, uint32 expiryDate, uint16 co, uint16 hc, uint16 smoke, bool passed)
        const args = [
            ownTidBigInt.toString(),
            expiryUnix,
            coScaled,
            hcScaled,
            smokeScaled,
            data.passed
        ];

        let txHash: string;
        try {
            txHash = await BlockchainManager.submitEntityTx(
                pucEntityId,
                EntityType.PUC_CENTER,
                'issuePUC',
                args
            );
        } catch (error: unknown) {
            const parsedError = parseEthersError(error);
            logger.error(
                { err: parsedError, ownTid: data.ownTid },
                'Blockchain issuePUC failed'
            );
            throw createError(400, `Blockchain Error: ${parsedError}`);
        }

        // 5. Track PENDING transaction
        return pucRepository.createPendingPucTx({
            ownershipId: ownership.id,
            ownTid: ownTidBigInt,
            pucEntityId,
            memberId,
            co: coScaled,
            hc: hcScaled,
            smoke: smokeScaled,
            passed: data.passed,
            expiryDate: data.passed && data.expiryDate ? new Date(data.expiryDate) : new Date(0),
            ownerUserId: ownership.ownerUserId,
            ownerWallet: ownership.ownerWallet,
            txHash
        });
    },

    async markExpired(pucEntityId: string, memberId: string, certIdStr: string) {
        const cert = await pucRepository.findCertificateById(certIdStr);
        
        if (!cert || !cert.certId) {
            throw createError(404, 'Certificate not found or not yet synced with blockchain.');
        }

        if (cert.pucEntityId !== pucEntityId) {
            throw createError(403, 'Only the issuing PUC center can mark this certificate as expired.');
        }

        if (cert.status === PucStatus.EXPIRED) {
            throw createError(400, 'Certificate is already expired.');
        }

        if (cert.expiryDate.getTime() >= Date.now()) {
            throw createError(400, 'Certificate has not reached its expiration date yet.');
        }

        let txHash: string;
        try {
            txHash = await BlockchainManager.submitEntityTx(
                pucEntityId,
                EntityType.PUC_CENTER,
                'markExpired',
                [cert.certId.toString()]
            );
        } catch (error: unknown) {
            const parsedError = parseEthersError(error);
            logger.error(
                { err: parsedError, certId: cert.certId.toString() },
                'Blockchain markExpired failed'
            );
            throw createError(400, `Blockchain Error: ${parsedError}`);
        }

        return pucRepository.createExpireTx({
            certId: cert.certId,
            pucEntityId,
            memberId,
            txHash
        });
    },

    async listCertificates(pucEntityId: string, query: ListPucQuery) {
        const ownTid = query.ownTid ? BigInt(query.ownTid) : undefined;
        return pucRepository.listCertificates(
            pucEntityId,
            query.page,
            query.limit,
            query.status as PucStatus | undefined,
            ownTid
        );
    },

    async getCertificateDetails(certId: string) {
        const cert = await pucRepository.findCertificateById(certId);
        if (!cert) throw createError(404, 'Certificate not found.');
        return cert;
    },

    async getVehicleCertificate(ownTidStr: string) {
        const ownTid = BigInt(ownTidStr);
        const cert = await pucRepository.findLatestValidPucByOwnTid(ownTid);
        if (!cert) throw createError(404, 'No valid passing PUC certificate found for this vehicle.');
        return cert;
    }
};
