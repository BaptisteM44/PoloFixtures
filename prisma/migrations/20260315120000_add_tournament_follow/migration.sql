CREATE TABLE "TournamentFollow" (
  "id" TEXT NOT NULL,
  "playerId" TEXT NOT NULL,
  "tournamentId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TournamentFollow_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TournamentFollow_playerId_tournamentId_key" ON "TournamentFollow"("playerId", "tournamentId");
ALTER TABLE "TournamentFollow" ADD CONSTRAINT "TournamentFollow_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TournamentFollow" ADD CONSTRAINT "TournamentFollow_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
