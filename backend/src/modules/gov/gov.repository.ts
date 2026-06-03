import prisma from '@/lib/prisma';
import { Prisma, ChallanStatus } from '@/generated/prisma/client';

export const govRepository = {
    /**
     * Retrieves a challan by its on-chain ID.
     */
    async findChallanByOnChainId(challanId: bigint) {
        return prisma.challan.findUnique({
            where: { challanId }
        });
    },


    /**
     * Lists ALL challans globally across the system, with advanced filtering for the Government.
     */
    async listGlobalChallans(params: {
        page: number;
        limit: number;
        status?: ChallanStatus;
        policeEntityId?: string;
        violatorUserId?: string;
        ownTid?: bigint;
        challanId?: bigint;
    }) {
        const { page, limit, status, policeEntityId, violatorUserId, ownTid, challanId } = params;
        const skip = (page - 1) * limit;

        const where: Prisma.ChallanWhereInput = {
            ...(status && { status }),
            ...(policeEntityId && { policeEntityId }),
            ...(violatorUserId && { violatorUserId }),
            ...(ownTid !== undefined && { ownTid }),
            ...(challanId !== undefined && { challanId })
        };

        const [total, items] = await Promise.all([
            prisma.challan.count({ where }),
            prisma.challan.findMany({
                where,
                skip,
                take: limit,
                orderBy: { issuedAt: 'desc' },
                include: {
                    policeEntity: { select: { name: true, code: true } },
                    ownership: {
                        select: {
                            ownerWallet: true,
                            passport: { select: { vinHash: true } }
                        }
                    }
                }
            })
        ]);

        return {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            data: items
        };
    },

    /**
     * Aggregates system-wide statistics for the Government Dashboard
     */
    async getSystemAnalytics() {
        const [
            vehiclesMfg,
            vehiclesActive,
            vehiclesScrapped,
            challansPaidAggr,
            challansPendingAggr,
            entitiesGroups,
            recentTransfers
        ] = await Promise.all([
            prisma.vehiclePassport.count({ where: { status: 'NOT_REG' } }),
            prisma.vehiclePassport.count({ where: { status: 'ACTIVE' } }),
            prisma.vehiclePassport.count({ where: { status: 'SCRAPPED' } }),
            
            prisma.challan.aggregate({
                _sum: { amount: true },
                where: { status: 'PAID' }
            }),
            prisma.challan.aggregate({
                _sum: { amount: true },
                where: { status: 'PENDING' }
            }),

            prisma.b2BEntity.groupBy({
                by: ['type'],
                _count: { _all: true },
                where: { isActive: true }
            }),

            // Count transfers completed in the last 30 days
            prisma.transferRequest.count({
                where: {
                    status: 'RTO_APPROVED',
                    completedDate: {
                        gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
                    }
                }
            })
        ]);

        return {
            vehicles: {
                manufactured: vehiclesMfg,
                active: vehiclesActive,
                scrapped: vehiclesScrapped,
                total: vehiclesMfg + vehiclesActive + vehiclesScrapped
            },
            fines: {
                collectedWei: challansPaidAggr._sum.amount?.toString() || "0",
                pendingWei: challansPendingAggr._sum.amount?.toString() || "0",
            },
            institutions: entitiesGroups.map(g => ({
                type: g.type,
                count: g._count._all
            })),
            recentActivity: {
                transfersLast30Days: recentTransfers
            }
        };
    },

    /**
     * Aggregates recent activity across the network for the Global Audit Logs
     */
    async getGlobalAuditLogs(limit: number = 50, page: number = 1) {
        const maxTake = limit * page;

        const [
            passports,
            ownerships,
            challans,
            insurances,
            pucs,
            transfers
        ] = await Promise.all([
            prisma.vehiclePassport.findMany({ take: maxTake, orderBy: { mfgDate: 'desc' }, include: { mfgEntity: true } }),
            prisma.ownershipToken.findMany({ take: maxTake, orderBy: { mintDate: 'desc' }, include: { rtoEntity: true } }),
            prisma.challan.findMany({ take: maxTake, orderBy: { issuedAt: 'desc' }, include: { policeEntity: true } }),
            prisma.insurancePolicy.findMany({ take: maxTake, orderBy: { issuedAt: 'desc' }, include: { insurerEntity: true } }),
            prisma.pucCertificate.findMany({ take: maxTake, orderBy: { issuedAt: 'desc' }, include: { pucCenterEntity: true } }),
            prisma.transferRequest.findMany({ take: maxTake, orderBy: { reqDate: 'desc' }, include: { rtoEntity: true } })
        ]);

        const events = [];

        for (const p of passports) {
            events.push({
                id: `dvp_${p.dvpId}`,
                date: p.mfgDate,
                type: 'VEHICLE_MINTED',
                title: 'New Vehicle Manufactured',
                description: `Vehicle DVP ${p.dvpId?.toString() || 'Pending'} (${p.make} ${p.model}) was manufactured.`,
                entityName: p.mfgEntity?.name || 'Unknown Manufacturer',
                entityType: 'MANUFACTURER',
                metadata: { vinHash: p.vinHash }
            });
        }

        for (const o of ownerships) {
            events.push({
                id: `own_${o.ownTid}`,
                date: o.mintDate,
                type: 'OWNERSHIP_MINTED',
                title: 'Vehicle Registered',
                description: `Ownership NFT ${o.ownTid?.toString() || 'Pending'} minted for vehicle DVP ${o.dvpId?.toString() || 'Unknown'}.`,
                entityName: o.rtoEntity?.name || 'Unknown RTO',
                entityType: 'RTO',
                metadata: { ownerWallet: o.ownerWallet }
            });
        }

        for (const c of challans) {
            events.push({
                id: `chal_${c.id}`,
                date: c.issuedAt,
                type: 'CHALLAN_ISSUED',
                title: 'Challan Issued',
                description: `Challan ${c.challanId?.toString() || 'Pending'} issued for amount ₹${(Number(c.amount) / 1e18).toFixed(2)}.`,
                entityName: c.policeEntity?.name || 'Unknown Police',
                entityType: 'POLICE',
                metadata: { status: c.status }
            });
        }

        for (const i of insurances) {
            events.push({
                id: `ins_${i.id}`,
                date: i.issuedAt,
                type: 'INSURANCE_ISSUED',
                title: 'Insurance Policy Issued',
                description: `Policy ${i.policyId?.toString() || 'Pending'} issued for vehicle NFT ${i.ownTid?.toString() || 'Unknown'}.`,
                entityName: i.insurerEntity?.name || 'Unknown Insurer',
                entityType: 'INSURANCE',
                metadata: { status: i.status }
            });
        }

        for (const p of pucs) {
            events.push({
                id: `puc_${p.id}`,
                date: p.issuedAt,
                type: 'PUC_ISSUED',
                title: 'PUC Certificate Issued',
                description: `PUC ${p.pucId?.toString() || 'Pending'} issued for vehicle NFT ${p.ownTid?.toString() || 'Unknown'}.`,
                entityName: p.pucCenterEntity?.name || 'Unknown PUC Center',
                entityType: 'PUC_CENTER',
                metadata: { status: p.status }
            });
        }

        for (const t of transfers) {
            events.push({
                id: `tr_${t.id}`,
                date: t.reqDate,
                type: 'TRANSFER_INITIATED',
                title: 'Ownership Transfer Requested',
                description: `Transfer requested from ${t.sellerWallet.substring(0, 8)} to ${t.buyerWallet.substring(0, 8)}.`,
                entityName: t.rtoEntity?.name || 'Pending RTO',
                entityType: 'CITIZEN/RTO',
                metadata: { status: t.status }
            });

            if (t.completedDate) {
                events.push({
                    id: `tr_comp_${t.id}`,
                    date: t.completedDate,
                    type: 'TRANSFER_COMPLETED',
                    title: 'Ownership Transfer Completed',
                    description: `Transfer request ${t.reqId?.toString() || ''} approved.`,
                    entityName: t.rtoEntity?.name || 'Unknown RTO',
                    entityType: 'RTO',
                    metadata: { status: t.status }
                });
            }
        }

        events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        const total = events.length;
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedEvents = events.slice(startIndex, endIndex);

        return {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            data: paginatedEvents
        };
    }
};
