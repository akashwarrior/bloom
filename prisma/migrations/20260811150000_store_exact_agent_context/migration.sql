ALTER TABLE "ProjectAgentContext"
ADD COLUMN "contextMessages" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "contextTokenCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "ProjectAgentContext"
DROP COLUMN "summary",
DROP COLUMN "sourceTokenCount",
DROP COLUMN "compactedTokenCount";

ALTER TABLE "ProjectAgentContext"
ALTER COLUMN "contextMessages" DROP DEFAULT,
ALTER COLUMN "contextTokenCount" DROP DEFAULT;
