ALTER TABLE "Match" ADD COLUMN "refereePlayerId" TEXT;
ALTER TABLE "Match" ADD CONSTRAINT "Match_refereePlayerId_fkey" FOREIGN KEY ("refereePlayerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;
