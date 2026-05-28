import { Router } from 'express';
import { b2bMemberController } from './b2b-member.controller';
import { requireAuth } from '@/middlewares/requireAuth';
import { requireB2B } from '@/middlewares/requireB2B';
import { requireRole } from '@/middlewares/rbac';
import { MemberRole } from '@/generated/prisma/client';

const router = Router();

// Apply global middlewares to all routes in this file
router.use(requireAuth);
router.use(requireB2B);

// 1. List all members in the caller's entity
router.get('/', b2bMemberController.listMembers);

// 2. Get specific member details
router.get('/:id', b2bMemberController.getMemberDetails);

// 3. Create a new member (Requires OWNER or ADMIN)
router.post(
    '/',
    requireRole([MemberRole.OWNER, MemberRole.ADMIN]),
    b2bMemberController.createMember
);

// 4. Update member role (Requires OWNER or ADMIN)
router.patch(
    '/:id/role',
    requireRole([MemberRole.OWNER, MemberRole.ADMIN]),
    b2bMemberController.updateMemberRole
);

// 5. Update member status (Requires OWNER or ADMIN)
router.patch(
    '/:id/status',
    requireRole([MemberRole.OWNER, MemberRole.ADMIN]),
    b2bMemberController.updateMemberStatus
);

export default router;
