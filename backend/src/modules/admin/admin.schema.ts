import { z } from 'zod';
import { SafeProposalStatus } from '@/generated/prisma/client';

export const ListProposalsQuerySchema = z.object({
  query: z.object({
    page: z.string().optional().default('1'),
    limit: z.string().optional().default('20'),
    status: z.nativeEnum(SafeProposalStatus).optional(),
  }),
});

export const ProposalIdParamSchema = z.object({
  params: z.object({
    id: z.string().cuid('Invalid proposal ID'),
  }),
});

export const SignProposalSchema = z.object({
  params: z.object({
    id: z.string().cuid('Invalid proposal ID'),
  }),
  body: z.object({
    signature: z.string().min(1, 'Signature is required').startsWith('0x', 'Signature must start with 0x'),
  }),
});
