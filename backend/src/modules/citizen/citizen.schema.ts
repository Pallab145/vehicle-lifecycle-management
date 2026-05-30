import { z } from 'zod';

export const VerifyKycSchema = z.object({
    documentType: z.enum(['AADHAAR', 'DRIVING_LICENSE', 'PASSPORT']),
    documentNumber: z.string().min(5, 'Document number is too short').max(50),
    name: z.string().min(2, 'Name must be at least 2 characters').max(100),
    phone: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format. Include country code (e.g., +91).'),
    email: z.string().email('Invalid email address').optional(),
    /// The ID of the RTO this citizen belongs to (chosen from the public RTO list)
    rtoEntityId: z.string().cuid('Invalid RTO ID format').optional()
});

export type VerifyKycInput = z.infer<typeof VerifyKycSchema>;

export const dvpIdParamSchema = z.object({
    params: z.object({
        dvpId: z.string().regex(/^\d+$/, 'DVP ID must be a numeric string')
    })
});

export const ownTidParamSchema = z.object({
    params: z.object({
        ownTid: z.string().regex(/^\d+$/, 'Ownership Token ID must be a numeric string')
    })
});

export const listVehiclesQuerySchema = z.object({
    query: z.object({
        page: z.string().regex(/^\d+$/).optional().transform(val => (val ? parseInt(val, 10) : 1)),
        limit: z.string().regex(/^\d+$/).optional().transform(val => (val ? parseInt(val, 10) : 10))
    })
});
