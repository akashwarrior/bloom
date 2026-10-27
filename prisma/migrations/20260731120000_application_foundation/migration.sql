-- CreateEnum
CREATE TYPE "ProjectFramework" AS ENUM ('NEXTJS');

-- CreateEnum
CREATE TYPE "RuntimeProvider" AS ENUM ('WEBCONTAINER', 'VERCEL_SANDBOX');

-- CreateEnum
CREATE TYPE "RevisionAuthorType" AS ENUM ('SYSTEM', 'AGENT', 'USER', 'RESTORE');

-- CreateEnum
CREATE TYPE "RuntimeSessionStatus" AS ENUM ('STARTING', 'READY', 'BUSY', 'STOPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "RuntimeJobStatus" AS ENUM ('PENDING', 'CLAIMED', 'COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('FREE', 'STARTER', 'PRO', 'MAX');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('INCOMPLETE', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID', 'PAUSED');

-- AlterEnum
ALTER TYPE "CreditTransactionType" ADD VALUE 'RESERVATION';
ALTER TYPE "CreditTransactionType" ADD VALUE 'SETTLEMENT';

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN "revisionId" TEXT,
ADD COLUMN "supersededAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "CreditTransaction" ADD COLUMN "balanceAfter" INTEGER,
ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "providerEventId" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "currentRevisionId" TEXT,
ADD COLUMN "framework" "ProjectFramework" NOT NULL DEFAULT 'NEXTJS',
ADD COLUMN "runtimeProvider" "RuntimeProvider" NOT NULL DEFAULT 'WEBCONTAINER';

-- CreateTable
CREATE TABLE "ProjectFileBlob" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "mediaType" TEXT NOT NULL DEFAULT 'text/plain',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectFileBlob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectRevision" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "parentRevisionId" TEXT,
    "authorType" "RevisionAuthorType" NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevisionFile" (
    "revisionId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "blobId" TEXT NOT NULL,
    CONSTRAINT "RevisionFile_pkey" PRIMARY KEY ("revisionId","path")
);

-- CreateTable
CREATE TABLE "RuntimeSession" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "provider" "RuntimeProvider" NOT NULL,
    "status" "RuntimeSessionStatus" NOT NULL DEFAULT 'STARTING',
    "runtimeId" TEXT,
    "revisionId" TEXT,
    "clientId" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "previewUrl" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RuntimeSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuntimeJob" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "operation" JSONB NOT NULL,
    "result" JSONB,
    "error" TEXT,
    "status" "RuntimeJobStatus" NOT NULL DEFAULT 'PENDING',
    "claimedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RuntimeJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreference" (
    "userId" TEXT NOT NULL,
    "completionSound" BOOLEAN NOT NULL DEFAULT true,
    "browserNotifications" BOOLEAN NOT NULL DEFAULT false,
    "reduceMotion" BOOLEAN NOT NULL DEFAULT false,
    "productEmails" BOOLEAN NOT NULL DEFAULT true,
    "showcaseConsent" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerCustomerId" TEXT,
    "providerSubscriptionId" TEXT,
    "providerPriceId" TEXT,
    "plan" "SubscriptionPlan" NOT NULL DEFAULT 'FREE',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectFileBlob_objectKey_key" ON "ProjectFileBlob"("objectKey");
CREATE INDEX "ProjectFileBlob_projectId_idx" ON "ProjectFileBlob"("projectId");
CREATE UNIQUE INDEX "ProjectFileBlob_projectId_sha256_key" ON "ProjectFileBlob"("projectId", "sha256");
CREATE INDEX "ProjectRevision_projectId_createdAt_idx" ON "ProjectRevision"("projectId", "createdAt");
CREATE INDEX "ProjectRevision_parentRevisionId_idx" ON "ProjectRevision"("parentRevisionId");
CREATE INDEX "RevisionFile_blobId_idx" ON "RevisionFile"("blobId");
CREATE INDEX "RuntimeSession_projectId_status_idx" ON "RuntimeSession"("projectId", "status");
CREATE INDEX "RuntimeSession_leaseExpiresAt_idx" ON "RuntimeSession"("leaseExpiresAt");
CREATE INDEX "RuntimeJob_sessionId_status_createdAt_idx" ON "RuntimeJob"("sessionId", "status", "createdAt");
CREATE INDEX "RuntimeJob_status_expiresAt_idx" ON "RuntimeJob"("status", "expiresAt");
CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId");
CREATE UNIQUE INDEX "Subscription_providerCustomerId_key" ON "Subscription"("providerCustomerId");
CREATE UNIQUE INDEX "Subscription_providerSubscriptionId_key" ON "Subscription"("providerSubscriptionId");
CREATE INDEX "ChatMessage_projectId_createdAt_id_idx" ON "ChatMessage"("projectId", "createdAt", "id");
CREATE INDEX "ChatMessage_revisionId_idx" ON "ChatMessage"("revisionId");
CREATE UNIQUE INDEX "CreditTransaction_idempotencyKey_key" ON "CreditTransaction"("idempotencyKey");
CREATE INDEX "CreditTransaction_userId_createdAt_idx" ON "CreditTransaction"("userId", "createdAt");
CREATE INDEX "CreditTransaction_providerEventId_idx" ON "CreditTransaction"("providerEventId");
CREATE INDEX "Project_userId_updatedAt_idx" ON "Project"("userId", "updatedAt");

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "ProjectRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectFileBlob" ADD CONSTRAINT "ProjectFileBlob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectRevision" ADD CONSTRAINT "ProjectRevision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectRevision" ADD CONSTRAINT "ProjectRevision_parentRevisionId_fkey" FOREIGN KEY ("parentRevisionId") REFERENCES "ProjectRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RevisionFile" ADD CONSTRAINT "RevisionFile_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "ProjectRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RevisionFile" ADD CONSTRAINT "RevisionFile_blobId_fkey" FOREIGN KEY ("blobId") REFERENCES "ProjectFileBlob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RuntimeSession" ADD CONSTRAINT "RuntimeSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RuntimeJob" ADD CONSTRAINT "RuntimeJob_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "RuntimeSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
