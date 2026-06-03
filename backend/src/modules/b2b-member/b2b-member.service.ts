import crypto from 'crypto';
import bcrypt from 'bcrypt';
import createError from 'http-errors';
import { MemberRole } from '@/generated/prisma/client';
import { b2bMemberRepository } from './b2b-member.repository';
import { emailService } from '../email/email.service';
import type { CallerIdentity } from '@/types';
import type { CreateMemberInput, MemberQueryInput, ChangePasswordInput } from './b2b-member.schema';
import { logger } from '@/lib/logger';
import prisma from '@/lib/prisma';

/**
 * Validates if the caller is authorized to modify the target role based on hierarchy.
 */
function assertRoleHierarchy(callerRole: MemberRole, targetRole: MemberRole) {
    if (callerRole === MemberRole.OWNER) {
        return; // OWNER can modify anyone
    }
    
    if (callerRole === MemberRole.ADMIN) {
        if (targetRole === MemberRole.OWNER || targetRole === MemberRole.ADMIN) {
            throw createError(403, `Hierarchy Error: An ADMIN cannot modify a member with the ${targetRole} role.`);
        }
        return; // ADMIN can modify OPERATOR and VIEWER
    }

    throw createError(403, 'Hierarchy Error: Insufficient privileges to modify roles.');
}

export const b2bMemberService = {
    async createMember(input: CreateMemberInput, caller: CallerIdentity) {
        const entityId = caller.entityId!;
        
        // 1. Hierarchy Check: Caller must be allowed to create a user with `input.role`
        assertRoleHierarchy(caller.role as MemberRole, input.role);

        // 2. Check if email already exists system-wide
        const existing = await b2bMemberRepository.findByEmail(input.email);
        if (existing) {
            throw createError(409, 'A member with this email already exists.');
        }

        // 3. Generate secure temporary password
        const tempPassword = crypto.randomBytes(6).toString('hex');
        const passwordHash = await bcrypt.hash(tempPassword, 10);

        // 4. Create member
        const member = await b2bMemberRepository.create({
            entityId,
            email: input.email,
            name: input.name,
            role: input.role,
            passwordHash,
            isActive: true
        });

        // 5. Send welcome email with temp password
        // The service fetches the entity name to personalize the email
        const entity = await prisma.b2BEntity.findUnique({ where: { id: entityId } });
        try {
            await emailService.sendWelcomeInstitutionalEmail(
                member.email,
                member.name,
                entity?.name || 'Your Institution',
                member.role,
                tempPassword
            );
        } catch (err) {
            logger.error({ err, email: member.email }, 'Failed to send welcome email to new B2B member');
            // We don't throw here to avoid rolling back the user creation,
            // but in a production system we'd probably queue this.
        }

        const { passwordHash: _ph, ...safeMember } = member;
        return safeMember;
    },

    async listMembers(caller: CallerIdentity, query: MemberQueryInput) {
        return b2bMemberRepository.listByEntity(caller.entityId!, query);
    },

    async getMemberDetails(memberId: string, caller: CallerIdentity) {
        const member = await b2bMemberRepository.findByIdAndEntity(memberId, caller.entityId!);
        if (!member) throw createError(404, 'Member not found');

        const { passwordHash: _ph, ...safeMember } = member;
        return safeMember;
    },

    async updateMemberRole(memberId: string, newRole: MemberRole, caller: CallerIdentity) {
        if (memberId === caller.sub) {
            throw createError(400, 'You cannot modify your own role.');
        }

        const targetMember = await b2bMemberRepository.findByIdAndEntity(memberId, caller.entityId!);
        if (!targetMember) throw createError(404, 'Member not found');

        // 1. Check if caller can modify the target's CURRENT role
        assertRoleHierarchy(caller.role as MemberRole, targetMember.role);
        
        // 2. Check if caller can assign the target's NEW role
        assertRoleHierarchy(caller.role as MemberRole, newRole);

        const updated = await b2bMemberRepository.update(memberId, { role: newRole });
        return updated;
    },

    async toggleMemberStatus(memberId: string, isActive: boolean, caller: CallerIdentity) {
        if (memberId === caller.sub) {
            throw createError(400, 'You cannot deactivate or activate yourself.');
        }

        const targetMember = await b2bMemberRepository.findByIdAndEntity(memberId, caller.entityId!);
        if (!targetMember) throw createError(404, 'Member not found');

        // Check hierarchy to prevent ADMINs from deactivating OWNERs
        assertRoleHierarchy(caller.role as MemberRole, targetMember.role);

        const updated = await b2bMemberRepository.update(memberId, { isActive });
        return updated;
    },

    async forceResetPassword(memberId: string, caller: CallerIdentity) {
        if (memberId === caller.sub) {
            throw createError(400, 'You cannot force reset your own password. Use the normal profile settings.');
        }

        const targetMember = await b2bMemberRepository.findByIdAndEntity(memberId, caller.entityId!);
        if (!targetMember) throw createError(404, 'Member not found');

        // Check hierarchy to prevent ADMINs from resetting OWNERs passwords
        assertRoleHierarchy(caller.role as MemberRole, targetMember.role);

        // Generate secure temporary password
        const tempPassword = crypto.randomBytes(6).toString('hex');
        const passwordHash = await bcrypt.hash(tempPassword, 10);

        await prisma.b2BMember.update({
            where: { id: memberId },
            data: { passwordHash }
        });

        // (Optional) Send email notification
        try {
            await emailService.sendPasswordResetOtp(targetMember.email, `Admin Reset: ${tempPassword}`);
        } catch (err) {
            logger.error({ err, email: targetMember.email }, 'Failed to send admin password reset email');
        }

        return { member: targetMember, tempPassword };
    },

    async changePassword(input: ChangePasswordInput, caller: CallerIdentity) {
        const member = await prisma.b2BMember.findUnique({
            where: { id: caller.sub }
        });

        if (!member) {
            throw createError(404, 'Member not found');
        }

        const isMatch = await bcrypt.compare(input.oldPassword, member.passwordHash);
        if (!isMatch) {
            throw createError(401, 'Incorrect old password');
        }

        const newPasswordHash = await bcrypt.hash(input.newPassword, 10);

        await prisma.b2BMember.update({
            where: { id: member.id },
            data: { passwordHash: newPasswordHash }
        });

        return true;
    }
};
