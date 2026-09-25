-- Pellicule jetable des tournois : 5 photos par participant, révélées à 21h
-- (heure locale) le dernier jour. Idempotent — à exécuter dans le terminal DB
-- de Coolify AVANT de déployer.
-- (Remplace docs/sql/stories.sql, qui n'est plus utilisé : ne pas le passer.)

CREATE TABLE IF NOT EXISTS "TournamentPhoto" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "imagePath" TEXT NOT NULL,
    "hiddenAt" TIMESTAMP(3),
    "reportCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TournamentPhoto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TournamentPhoto_tournamentId_idx" ON "TournamentPhoto"("tournamentId");
CREATE INDEX IF NOT EXISTS "TournamentPhoto_authorId_tournamentId_idx" ON "TournamentPhoto"("authorId", "tournamentId");

DO $$ BEGIN
  ALTER TABLE "TournamentPhoto" ADD CONSTRAINT "TournamentPhoto_tournamentId_fkey"
    FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "TournamentPhoto" ADD CONSTRAINT "TournamentPhoto_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "photosPinnedAt" TIMESTAMP(3);
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "photosRevealNotifiedAt" TIMESTAMP(3);

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TOURNAMENT_PHOTOS_REVEALED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TOURNAMENT_PHOTO_REPORTED';

-- Si tu avais déjà passé docs/sql/stories.sql, la table "Story" est inutile.
-- Elle ne gêne pas ; pour la retirer (vide), décommenter :
-- DROP TABLE IF EXISTS "Story";
