-- Arbitrage par équipe : équipe désignée par match, règles d'arbitrage du
-- tournoi, notifs « ton match / ton arbitrage dans 15 min ».
-- Idempotent — à passer sur Coolify AVANT de déployer.

ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "refereeTeamId" TEXT;
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "refereeAuto" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "remindersSentAt" TIMESTAMP(3);

DO $$ BEGIN
  ALTER TABLE "Match" ADD CONSTRAINT "Match_refereeTeamId_fkey"
    FOREIGN KEY ("refereeTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "refereeSettings" JSONB;

-- Matchs passés : considérés comme déjà rappelés (aucune vieille notif au déploiement).
UPDATE "Match" SET "remindersSentAt" = CURRENT_TIMESTAMP
WHERE "remindersSentAt" IS NULL AND "startAt" < CURRENT_TIMESTAMP;

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MATCH_SOON';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'REFEREE_SOON';
