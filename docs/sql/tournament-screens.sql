-- Écrans de salle (TV) : scoreboard d'un terrain ou diaporama du tournoi.
-- À lancer AVANT de déployer le code. Rejouable sans risque.

CREATE TABLE IF NOT EXISTS "TournamentScreen" (
  "id"            TEXT NOT NULL,
  "tournamentId"  TEXT NOT NULL,
  "slug"          TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "mode"          TEXT NOT NULL DEFAULT 'slideshow',
  "court"         INTEGER NOT NULL DEFAULT 1,
  "theme"         TEXT NOT NULL DEFAULT 'dark',
  "clockPosition" TEXT NOT NULL DEFAULT 'top',
  "slides"        JSONB,
  "slideSeconds"  INTEGER NOT NULL DEFAULT 12,
  "paused"        BOOLEAN NOT NULL DEFAULT false,
  "pinnedSlide"   TEXT,
  "announcement"  TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TournamentScreen_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TournamentScreen_tournamentId_slug_key"
  ON "TournamentScreen"("tournamentId", "slug");

DO $$ BEGIN
  ALTER TABLE "TournamentScreen"
    ADD CONSTRAINT "TournamentScreen_tournamentId_fkey"
    FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
