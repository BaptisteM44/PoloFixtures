-- Système de sondage / vote communautaire (anti-fraude + anonymat "urne").
-- Idempotent — à exécuter dans le terminal DB de Coolify AVANT de déployer le
-- code qui utilise ces tables.
--
-- Anonymat : PollBallot (le bulletin, anonyme) et PollVoter (l'émargement) sont
-- deux tables SANS clé étrangère entre elles → on ne peut pas relier un vote à
-- un votant.

-- Enum de statut du sondage (CREATE TYPE n'est pas idempotent nativement)
DO $$ BEGIN
  CREATE TYPE "PollStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Le sondage
CREATE TABLE IF NOT EXISTS "Poll" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "description" TEXT,
    "options" TEXT[],
    "status" "PollStatus" NOT NULL DEFAULT 'DRAFT',
    "multipleChoice" BOOLEAN NOT NULL DEFAULT false,
    "allowGuests" BOOLEAN NOT NULL DEFAULT true,
    "guestFields" JSONB NOT NULL DEFAULT '[]',
    "openAt" TIMESTAMP(3),
    "closeAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Poll_pkey" PRIMARY KEY ("id")
);

-- L'URNE : un bulletin = un choix, anonyme.
CREATE TABLE IF NOT EXISTS "PollBallot" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "choice" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PollBallot_pkey" PRIMARY KEY ("id")
);

-- L'ÉMARGEMENT : qui a voté (pas quoi).
CREATE TABLE IF NOT EXISTS "PollVoter" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "voterHash" TEXT NOT NULL,
    "isGuest" BOOLEAN NOT NULL DEFAULT false,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifyToken" TEXT,
    "verifyExpiry" TIMESTAMP(3),
    "guestInfo" JSONB,
    "pendingChoice" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PollVoter_pkey" PRIMARY KEY ("id")
);

-- Index
CREATE INDEX IF NOT EXISTS "Poll_status_idx" ON "Poll"("status");
CREATE INDEX IF NOT EXISTS "PollBallot_pollId_idx" ON "PollBallot"("pollId");
CREATE INDEX IF NOT EXISTS "PollVoter_verifyToken_idx" ON "PollVoter"("verifyToken");
-- Contrainte anti-double-vote : un votant (voterHash) ne peut émarger qu'une fois par sondage.
CREATE UNIQUE INDEX IF NOT EXISTS "PollVoter_pollId_voterHash_key" ON "PollVoter"("pollId", "voterHash");

-- Clés étrangères (idempotence via bloc conditionnel)
DO $$ BEGIN
  ALTER TABLE "Poll" ADD CONSTRAINT "Poll_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "PollBallot" ADD CONSTRAINT "PollBallot_pollId_fkey"
    FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "PollVoter" ADD CONSTRAINT "PollVoter_pollId_fkey"
    FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
