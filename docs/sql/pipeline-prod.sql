-- ============================================================================
-- PIPELINE (refonte formats) — schéma additif pour la prod Coolify
-- À coller dans le terminal DB Coolify (psql -U postgres -d postgres)
-- 100% idempotent : ré-exécutable sans risque, aucune donnée modifiée.
-- ============================================================================

-- Enums du pipeline
DO $$ BEGIN
  CREATE TYPE "StageType" AS ENUM ('RR', 'SWISS', 'CROSS_POOL', 'PLACEMENT', 'SE', 'DE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "StageStatus" AS ENUM ('PENDING', 'ACTIVE', 'DONE', 'SKIPPED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TYPE "MatchPhase" ADD VALUE IF NOT EXISTS 'STAGE';

-- Colonnes ajoutées aux tables existantes
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "timezone" TEXT;
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "usesPipeline" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "stageId" TEXT;
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "groupKey" TEXT;

-- Table Stage
CREATE TABLE IF NOT EXISTS "Stage" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" "StageType" NOT NULL,
    "config" JSONB NOT NULL,
    "entryRules" JSONB NOT NULL,
    "status" "StageStatus" NOT NULL DEFAULT 'PENDING',
    "startAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Stage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Stage_tournamentId_order_idx" ON "Stage"("tournamentId", "order");

-- Table StageEntry
CREATE TABLE IF NOT EXISTS "StageEntry" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "groupKey" TEXT NOT NULL DEFAULT '',
    "teamId" TEXT,
    CONSTRAINT "StageEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "StageEntry_stageId_groupKey_slot_key" ON "StageEntry"("stageId", "groupKey", "slot");
CREATE INDEX IF NOT EXISTS "StageEntry_stageId_idx" ON "StageEntry"("stageId");

-- Index Match.stageId
CREATE INDEX IF NOT EXISTS "Match_stageId_idx" ON "Match"("stageId");

-- Clés étrangères
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Stage_tournamentId_fkey') THEN
    ALTER TABLE "Stage" ADD CONSTRAINT "Stage_tournamentId_fkey"
      FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StageEntry_stageId_fkey') THEN
    ALTER TABLE "StageEntry" ADD CONSTRAINT "StageEntry_stageId_fkey"
      FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StageEntry_teamId_fkey') THEN
    ALTER TABLE "StageEntry" ADD CONSTRAINT "StageEntry_teamId_fkey"
      FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Match_stageId_fkey') THEN
    ALTER TABLE "Match" ADD CONSTRAINT "Match_stageId_fkey"
      FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Vérification
SELECT 'Stage' AS t, count(*) FROM "Stage"
UNION ALL SELECT 'StageEntry', count(*) FROM "StageEntry";
