ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "playerALevel" TEXT;
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "playerBLevel" TEXT;
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "playerCLevel" TEXT;

ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "maxSoloPlayers" INTEGER;

CREATE TABLE IF NOT EXISTS "TournamentSoloEntry" (
  "id" TEXT NOT NULL,
  "tournamentId" TEXT NOT NULL,
  "playerId" TEXT NOT NULL,
  "level" TEXT NOT NULL,
  "teamId" TEXT,
  "waitlisted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TournamentSoloEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TournamentSoloEntry_tournamentId_playerId_key" UNIQUE ("tournamentId", "playerId"),
  CONSTRAINT "TournamentSoloEntry_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TournamentSoloEntry_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TournamentSoloEntry_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
