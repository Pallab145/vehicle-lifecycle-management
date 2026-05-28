-- DropForeignKey
ALTER TABLE "b2b_members" DROP CONSTRAINT "b2b_members_entityId_fkey";

-- DropForeignKey
ALTER TABLE "challans" DROP CONSTRAINT "challans_ownershipId_fkey";

-- DropForeignKey
ALTER TABLE "entity_signing_keys" DROP CONSTRAINT "entity_signing_keys_createdById_fkey";

-- DropForeignKey
ALTER TABLE "entity_signing_keys" DROP CONSTRAINT "entity_signing_keys_entityId_fkey";

-- DropForeignKey
ALTER TABLE "insurance_policies" DROP CONSTRAINT "insurance_policies_ownershipId_fkey";

-- DropForeignKey
ALTER TABLE "loan_records" DROP CONSTRAINT "loan_records_ownershipId_fkey";

-- DropForeignKey
ALTER TABLE "otp_codes" DROP CONSTRAINT "otp_codes_memberId_fkey";

-- DropForeignKey
ALTER TABLE "puc_certificates" DROP CONSTRAINT "puc_certificates_ownershipId_fkey";

-- DropForeignKey
ALTER TABLE "refresh_tokens" DROP CONSTRAINT "refresh_tokens_memberId_fkey";

-- DropForeignKey
ALTER TABLE "refresh_tokens" DROP CONSTRAINT "refresh_tokens_userId_fkey";

-- DropForeignKey
ALTER TABLE "transfer_requests" DROP CONSTRAINT "transfer_requests_ownershipId_fkey";

-- DropForeignKey
ALTER TABLE "vehicle_ownerships" DROP CONSTRAINT "vehicle_ownerships_passportId_fkey";

-- AlterTable
ALTER TABLE "entity_signing_keys" ALTER COLUMN "createdById" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "b2b_members" ADD CONSTRAINT "b2b_members_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "b2b_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_signing_keys" ADD CONSTRAINT "entity_signing_keys_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "b2b_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_signing_keys" ADD CONSTRAINT "entity_signing_keys_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "b2b_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otp_codes" ADD CONSTRAINT "otp_codes_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "b2b_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "b2b_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_ownerships" ADD CONSTRAINT "vehicle_ownerships_passportId_fkey" FOREIGN KEY ("passportId") REFERENCES "vehicle_passports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_ownershipId_fkey" FOREIGN KEY ("ownershipId") REFERENCES "vehicle_ownerships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challans" ADD CONSTRAINT "challans_ownershipId_fkey" FOREIGN KEY ("ownershipId") REFERENCES "vehicle_ownerships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_ownershipId_fkey" FOREIGN KEY ("ownershipId") REFERENCES "vehicle_ownerships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "puc_certificates" ADD CONSTRAINT "puc_certificates_ownershipId_fkey" FOREIGN KEY ("ownershipId") REFERENCES "vehicle_ownerships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_records" ADD CONSTRAINT "loan_records_ownershipId_fkey" FOREIGN KEY ("ownershipId") REFERENCES "vehicle_ownerships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
