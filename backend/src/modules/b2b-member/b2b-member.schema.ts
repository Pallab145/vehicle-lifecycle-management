import { z } from 'zod';
import { MemberRole } from '@/generated/prisma/client';
import { sanitizeSearchInput } from '@/utils/sanitizer';

export const createMemberSchema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters').max(50, 'Name is too long'),
    email: z.string().email('Invalid email address').toLowerCase().trim(),
    role: z.nativeEnum(MemberRole).default(MemberRole.OPERATOR),
});

export const updateMemberRoleSchema = z.object({
    role: z.nativeEnum(MemberRole),
});

export const updateMemberStatusSchema = z.object({
    isActive: z.boolean(),
});

export const memberQuerySchema = z.object({
    page: z.string().optional().default('1').transform(val => parseInt(val, 10)),
    limit: z.string().optional().default('10').transform(val => parseInt(val, 10)),
    search: z.string().optional().transform(val => sanitizeSearchInput(val)),
    role: z.nativeEnum(MemberRole).optional(),
    isActive: z.string().optional().transform(val => {
        if (val === 'true') return true;
        if (val === 'false') return false;
        return undefined;
    })
});

export type CreateMemberInput = z.infer<typeof createMemberSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
export type UpdateMemberStatusInput = z.infer<typeof updateMemberStatusSchema>;
export type MemberQueryInput = z.infer<typeof memberQuerySchema>;
