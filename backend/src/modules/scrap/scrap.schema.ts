import { z } from 'zod';

export const scrapVehicleParamsSchema = z.object({
    params: z.object({
        dvpId: z.string().min(1, 'Digital Vehicle Passport ID (dvpId) is required').regex(/^\d+$/, 'dvpId must be a numeric string')
    })
});

export const listScrappedSchema = z.object({
    query: z.object({
        page: z.string().regex(/^\d+$/).default('1').transform(Number),
        limit: z.string().regex(/^\d+$/).default('20').transform(Number),
        vinHash: z.string().optional()
    })
});

export type ScrapVehicleParams = z.infer<typeof scrapVehicleParamsSchema>['params'];
export type ListScrappedQuery = z.infer<typeof listScrappedSchema>['query'];
