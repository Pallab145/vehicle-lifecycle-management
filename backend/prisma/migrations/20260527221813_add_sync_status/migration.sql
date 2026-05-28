-- AlterTable
ALTER TABLE "b2b_entities" ADD COLUMN     "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "txHash" TEXT;
