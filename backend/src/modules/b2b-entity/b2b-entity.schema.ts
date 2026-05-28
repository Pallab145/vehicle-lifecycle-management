import { z } from 'zod';
import { EntityType } from '@/generated/prisma/client';
import { sanitizeSearchInput } from '@/utils/sanitizer';

export const CreateB2BEntitySchema = z.object({
    type: z.nativeEnum(EntityType).refine(
        (val) => val !== EntityType.GOVERNMENT,
        { message: 'Entity type must be RTO, MANUFACTURER, POLICE, INSURANCE, PUC_CENTER, SCRAP_CENTER, or BANK' }
    ),
    code: z.string()
        .min(3, 'Short unique code must be at least 3 characters')
        .max(20, 'Short unique code must not exceed 20 characters')
        .regex(/^[A-Z0-9\-]+$/, 'Short code must only contain uppercase alphanumeric characters and hyphens'),
    name: z.string()
        .min(3, 'Name must be at least 3 characters')
        .max(100, 'Name must not exceed 100 characters')
        .trim(),
    // Nested details for the first administrative staff member
    adminMember: z.object({
        name: z.string().min(2, 'Admin member name must be at least 2 characters').trim(),
        email: z.string().email('Invalid admin member email format').toLowerCase().trim()
    })
});

export const ListB2BEntitySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    type: z.nativeEnum(EntityType).optional(),
    search: z.string().trim().min(1).optional().transform(sanitizeSearchInput),
    isActive: z.coerce.boolean().optional()
});

export const ToggleB2BEntitySchema = z.object({
    isActive: z.boolean()
});

export type CreateB2BEntityInput = z.infer<typeof CreateB2BEntitySchema>;
export type ListB2BEntityInput = z.infer<typeof ListB2BEntitySchema>;
export type ToggleB2BEntityInput = z.infer<typeof ToggleB2BEntitySchema>;
