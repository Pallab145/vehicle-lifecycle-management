import { z } from 'zod';

export const VerifyKycSchema = z.object({
    documentType: z.enum(['AADHAAR', 'DRIVING_LICENSE', 'PASSPORT']),
    documentNumber: z.string().min(5, 'Document number is too short').max(50),
    name: z.string().min(2, 'Name must be at least 2 characters').max(100),
    phone: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format. Include country code (e.g., +91).'),
    email: z.string().email('Invalid email address').optional(),
});

export type VerifyKycInput = z.infer<typeof VerifyKycSchema>;
