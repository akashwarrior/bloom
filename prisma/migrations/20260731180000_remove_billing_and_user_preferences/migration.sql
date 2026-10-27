-- Remove the abandoned billing, credit, subscription, and preference systems.
DROP TABLE IF EXISTS "Subscription";
DROP TABLE IF EXISTS "UserPreference";
DROP TABLE IF EXISTS "CreditTransaction";

ALTER TABLE "user"
  DROP COLUMN IF EXISTS "credits";

DROP TYPE IF EXISTS "SubscriptionStatus";
DROP TYPE IF EXISTS "SubscriptionPlan";
DROP TYPE IF EXISTS "CreditTransactionType";
