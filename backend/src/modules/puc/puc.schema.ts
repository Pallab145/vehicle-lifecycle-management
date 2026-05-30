import { z } from 'zod';

export const issuePucSchema = z.object({
    body: z.object({
        ownTid: z.string().min(1, 'Ownership Token ID is required'),
        expiryDate: z.string().datetime({ message: 'Invalid expiry date format' }).optional(),
        co: z.number().min(0, 'CO cannot be negative').max(10, 'CO cannot exceed 10.00%'), // Percentage (e.g. 1.05)
        hc: z.number().int().min(0, 'HC cannot be negative').max(300, 'HC cannot exceed 300 ppm'), // ppm
        smoke: z.number().min(0, 'Smoke cannot be negative').max(75, 'Smoke cannot exceed 75.0%'), // Percentage (e.g. 60.5)
        passed: z.boolean()
    }).refine(data => {
        if (data.passed && !data.expiryDate) {
            return false;
        }
        return true;
    }, {
        message: "Expiry date is required when issuing a passed certificate",
        path: ["expiryDate"]
    })
});

export const markPucExpiredSchema = z.object({
    params: z.object({
        certId: z.string().min(1, 'Certificate ID is required')
    })
});

export const listPucSchema = z.object({
    query: z.object({
        page: z.string().regex(/^\d+$/).default('1').transform(Number),
        limit: z.string().regex(/^\d+$/).default('20').transform(Number),
        status: z.enum(['VALID', 'EXPIRED']).optional(),
        ownTid: z.string().optional()
    })
});

export type IssuePucBody = z.infer<typeof issuePucSchema>['body'];
export type ListPucQuery = z.infer<typeof listPucSchema>['query'];
