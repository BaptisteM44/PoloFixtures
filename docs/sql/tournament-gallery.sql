-- Galerie des tournois : les personnes extérieures proposent des photos,
-- l'orga les valide. Idempotent — à exécuter dans le terminal DB de Coolify
-- AVANT de déployer (docs/sql/tournament-photos.sql doit déjà être passé).

ALTER TABLE "TournamentPhoto" ADD COLUMN IF NOT EXISTS "pendingApproval" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "TournamentPhoto_tournamentId_pendingApproval_idx" ON "TournamentPhoto"("tournamentId", "pendingApproval");

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TOURNAMENT_PHOTOS_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TOURNAMENT_PHOTOS_DECIDED';
