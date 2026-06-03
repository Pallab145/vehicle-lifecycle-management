import type { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { b2bMemberService } from './b2b-member.service';
import { createMemberSchema, updateMemberRoleSchema, updateMemberStatusSchema, memberQuerySchema, ChangePasswordSchema } from './b2b-member.schema';

export const b2bMemberController = {
    createMember: asyncHandler(async (req: Request, res: Response) => {
        const input = createMemberSchema.parse(req.body);
        const member = await b2bMemberService.createMember(input, req.caller!);

        res.status(201).json({
            success: true,
            message: 'B2B Member created successfully. A welcome email has been sent with their temporary password.',
            member: member
        });
    }),

    listMembers: asyncHandler(async (req: Request, res: Response) => {
        const query = memberQuerySchema.parse(req.query);
        const result = await b2bMemberService.listMembers(req.caller!, query);

        res.status(200).json({
            success: true,
            members: result.data,
            total: result.meta.total,
            page: result.meta.page,
            limit: result.meta.limit,
            totalPages: result.meta.totalPages
        });
    }),

    getMemberDetails: asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params as { id: string };
        const member = await b2bMemberService.getMemberDetails(id, req.caller!);

        res.status(200).json({
            success: true,
            member: member
        });
    }),

    updateMemberRole: asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params as { id: string };
        const { role } = updateMemberRoleSchema.parse(req.body);
        
        const member = await b2bMemberService.updateMemberRole(id, role, req.caller!);

        res.status(200).json({
            success: true,
            message: 'Member role updated successfully.',
            member: member
        });
    }),

    updateMemberStatus: asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params as { id: string };
        const { isActive } = updateMemberStatusSchema.parse(req.body);

        const member = await b2bMemberService.toggleMemberStatus(id, isActive, req.caller!);

        res.status(200).json({
            success: true,
            message: `Member successfully ${isActive ? 'activated' : 'deactivated'}.`,
            member: member
        });
    }),

    resetMemberPassword: asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params as { id: string };
        const result = await b2bMemberService.forceResetPassword(id, req.caller!);

        res.status(200).json({
            success: true,
            message: 'Password successfully reset.',
            member: result.member,
            tempPassword: result.tempPassword
        });
    }),

    changePassword: asyncHandler(async (req: Request, res: Response) => {
        const input = ChangePasswordSchema.parse(req.body);
        await b2bMemberService.changePassword(input, req.caller!);

        res.status(200).json({
            success: true,
            message: 'Password successfully changed.'
        });
    })
};
