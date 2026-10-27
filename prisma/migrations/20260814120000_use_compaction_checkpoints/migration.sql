-- Existing rows are exact shadow transcripts written after every successful
-- request. ChatMessage is canonical, so discard those rows before narrowing
-- this table to compaction checkpoints only.
DELETE FROM "ProjectAgentContext";

ALTER TABLE "ProjectAgentContext"
RENAME TO "ProjectContextCheckpoint";

ALTER TABLE "ProjectContextCheckpoint"
RENAME CONSTRAINT "ProjectAgentContext_pkey"
TO "ProjectContextCheckpoint_pkey";

ALTER TABLE "ProjectContextCheckpoint"
RENAME CONSTRAINT "ProjectAgentContext_projectId_fkey"
TO "ProjectContextCheckpoint_projectId_fkey";

ALTER TABLE "ProjectContextCheckpoint"
RENAME CONSTRAINT "ProjectAgentContext_throughMessageId_fkey"
TO "ProjectContextCheckpoint_throughMessageId_fkey";

ALTER TABLE "ProjectContextCheckpoint"
RENAME COLUMN "contextMessages" TO "checkpointMessages";

ALTER TABLE "ProjectContextCheckpoint"
RENAME COLUMN "contextTokenCount" TO "checkpointTokenCount";

ALTER TABLE "ProjectContextCheckpoint"
DROP COLUMN "activeTask",
DROP COLUMN "lastStep";

ALTER INDEX "ProjectAgentContext_throughMessageId_key"
RENAME TO "ProjectContextCheckpoint_throughMessageId_key";

ALTER INDEX "ProjectAgentContext_updatedAt_idx"
RENAME TO "ProjectContextCheckpoint_updatedAt_idx";
