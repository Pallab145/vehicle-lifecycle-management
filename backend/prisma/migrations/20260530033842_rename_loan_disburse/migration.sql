/*
  Warnings:

  - The values [LOAN_DISBURSE] on the enum `TxActionType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `ownTid` on the `loan_records` table. All the data in the column will be lost.
  - You are about to drop the column `ownershipId` on the `loan_records` table. All the data in the column will be lost.
  - Added the required column `passportId` to the `loan_records` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "TxActionType_new" AS ENUM ('B2B_ENTITY_REGISTER', 'B2B_ENTITY_TOGGLE', 'VEHICLE_MINT', 'VEHICLE_SCRAP', 'VEHICLE_ASSIGN_DEALER', 'VEHICLE_REGISTER_RTO', 'TRANSFER_INIT', 'TRANSFER_APPROVE_BUYER', 'TRANSFER_APPROVE_RTO', 'TRANSFER_CANCEL', 'TRADE_CERT_ISSUE', 'TRADE_CERT_REVOKE', 'CHALLAN_ISSUE', 'CHALLAN_PAY', 'CHALLAN_CANCEL', 'INSURANCE_ISSUE', 'INSURANCE_CLAIM', 'INSURANCE_EXPIRE', 'PUC_ISSUE', 'PUC_EXPIRE', 'LOAN_REG', 'LOAN_CLEAR', 'LOAN_REFINANCE', 'LOAN_CANCEL_PENDING', 'SAFE_EXEC');
ALTER TABLE "blockchain_transactions" ALTER COLUMN "actionType" TYPE "TxActionType_new" USING ("actionType"::text::"TxActionType_new");
ALTER TABLE "safe_proposals" ALTER COLUMN "actionType" TYPE "TxActionType_new" USING ("actionType"::text::"TxActionType_new");
ALTER TYPE "TxActionType" RENAME TO "TxActionType_old";
ALTER TYPE "TxActionType_new" RENAME TO "TxActionType";
DROP TYPE "public"."TxActionType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "loan_records" DROP CONSTRAINT "loan_records_ownershipId_fkey";

-- DropIndex
DROP INDEX "loan_records_ownTid_idx";

-- AlterTable
ALTER TABLE "loan_records" DROP COLUMN "ownTid",
DROP COLUMN "ownershipId",
ADD COLUMN     "passportId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "loan_records_passportId_idx" ON "loan_records"("passportId");

-- AddForeignKey
ALTER TABLE "loan_records" ADD CONSTRAINT "loan_records_passportId_fkey" FOREIGN KEY ("passportId") REFERENCES "vehicle_passports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
