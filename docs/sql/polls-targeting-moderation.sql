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

-- Visibilité publique d'un sondage ciblé + horodatage des notifs envoyées
ALTER TABLE "Poll" ADD COLUMN IF NOT EXISTS "visibleToAll" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Poll" ADD COLUMN IF NOT EXISTS "openNotifiedAt" TIMESTAMP(3);
ALTER TABLE "Poll" ADD COLUMN IF NOT EXISTS "reminderSentAt" TIMESTAMP(3);
ALTER TABLE "Poll" ADD COLUMN IF NOT EXISTS "resultsNotifiedAt" TIMESTAMP(3);

-- Demandes de ciblage hors périmètre (validées par un gérant de club ou l'admin)
CREATE TABLE IF NOT EXISTS "PollApproval" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "clubId" TEXT,
    "countries" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "continents" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "global" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PollApproval_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PollApproval_pollId_idx" ON "PollApproval"("pollId");
CREATE INDEX IF NOT EXISTS "PollApproval_clubId_status_idx" ON "PollApproval"("clubId", "status");
CREATE INDEX IF NOT EXISTS "PollApproval_status_idx" ON "PollApproval"("status");

DO $$ BEGIN
  ALTER TABLE "PollApproval" ADD CONSTRAINT "PollApproval_pollId_fkey"
    FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "PollApproval" ADD CONSTRAINT "PollApproval_clubId_fkey"
    FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'POLL_APPROVAL_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'POLL_APPROVAL_DECIDED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'POLL_UNBLOCKED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'POLL_REPORT_HANDLED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'POLL_RESULTS_AVAILABLE';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'POLL_CLOSING_SOON';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'POLL_VOTE_MILESTONE';

-- Sondages existants : considérés comme déjà notifiés, pour qu'aucune vieille
-- notif (ouverture, rappel, résultats) ne parte au déploiement. Date figée :
-- ré-exécuter ce fichier plus tard ne touche pas les nouveaux sondages.
UPDATE "Poll" SET
  "openNotifiedAt"    = COALESCE("openNotifiedAt", CURRENT_TIMESTAMP),
  "reminderSentAt"    = COALESCE("reminderSentAt", CURRENT_TIMESTAMP),
  "resultsNotifiedAt" = COALESCE("resultsNotifiedAt", CURRENT_TIMESTAMP)
WHERE "status" <> 'DRAFT' AND "createdAt" < '2026-09-26';
