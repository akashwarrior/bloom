CREATE TABLE "ProjectAgentContext" (
    "projectId" TEXT NOT NULL,
    "throughMessageId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "activeTask" TEXT NOT NULL,
    "lastStep" TEXT NOT NULL,
    "retainedAssetIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "sourceTokenCount" INTEGER NOT NULL,
    "compactedTokenCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectAgentContext_pkey" PRIMARY KEY ("projectId")
);

CREATE UNIQUE INDEX "ProjectAgentContext_throughMessageId_key"
ON "ProjectAgentContext"("throughMessageId");

CREATE INDEX "ProjectAgentContext_updatedAt_idx"
ON "ProjectAgentContext"("updatedAt");

ALTER TABLE "ProjectAgentContext"
ADD CONSTRAINT "ProjectAgentContext_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectAgentContext"
ADD CONSTRAINT "ProjectAgentContext_throughMessageId_fkey"
FOREIGN KEY ("throughMessageId") REFERENCES "ChatMessage"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
