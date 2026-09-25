-- Stories de la home (façon Instagram) : 24 h, ou épinglées « à la une ».
-- Idempotent — à exécuter dans le terminal DB de Coolify AVANT de déployer.

CREATE TABLE IF NOT EXISTS "Story" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "imagePath" TEXT NOT NULL,
    "caption" TEXT,
    "tournamentId" TEXT,
    "highlightTitle" TEXT,
    "pinnedAt" TIMESTAMP(3),
    "hiddenAt" TIMESTAMP(3),
    "reportCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Story_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Story_expiresAt_idx" ON "Story"("expiresAt");
CREATE INDEX IF NOT EXISTS "Story_highlightTitle_idx" ON "Story"("highlightTitle");
CREATE INDEX IF NOT EXISTS "Story_authorId_idx" ON "Story"("authorId");

DO $$ BEGIN
  ALTER TABLE "Story" ADD CONSTRAINT "Story_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "Story" ADD CONSTRAINT "Story_tournamentId_fkey"
    FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'STORY_REPORTED';
