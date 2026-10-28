-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ChatMessageRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "AssetSource" AS ENUM ('UPLOAD', 'GENERATED');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('PENDING', 'READY', 'FAILED', 'DELETING');

-- CreateEnum
CREATE TYPE "RevisionAuthorType" AS ENUM ('SYSTEM', 'AGENT', 'USER');

-- CreateEnum
CREATE TYPE "ChatRunStatus" AS ENUM ('RUNNING', 'COMMITTED', 'FAILED', 'STOPPED');

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('FREE', 'STARTER', 'PRO', 'MAX');

-- CreateEnum
CREATE TYPE "CreditTransactionKind" AS ENUM ('PLAN', 'TOP_UP', 'GENERATION');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "currentRevisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectWorkspaceLease" (
    "projectId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectWorkspaceLease_pkey" PRIMARY KEY ("projectId")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "source" "AssetSource" NOT NULL DEFAULT 'UPLOAD',
    "status" "AssetStatus" NOT NULL DEFAULT 'PENDING',
    "claimedAt" TIMESTAMP(3),
    "cacheKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "role" "ChatMessageRole" NOT NULL,
    "parts" JSONB NOT NULL,
    "modelParts" JSONB,
    "metadata" JSONB,
    "revisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatRun" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "status" "ChatRunStatus" NOT NULL DEFAULT 'RUNNING',
    "targetMessageId" TEXT,
    "responseMessageId" TEXT,
    "submission" JSONB,
    "resultRevisionId" TEXT,
    "failedActivity" JSONB,
    "error" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "stopRequestedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectContextCheckpoint" (
    "projectId" TEXT NOT NULL,
    "throughMessageId" TEXT NOT NULL,
    "checkpointMessages" JSONB NOT NULL,
    "retainedAssetIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectContextCheckpoint_pkey" PRIMARY KEY ("projectId")
);

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
CREATE TABLE "BillingAccount" (
    "userId" TEXT NOT NULL,
    "plan" "Plan" NOT NULL DEFAULT 'FREE',
    "credits" INTEGER NOT NULL DEFAULT 0,
    "periodStartedAt" TIMESTAMP(3) NOT NULL,
    "periodEndsAt" TIMESTAMP(3) NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingAccount_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "CreditTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "CreditTransactionKind" NOT NULL,
    "amount" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "plan" "Plan",
    "chatRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE INDEX "Project_userId_updatedAt_idx" ON "Project"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_objectKey_key" ON "Asset"("objectKey");

-- CreateIndex
CREATE INDEX "Asset_projectId_createdAt_idx" ON "Asset"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "Asset_projectId_source_claimedAt_updatedAt_idx" ON "Asset"("projectId", "source", "claimedAt", "updatedAt");

-- CreateIndex
CREATE INDEX "Asset_projectId_cacheKey_idx" ON "Asset"("projectId", "cacheKey");

-- CreateIndex
CREATE INDEX "ChatMessage_projectId_createdAt_id_idx" ON "ChatMessage"("projectId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "ChatMessage_revisionId_idx" ON "ChatMessage"("revisionId");

-- CreateIndex
CREATE INDEX "ChatRun_projectId_createdAt_id_idx" ON "ChatRun"("projectId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "ChatRun_targetMessageId_idx" ON "ChatRun"("targetMessageId");

-- CreateIndex
CREATE INDEX "ChatRun_responseMessageId_idx" ON "ChatRun"("responseMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatRun_projectId_requestId_key" ON "ChatRun"("projectId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectContextCheckpoint_throughMessageId_key" ON "ProjectContextCheckpoint"("throughMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectFileBlob_objectKey_key" ON "ProjectFileBlob"("objectKey");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectFileBlob_projectId_sha256_key" ON "ProjectFileBlob"("projectId", "sha256");

-- CreateIndex
CREATE INDEX "ProjectRevision_projectId_createdAt_idx" ON "ProjectRevision"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectRevision_parentRevisionId_idx" ON "ProjectRevision"("parentRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectRevision_projectId_id_key" ON "ProjectRevision"("projectId", "id");

-- CreateIndex
CREATE INDEX "RevisionFile_blobId_idx" ON "RevisionFile"("blobId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditTransaction_chatRunId_key" ON "CreditTransaction"("chatRunId");

-- CreateIndex
CREATE INDEX "CreditTransaction_userId_createdAt_idx" ON "CreditTransaction"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_id_currentRevisionId_fkey" FOREIGN KEY ("id", "currentRevisionId") REFERENCES "ProjectRevision"("projectId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ProjectWorkspaceLease" ADD CONSTRAINT "ProjectWorkspaceLease_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "ProjectRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRun" ADD CONSTRAINT "ChatRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRun" ADD CONSTRAINT "ChatRun_responseMessageId_fkey" FOREIGN KEY ("responseMessageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRun" ADD CONSTRAINT "ChatRun_targetMessageId_fkey" FOREIGN KEY ("targetMessageId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectContextCheckpoint" ADD CONSTRAINT "ProjectContextCheckpoint_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectContextCheckpoint" ADD CONSTRAINT "ProjectContextCheckpoint_throughMessageId_fkey" FOREIGN KEY ("throughMessageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFileBlob" ADD CONSTRAINT "ProjectFileBlob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRevision" ADD CONSTRAINT "ProjectRevision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRevision" ADD CONSTRAINT "ProjectRevision_parentRevisionId_fkey" FOREIGN KEY ("parentRevisionId") REFERENCES "ProjectRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevisionFile" ADD CONSTRAINT "RevisionFile_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "ProjectRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevisionFile" ADD CONSTRAINT "RevisionFile_blobId_fkey" FOREIGN KEY ("blobId") REFERENCES "ProjectFileBlob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingAccount" ADD CONSTRAINT "BillingAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "BillingAccount"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_chatRunId_fkey" FOREIGN KEY ("chatRunId") REFERENCES "ChatRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

