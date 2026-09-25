-- Sondages : ciblage des votants, blocage par la modération, signalements.
-- Idempotent — à exécuter dans le terminal DB de Coolify APRÈS les autres
-- fichiers polls-*.sql, et AVANT de déployer le code qui l'utilise.

-- Ciblage (liste vide = pas de restriction sur ce critère)
ALTER TABLE "Poll" ADD COLUMN IF NOT EXISTS "eligibleClubIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Poll" ADD COLUMN IF NOT EXISTS "eligibleCountries" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Poll" ADD COLUMN IF NOT EXISTS "eligibleContinents" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Blocage par la modération
ALTER TABLE "Poll" ADD COLUMN IF NOT EXISTS "blockedAt" TIMESTAMP(3);
ALTER TABLE "Poll" ADD COLUMN IF NOT EXISTS "blockedReason" TEXT;

-- Signalements (un par inscrit et par sondage)
CREATE TABLE IF NOT EXISTS "PollReport" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PollReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PollReport_pollId_reporterId_key" ON "PollReport"("pollId", "reporterId");
CREATE INDEX IF NOT EXISTS "PollReport_pollId_idx" ON "PollReport"("pollId");

DO $$ BEGIN
  ALTER TABLE "PollReport" ADD CONSTRAINT "PollReport_pollId_fkey"
    FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "PollReport" ADD CONSTRAINT "PollReport_reporterId_fkey"
    FOREIGN KEY ("reporterId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Notifications (ADD VALUE IF NOT EXISTS est idempotent)
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'POLL_REPORTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'POLL_BLOCKED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'POLL_OPENED';
