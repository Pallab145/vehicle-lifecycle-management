import createError from 'http-errors';
import { govRepository } from './gov.repository';
import type { ListGlobalChallansQuery } from './gov.schema';
import { adminService } from '@/modules/admin/admin.service';
import { ChallanStatus, TxActionType } from '@/generated/prisma/client';
import { ethers } from 'ethers';
import ChallanAbi from '@/abi/ChallanContract.json';
import { env } from '@/config/env';

export const govService = {
    /**
     * Admin overrides and cancels a challan. (Multisig Governance Action)
     */
    async adminCancelChallan(
        challanIdRaw: string,
        _govEntityId: string,
        memberId: string
    ) {
        const challanId = BigInt(challanIdRaw);

        // 1. Find Challan
        const challan = await govRepository.findChallanByOnChainId(challanId);
        if (!challan) {
            throw createError(404, 'Challan not found.');
        }

        // 2. State Checks
        if (challan.status === ChallanStatus.PAID) {
            throw createError(400, 'Cannot cancel a challan that has already been paid.');
        }

        if (challan.status === ChallanStatus.CANCELLED) {
            throw createError(400, 'Challan is already cancelled.');
        }

        if (!challan.ownTid) {
            throw createError(400, 'Challan record is incomplete (missing ownTid).');
        }

        // 3. Create Safe Proposal for adminCancelChallan(uint256,uint64)
        const iface = new ethers.Interface(ChallanAbi);
        const calldata = iface.encodeFunctionData('adminCancelChallan', [challan.ownTid, challanId]);

        const proposal = await adminService.createProposal({
            to: env.CONTRACT_CHALLAN_ADDRESS,
            calldata,
            description: `Admin override cancellation of Challan #${challanId} for vehicle ownership #${challan.ownTid}`,
            actionType: TxActionType.CHALLAN_CANCEL,
            proposedById: memberId
        });

        return { 
            proposalId: proposal.id, 
            status: proposal.status,
            message: 'Multisig proposal created for challan cancellation. Signatures required.'
        };
    },

    /**
     * Lists ALL challans across the entire system.
     */
    async listGlobalChallans(query: ListGlobalChallansQuery) {
        return govRepository.listGlobalChallans({
            page: query.page,
            limit: query.limit,
            status: query.status,
            policeEntityId: query.policeEntityId,
            violatorUserId: query.violatorUserId,
            ownTid: query.ownTid ? BigInt(query.ownTid) : undefined,
            challanId: query.challanId ? BigInt(query.challanId) : undefined
        });
    }
};
