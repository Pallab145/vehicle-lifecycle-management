-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('GOVERNMENT', 'RTO', 'MANUFACTURER', 'POLICE', 'INSURANCE', 'PUC_CENTER', 'SCRAP_CENTER', 'BANK');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('OWNER', 'ADMIN', 'OPERATOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('NOT_REG', 'ACTIVE', 'SCRAPPED');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('PENDING', 'BUYER_ACCEPTED', 'RTO_APPROVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ChallanStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InsuranceStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PucStatus" AS ENUM ('VALID', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('ACTIVE', 'CLEARED', 'DEFAULTED');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('PASSWORD_RESET', 'EMAIL_VERIFY', 'TWO_FACTOR');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'MINED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "b2b_entities" (
    "id" TEXT NOT NULL,
    "type" "EntityType" NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "onChainId" BIGINT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "registeredByMemberId" TEXT,

    CONSTRAINT "b2b_entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "b2b_members" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL DEFAULT 'OPERATOR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "b2b_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entity_signing_keys" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "encryptedPrivateKey" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "algorithm" TEXT NOT NULL DEFAULT 'AES-256-GCM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "entity_signing_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_codes" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "userId" TEXT,
    "memberId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedIp" TEXT,
    "deviceId" TEXT,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_passports" (
    "id" TEXT NOT NULL,
    "dvpId" BIGINT,
    "vinHash" TEXT NOT NULL,
    "engineHash" TEXT NOT NULL,
    "chassisHash" TEXT NOT NULL,
    "specsHash" TEXT NOT NULL,
    "status" "VehicleStatus" NOT NULL DEFAULT 'NOT_REG',
    "mfgEntityId" TEXT NOT NULL,
    "mfgDate" TIMESTAMP(3) NOT NULL,
    "dealerWallet" TEXT,
    "dealerUserId" TEXT,
    "scrapEntityId" TEXT,
    "scrapDate" TIMESTAMP(3),
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "blockNumber" BIGINT,
    "blockTimestamp" TIMESTAMP(3),
    "txHash" TEXT,
    "createdByMemberId" TEXT,

    CONSTRAINT "vehicle_passports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_ownerships" (
    "id" TEXT NOT NULL,
    "ownTid" BIGINT,
    "passportId" TEXT NOT NULL,
    "dvpId" BIGINT,
    "rtoEntityId" TEXT NOT NULL,
    "ownerWallet" TEXT NOT NULL,
    "regDate" TIMESTAMP(3) NOT NULL,
    "transferCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "blockNumber" BIGINT,
    "blockTimestamp" TIMESTAMP(3),
    "txHash" TEXT,
    "ownerUserId" TEXT,
    "rtoMemberId" TEXT,

    CONSTRAINT "vehicle_ownerships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfer_requests" (
    "id" TEXT NOT NULL,
    "reqId" BIGINT,
    "ownershipId" TEXT NOT NULL,
    "ownTid" BIGINT,
    "sellerWallet" TEXT NOT NULL,
    "buyerWallet" TEXT NOT NULL,
    "rtoEntityId" TEXT,
    "status" "TransferStatus" NOT NULL DEFAULT 'PENDING',
    "reqDate" TIMESTAMP(3) NOT NULL,
    "completedDate" TIMESTAMP(3),
    "sellerOK" BOOLEAN NOT NULL DEFAULT false,
    "buyerOK" BOOLEAN NOT NULL DEFAULT false,
    "rtoOK" BOOLEAN NOT NULL DEFAULT false,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "blockNumber" BIGINT,
    "blockTimestamp" TIMESTAMP(3),
    "txHashInit" TEXT,
    "txHashResolved" TEXT,
    "sellerUserId" TEXT,
    "buyerUserId" TEXT,
    "rtoApproverMemberId" TEXT,

    CONSTRAINT "transfer_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trade_certs" (
    "id" TEXT NOT NULL,
    "dealerWallet" TEXT NOT NULL,
    "dealerUserId" TEXT,
    "rtoEntityId" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "validTill" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "blockNumber" BIGINT,
    "blockTimestamp" TIMESTAMP(3),
    "txHash" TEXT,
    "createdByMemberId" TEXT,

    CONSTRAINT "trade_certs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challans" (
    "id" TEXT NOT NULL,
    "challanId" BIGINT,
    "ownershipId" TEXT NOT NULL,
    "ownTid" BIGINT,
    "policeEntityId" TEXT NOT NULL,
    "amount" DECIMAL(36,0) NOT NULL,
    "status" "ChallanStatus" NOT NULL DEFAULT 'PENDING',
    "isAdminCancel" BOOLEAN NOT NULL DEFAULT false,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "paidByWallet" TEXT,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "blockNumber" BIGINT,
    "blockTimestamp" TIMESTAMP(3),
    "txHashIssued" TEXT,
    "txHashResolved" TEXT,
    "createdByMemberId" TEXT,
    "cancelledByMemberId" TEXT,
    "violatorUserId" TEXT,

    CONSTRAINT "challans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_policies" (
    "id" TEXT NOT NULL,
    "polId" BIGINT,
    "ownershipId" TEXT NOT NULL,
    "ownTid" BIGINT,
    "insEntityId" TEXT NOT NULL,
    "coverage" DECIMAL(36,0) NOT NULL,
    "premium" DECIMAL(36,0) NOT NULL,
    "claimCount" INTEGER NOT NULL DEFAULT 0,
    "status" "InsuranceStatus" NOT NULL DEFAULT 'ACTIVE',
    "issueDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "ownerWallet" TEXT NOT NULL,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "blockNumber" BIGINT,
    "blockTimestamp" TIMESTAMP(3),
    "txHash" TEXT,
    "createdByMemberId" TEXT,
    "ownerUserId" TEXT,

    CONSTRAINT "insurance_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "puc_certificates" (
    "id" TEXT NOT NULL,
    "certId" BIGINT,
    "ownershipId" TEXT NOT NULL,
    "ownTid" BIGINT,
    "pucEntityId" TEXT NOT NULL,
    "co" INTEGER NOT NULL,
    "hc" INTEGER NOT NULL,
    "smoke" INTEGER NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "status" "PucStatus" NOT NULL DEFAULT 'VALID',
    "issueDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "ownerWallet" TEXT,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "blockNumber" BIGINT,
    "blockTimestamp" TIMESTAMP(3),
    "txHash" TEXT,
    "createdByMemberId" TEXT,
    "ownerUserId" TEXT,

    CONSTRAINT "puc_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_records" (
    "id" TEXT NOT NULL,
    "loanId" BIGINT,
    "ownershipId" TEXT NOT NULL,
    "ownTid" BIGINT,
    "lenderEntityId" TEXT NOT NULL,
    "borrowerWallet" TEXT NOT NULL,
    "amount" DECIMAL(36,0) NOT NULL,
    "tenure" INTEGER NOT NULL DEFAULT 0,
    "status" "LoanStatus" NOT NULL DEFAULT 'ACTIVE',
    "disbursedAt" TIMESTAMP(3) NOT NULL,
    "clearedAt" TIMESTAMP(3),
    "nocIssued" BOOLEAN NOT NULL DEFAULT false,
    "nocDate" TIMESTAMP(3),
    "nocRecipientWallet" TEXT,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "blockNumber" BIGINT,
    "blockTimestamp" TIMESTAMP(3),
    "txHash" TEXT,
    "createdByMemberId" TEXT,
    "borrowerUserId" TEXT,
    "nocRecipientUserId" TEXT,

    CONSTRAINT "loan_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "indexer_state" (
    "id" TEXT NOT NULL,
    "contractName" TEXT NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "lastBlock" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "indexer_state_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_walletAddress_key" ON "users"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_walletAddress_idx" ON "users"("walletAddress");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "b2b_entities_code_key" ON "b2b_entities"("code");

-- CreateIndex
CREATE UNIQUE INDEX "b2b_entities_walletAddress_key" ON "b2b_entities"("walletAddress");

-- CreateIndex
CREATE INDEX "b2b_entities_type_idx" ON "b2b_entities"("type");

-- CreateIndex
CREATE INDEX "b2b_entities_walletAddress_idx" ON "b2b_entities"("walletAddress");

-- CreateIndex
CREATE INDEX "b2b_entities_onChainId_idx" ON "b2b_entities"("onChainId");

-- CreateIndex
CREATE UNIQUE INDEX "b2b_members_email_key" ON "b2b_members"("email");

-- CreateIndex
CREATE INDEX "b2b_members_entityId_idx" ON "b2b_members"("entityId");

-- CreateIndex
CREATE INDEX "b2b_members_email_idx" ON "b2b_members"("email");

-- CreateIndex
CREATE INDEX "b2b_members_entityId_role_idx" ON "b2b_members"("entityId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "entity_signing_keys_entityId_key" ON "entity_signing_keys"("entityId");

-- CreateIndex
CREATE INDEX "entity_signing_keys_entityId_idx" ON "entity_signing_keys"("entityId");

-- CreateIndex
CREATE INDEX "otp_codes_memberId_purpose_idx" ON "otp_codes"("memberId", "purpose");

-- CreateIndex
CREATE INDEX "otp_codes_expiresAt_idx" ON "otp_codes"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_jti_key" ON "refresh_tokens"("jti");

-- CreateIndex
CREATE INDEX "refresh_tokens_jti_idx" ON "refresh_tokens"("jti");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "refresh_tokens_memberId_idx" ON "refresh_tokens"("memberId");

-- CreateIndex
CREATE INDEX "refresh_tokens_expiresAt_idx" ON "refresh_tokens"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_passports_dvpId_key" ON "vehicle_passports"("dvpId");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_passports_vinHash_key" ON "vehicle_passports"("vinHash");

-- CreateIndex
CREATE INDEX "vehicle_passports_dvpId_idx" ON "vehicle_passports"("dvpId");

-- CreateIndex
CREATE INDEX "vehicle_passports_vinHash_idx" ON "vehicle_passports"("vinHash");

-- CreateIndex
CREATE INDEX "vehicle_passports_mfgEntityId_idx" ON "vehicle_passports"("mfgEntityId");

-- CreateIndex
CREATE INDEX "vehicle_passports_dealerUserId_idx" ON "vehicle_passports"("dealerUserId");

-- CreateIndex
CREATE INDEX "vehicle_passports_status_idx" ON "vehicle_passports"("status");

-- CreateIndex
CREATE INDEX "vehicle_passports_syncStatus_idx" ON "vehicle_passports"("syncStatus");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_ownerships_ownTid_key" ON "vehicle_ownerships"("ownTid");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_ownerships_passportId_key" ON "vehicle_ownerships"("passportId");

-- CreateIndex
CREATE INDEX "vehicle_ownerships_ownTid_idx" ON "vehicle_ownerships"("ownTid");

-- CreateIndex
CREATE INDEX "vehicle_ownerships_ownerWallet_idx" ON "vehicle_ownerships"("ownerWallet");

-- CreateIndex
CREATE INDEX "vehicle_ownerships_ownerUserId_idx" ON "vehicle_ownerships"("ownerUserId");

-- CreateIndex
CREATE INDEX "vehicle_ownerships_rtoEntityId_idx" ON "vehicle_ownerships"("rtoEntityId");

-- CreateIndex
CREATE INDEX "vehicle_ownerships_isActive_idx" ON "vehicle_ownerships"("isActive");

-- CreateIndex
CREATE INDEX "vehicle_ownerships_syncStatus_idx" ON "vehicle_ownerships"("syncStatus");

-- CreateIndex
CREATE UNIQUE INDEX "transfer_requests_reqId_key" ON "transfer_requests"("reqId");

-- CreateIndex
CREATE INDEX "transfer_requests_ownTid_idx" ON "transfer_requests"("ownTid");

-- CreateIndex
CREATE INDEX "transfer_requests_sellerWallet_idx" ON "transfer_requests"("sellerWallet");

-- CreateIndex
CREATE INDEX "transfer_requests_buyerWallet_idx" ON "transfer_requests"("buyerWallet");

-- CreateIndex
CREATE INDEX "transfer_requests_sellerUserId_idx" ON "transfer_requests"("sellerUserId");

-- CreateIndex
CREATE INDEX "transfer_requests_buyerUserId_idx" ON "transfer_requests"("buyerUserId");

-- CreateIndex
CREATE INDEX "transfer_requests_status_idx" ON "transfer_requests"("status");

-- CreateIndex
CREATE INDEX "transfer_requests_syncStatus_idx" ON "transfer_requests"("syncStatus");

-- CreateIndex
CREATE INDEX "trade_certs_dealerWallet_idx" ON "trade_certs"("dealerWallet");

-- CreateIndex
CREATE INDEX "trade_certs_dealerUserId_idx" ON "trade_certs"("dealerUserId");

-- CreateIndex
CREATE INDEX "trade_certs_rtoEntityId_idx" ON "trade_certs"("rtoEntityId");

-- CreateIndex
CREATE INDEX "trade_certs_validTill_idx" ON "trade_certs"("validTill");

-- CreateIndex
CREATE INDEX "trade_certs_syncStatus_idx" ON "trade_certs"("syncStatus");

-- CreateIndex
CREATE UNIQUE INDEX "challans_challanId_key" ON "challans"("challanId");

-- CreateIndex
CREATE INDEX "challans_ownTid_idx" ON "challans"("ownTid");

-- CreateIndex
CREATE INDEX "challans_policeEntityId_idx" ON "challans"("policeEntityId");

-- CreateIndex
CREATE INDEX "challans_violatorUserId_idx" ON "challans"("violatorUserId");

-- CreateIndex
CREATE INDEX "challans_status_idx" ON "challans"("status");

-- CreateIndex
CREATE INDEX "challans_challanId_idx" ON "challans"("challanId");

-- CreateIndex
CREATE INDEX "challans_syncStatus_idx" ON "challans"("syncStatus");

-- CreateIndex
CREATE UNIQUE INDEX "insurance_policies_polId_key" ON "insurance_policies"("polId");

-- CreateIndex
CREATE INDEX "insurance_policies_ownTid_idx" ON "insurance_policies"("ownTid");

-- CreateIndex
CREATE INDEX "insurance_policies_insEntityId_idx" ON "insurance_policies"("insEntityId");

-- CreateIndex
CREATE INDEX "insurance_policies_ownerUserId_idx" ON "insurance_policies"("ownerUserId");

-- CreateIndex
CREATE INDEX "insurance_policies_status_idx" ON "insurance_policies"("status");

-- CreateIndex
CREATE INDEX "insurance_policies_expiryDate_idx" ON "insurance_policies"("expiryDate");

-- CreateIndex
CREATE INDEX "insurance_policies_syncStatus_idx" ON "insurance_policies"("syncStatus");

-- CreateIndex
CREATE UNIQUE INDEX "puc_certificates_certId_key" ON "puc_certificates"("certId");

-- CreateIndex
CREATE INDEX "puc_certificates_ownTid_idx" ON "puc_certificates"("ownTid");

-- CreateIndex
CREATE INDEX "puc_certificates_pucEntityId_idx" ON "puc_certificates"("pucEntityId");

-- CreateIndex
CREATE INDEX "puc_certificates_status_idx" ON "puc_certificates"("status");

-- CreateIndex
CREATE INDEX "puc_certificates_expiryDate_idx" ON "puc_certificates"("expiryDate");

-- CreateIndex
CREATE INDEX "puc_certificates_syncStatus_idx" ON "puc_certificates"("syncStatus");

-- CreateIndex
CREATE UNIQUE INDEX "loan_records_loanId_key" ON "loan_records"("loanId");

-- CreateIndex
CREATE INDEX "loan_records_ownTid_idx" ON "loan_records"("ownTid");

-- CreateIndex
CREATE INDEX "loan_records_borrowerWallet_idx" ON "loan_records"("borrowerWallet");

-- CreateIndex
CREATE INDEX "loan_records_borrowerUserId_idx" ON "loan_records"("borrowerUserId");

-- CreateIndex
CREATE INDEX "loan_records_status_idx" ON "loan_records"("status");

-- CreateIndex
CREATE INDEX "loan_records_syncStatus_idx" ON "loan_records"("syncStatus");

-- CreateIndex
CREATE UNIQUE INDEX "indexer_state_contractName_key" ON "indexer_state"("contractName");

-- CreateIndex
CREATE INDEX "indexer_state_contractName_idx" ON "indexer_state"("contractName");

-- AddForeignKey
ALTER TABLE "b2b_entities" ADD CONSTRAINT "b2b_entities_registeredByMemberId_fkey" FOREIGN KEY ("registeredByMemberId") REFERENCES "b2b_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b2b_members" ADD CONSTRAINT "b2b_members_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "b2b_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_signing_keys" ADD CONSTRAINT "entity_signing_keys_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "b2b_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_signing_keys" ADD CONSTRAINT "entity_signing_keys_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "b2b_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otp_codes" ADD CONSTRAINT "otp_codes_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "b2b_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "b2b_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_passports" ADD CONSTRAINT "vehicle_passports_mfgEntityId_fkey" FOREIGN KEY ("mfgEntityId") REFERENCES "b2b_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_passports" ADD CONSTRAINT "vehicle_passports_scrapEntityId_fkey" FOREIGN KEY ("scrapEntityId") REFERENCES "b2b_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_passports" ADD CONSTRAINT "vehicle_passports_dealerUserId_fkey" FOREIGN KEY ("dealerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_passports" ADD CONSTRAINT "vehicle_passports_createdByMemberId_fkey" FOREIGN KEY ("createdByMemberId") REFERENCES "b2b_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_ownerships" ADD CONSTRAINT "vehicle_ownerships_passportId_fkey" FOREIGN KEY ("passportId") REFERENCES "vehicle_passports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_ownerships" ADD CONSTRAINT "vehicle_ownerships_rtoEntityId_fkey" FOREIGN KEY ("rtoEntityId") REFERENCES "b2b_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_ownerships" ADD CONSTRAINT "vehicle_ownerships_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_ownerships" ADD CONSTRAINT "vehicle_ownerships_rtoMemberId_fkey" FOREIGN KEY ("rtoMemberId") REFERENCES "b2b_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_ownershipId_fkey" FOREIGN KEY ("ownershipId") REFERENCES "vehicle_ownerships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_rtoEntityId_fkey" FOREIGN KEY ("rtoEntityId") REFERENCES "b2b_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_sellerUserId_fkey" FOREIGN KEY ("sellerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_buyerUserId_fkey" FOREIGN KEY ("buyerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_rtoApproverMemberId_fkey" FOREIGN KEY ("rtoApproverMemberId") REFERENCES "b2b_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_certs" ADD CONSTRAINT "trade_certs_rtoEntityId_fkey" FOREIGN KEY ("rtoEntityId") REFERENCES "b2b_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_certs" ADD CONSTRAINT "trade_certs_dealerUserId_fkey" FOREIGN KEY ("dealerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_certs" ADD CONSTRAINT "trade_certs_createdByMemberId_fkey" FOREIGN KEY ("createdByMemberId") REFERENCES "b2b_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challans" ADD CONSTRAINT "challans_ownershipId_fkey" FOREIGN KEY ("ownershipId") REFERENCES "vehicle_ownerships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challans" ADD CONSTRAINT "challans_policeEntityId_fkey" FOREIGN KEY ("policeEntityId") REFERENCES "b2b_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challans" ADD CONSTRAINT "challans_createdByMemberId_fkey" FOREIGN KEY ("createdByMemberId") REFERENCES "b2b_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challans" ADD CONSTRAINT "challans_cancelledByMemberId_fkey" FOREIGN KEY ("cancelledByMemberId") REFERENCES "b2b_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challans" ADD CONSTRAINT "challans_violatorUserId_fkey" FOREIGN KEY ("violatorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_ownershipId_fkey" FOREIGN KEY ("ownershipId") REFERENCES "vehicle_ownerships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_insEntityId_fkey" FOREIGN KEY ("insEntityId") REFERENCES "b2b_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_createdByMemberId_fkey" FOREIGN KEY ("createdByMemberId") REFERENCES "b2b_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "puc_certificates" ADD CONSTRAINT "puc_certificates_ownershipId_fkey" FOREIGN KEY ("ownershipId") REFERENCES "vehicle_ownerships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "puc_certificates" ADD CONSTRAINT "puc_certificates_pucEntityId_fkey" FOREIGN KEY ("pucEntityId") REFERENCES "b2b_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "puc_certificates" ADD CONSTRAINT "puc_certificates_createdByMemberId_fkey" FOREIGN KEY ("createdByMemberId") REFERENCES "b2b_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_records" ADD CONSTRAINT "loan_records_ownershipId_fkey" FOREIGN KEY ("ownershipId") REFERENCES "vehicle_ownerships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_records" ADD CONSTRAINT "loan_records_lenderEntityId_fkey" FOREIGN KEY ("lenderEntityId") REFERENCES "b2b_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_records" ADD CONSTRAINT "loan_records_createdByMemberId_fkey" FOREIGN KEY ("createdByMemberId") REFERENCES "b2b_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_records" ADD CONSTRAINT "loan_records_borrowerUserId_fkey" FOREIGN KEY ("borrowerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_records" ADD CONSTRAINT "loan_records_nocRecipientUserId_fkey" FOREIGN KEY ("nocRecipientUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
