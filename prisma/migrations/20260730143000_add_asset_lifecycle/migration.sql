-- AlterEnum
ALTER TYPE "AssetStatus" ADD VALUE 'DELETING';

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN "claimedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Asset_status_createdAt_idx" ON "Asset"("status", "createdAt");
