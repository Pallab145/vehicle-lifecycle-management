import prisma from '@/lib/prisma';
import { SyncStatus, TxActionType, TxSource, PucStatus } from '@/generated/prisma/client';

interface CreatePendingPucParams {
    ownershipId: string;
    ownTid: bigint;
    pucEntityId: string;
    memberId: string;
    co: number;
    hc: number;
    smoke: number;
    passed: boolean;
    expiryDate: Date;
    ownerUserId: string | null;
    ownerWallet: string;
    txHash: string;
}

interface CreateExpirePucParams {
    certId: bigint;
    pucEntityId: string;
    memberId: string;
    txHash: string;
}

export const pucRepository = {
    async createPendingPucTx(data: CreatePendingPucParams) {
        return prisma.$transaction(async (db) => {
            // Create pending PUC record
            const cert = await db.pucCertificate.create({
                data: {
                    ownershipId: data.ownershipId,
                    ownTid: data.ownTid,
                    pucEntityId: data.pucEntityId,
                    co: data.co,
                    hc: data.hc,
                    smoke: data.smoke,
                    passed: data.passed,
                    status: PucStatus.VALID, // Even if passed=false, record is mathematically valid historical failure
                    issueDate: new Date(), // Local temp date, overwritten by indexer
                    expiryDate: data.expiryDate,
                    ownerUserId: data.ownerUserId,
                    ownerWallet: data.ownerWallet,
                    createdByMemberId: data.memberId
                }
            });

            // Track transaction for reconciliation
            await db.blockchainTransaction.create({
                data: {
                    txHash: data.txHash,
                    actionType: TxActionType.PUC_ISSUE,
                    txSource: TxSource.MEMBER,
                    status: SyncStatus.PENDING,
                    initiatorMemberId: data.memberId,
                    b2bEntityId: data.pucEntityId,
                    pucId: cert.id
                }
            });

            return cert;
        });
    },

    async createExpireTx(data: CreateExpirePucParams) {
        return prisma.$transaction(async (db) => {
            const cert = await db.pucCertificate.findUniqueOrThrow({ where: { certId: data.certId } });

            await db.blockchainTransaction.create({
                data: {
                    txHash: data.txHash,
                    actionType: TxActionType.PUC_EXPIRE,
                    txSource: TxSource.MEMBER,
                    status: SyncStatus.PENDING,
                    initiatorMemberId: data.memberId,
                    b2bEntityId: data.pucEntityId,
                    pucId: cert.id
                }
            });

            return cert;
        });
    },

    async listCertificates(entityId: string, page: number, limit: number, status?: PucStatus, ownTid?: bigint) {
        const skip = (page - 1) * limit;
        const where: any = { pucEntityId: entityId };

        if (status) where.status = status;
        if (ownTid) where.ownTid = ownTid;

        const [total, certificates] = await Promise.all([
            prisma.pucCertificate.count({ where }),
            prisma.pucCertificate.findMany({
                where,
                skip,
                take: limit,
                orderBy: { issueDate: 'desc' },
                include: {
                    ownership: { include: { passport: true } }
                }
            })
        ]);

        return { total, pages: Math.ceil(total / limit), certificates };
    },

    async findLatestValidPucByOwnTid(ownTid: bigint) {
        return prisma.pucCertificate.findFirst({
            where: {
                ownTid,
                passed: true,
                status: PucStatus.VALID
            },
            orderBy: { issueDate: 'desc' },
            include: {
                ownership: { include: { passport: true } },
                pucEntity: true
            }
        });
    },

    async findCertificateById(idOrCertId: string) {
        // Find by internal ID or on-chain certId
        return prisma.pucCertificate.findFirst({
            where: {
                OR: [
                    { id: idOrCertId },
                    ...(isNaN(Number(idOrCertId)) ? [] : [{ certId: BigInt(idOrCertId) }])
                ]
            },
            include: {
                ownership: { include: { passport: true } },
                pucEntity: true
            }
        });
    }
};
