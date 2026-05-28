import prisma from '@/lib/prisma';
import type { Prisma } from '@/generated/prisma/client';
import type { MemberQueryInput } from './b2b-member.schema';

export const b2bMemberRepository = {
    async findById(id: string) {
        return prisma.b2BMember.findUnique({
            where: { id }
        });
    },

    async findByIdAndEntity(id: string, entityId: string) {
        return prisma.b2BMember.findFirst({
            where: {
                id,
                entityId
            }
        });
    },

    async findByEmail(email: string) {
        return prisma.b2BMember.findUnique({
            where: { email }
        });
    },

    async create(data: Prisma.B2BMemberUncheckedCreateInput) {
        return prisma.b2BMember.create({ data });
    },

    async listByEntity(entityId: string, query: MemberQueryInput) {
        const { page, limit, search, role, isActive } = query;
        const skip = (page - 1) * limit;

        const where: Prisma.B2BMemberWhereInput = { entityId };

        if (role) {
            where.role = role;
        }

        if (isActive !== undefined) {
            where.isActive = isActive;
        }

        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } }
            ];
        }

        const [total, members] = await Promise.all([
            prisma.b2BMember.count({ where }),
            prisma.b2BMember.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                    isActive: true,
                    lastLoginAt: true,
                    createdAt: true
                }
            })
        ]);

        return {
            data: members,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        };
    },

    async update(id: string, data: Prisma.B2BMemberUpdateInput) {
        return prisma.b2BMember.update({
            where: { id },
            data,
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                isActive: true
            }
        });
    }
};
