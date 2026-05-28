import prisma from '@/lib/prisma';
import { EntityType, MemberRole, Prisma } from '@/generated/prisma/client';

export interface CreateEntityTxData {
    entity: {
        type: EntityType;
        code: string;
        name: string;
        walletAddress: string;
        registeredByMemberId: string; // The GOVERNMENT member who created this entity
    };
    signingKey: {
        encryptedPrivateKey: string;
        publicKey: string;
        createdById: string; // The GOVERNMENT member who initialized the key
    };
    adminMember: {
        name: string;
        email: string;
        passwordHash: string;
        role: MemberRole;
    };
}

export const b2bEntityRepository = {
    /**
     * Atomically creates a B2B Entity, generates its cryptographically secured Signing Key,
     * and initializes its first administrative member in a single isolated transaction.
     */
    async createEntityWithAdmin(data: CreateEntityTxData) {
        return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            // 1. Create B2B Entity
            const entity = await tx.b2BEntity.create({
                data: {
                    type: data.entity.type,
                    code: data.entity.code,
                    name: data.entity.name,
                    walletAddress: data.entity.walletAddress,
                    registeredByMemberId: data.entity.registeredByMemberId,
                }
            });

            // 2. Create the first Admin Member belonging to this Entity
            const adminMember = await tx.b2BMember.create({
                data: {
                    entityId: entity.id,
                    email: data.adminMember.email,
                    name: data.adminMember.name,
                    passwordHash: data.adminMember.passwordHash,
                    role: data.adminMember.role,
                    isActive: true,
                }
            });

            // 3. Create the encrypted Relayer Signing Key
            const signingKey = await tx.entitySigningKey.create({
                data: {
                    entityId: entity.id,
                    encryptedPrivateKey: data.signingKey.encryptedPrivateKey,
                    publicKey: data.signingKey.publicKey,
                    createdById: data.signingKey.createdById, // Super admin who created this entity
                }
            });

            return { entity, adminMember, signingKey };
        });
    },

    /**
     * Finds an entity by its unique ID.
     */
    async findById(id: string) {
        return prisma.b2BEntity.findUnique({
            where: { id }
        });
    },

    /**
     * Finds an entity by its short unique code.
     */
    async findByCode(code: string) {
        return prisma.b2BEntity.findUnique({
            where: { code }
        });
    },

    /**
     * Finds an entity by its unique relayer wallet address.
     */
    async findByWalletAddress(walletAddress: string) {
        return prisma.b2BEntity.findUnique({
            where: { walletAddress }
        });
    },

    /**
     * Finds a B2B Member by email.
     */
    async findMemberByEmail(email: string) {
        return prisma.b2BMember.findUnique({
            where: { email }
        });
    },

    /**
     * Fetches a paginated, filtered list of B2B Entities.
     */
    async listEntities(params: { page: number; limit: number; type?: EntityType; search?: string; isActive?: boolean }) {
        const { page, limit, type, search, isActive } = params;
        const skip = (page - 1) * limit;

        const where: Prisma.B2BEntityWhereInput = {};
        
        if (type) where.type = type;
        if (isActive !== undefined) where.isActive = isActive;
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } }
            ];
        }

        const [total, items] = await Promise.all([
            prisma.b2BEntity.count({ where }),
            prisma.b2BEntity.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    signingKey: {
                        select: {
                            publicKey: true, // Omit the encrypted field, just return the public key
                            rotatedAt: true,
                        }
                    },
                    _count: {
                        select: { members: true }
                    }
                }
            })
        ]);

        return {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            items
        };
    }
};
