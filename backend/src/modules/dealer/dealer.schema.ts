import { z } from 'zod';

export const CreateSaleRequestSchema = z.object({
    body: z.object({
        dvpId: z.number().or(z.string().regex(/^\d+$/, "Must be a valid numeric string or number")),
        buyerWallet: z.string().min(42, 'Invalid wallet address format.').max(42)
    })
});

export const ListInventorySchema = z.object({
    query: z.object({
        page: z.string().regex(/^\d+$/).default('1'),
        limit: z.string().regex(/^\d+$/).default('10')
    })
});

export type CreateSaleRequestInput = z.infer<typeof CreateSaleRequestSchema>['body'];
