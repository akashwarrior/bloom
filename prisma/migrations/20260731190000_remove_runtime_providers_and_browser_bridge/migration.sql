-- Runtime selection now belongs to the server environment, not project data.
DROP TABLE IF EXISTS "RuntimeJob";
DROP TABLE IF EXISTS "RuntimeSession";

ALTER TABLE "Project"
  DROP COLUMN IF EXISTS "runtimeProvider";

DROP TYPE IF EXISTS "RuntimeJobStatus";
DROP TYPE IF EXISTS "RuntimeSessionStatus";
DROP TYPE IF EXISTS "RuntimeProvider";
