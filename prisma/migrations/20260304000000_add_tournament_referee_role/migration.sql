-- AlterTable: add role column to TournamentOrganizer
-- 'ORGA' = co-organisateur  |  'REF' = arbitre assigné au tournoi
ALTER TABLE "TournamentOrganizer" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'ORGA';
