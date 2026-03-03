-- CreateEnum
CREATE TYPE "ChatMode" AS ENUM ('OPEN', 'ORG_ONLY', 'DISABLED');

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "chatMode" "ChatMode" NOT NULL DEFAULT 'DISABLED';

-- CreateTable
CREATE TABLE "TournamentMessage" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TournamentMessage_tournamentId_idx" ON "TournamentMessage"("tournamentId");

-- CreateIndex
CREATE INDEX "TournamentMessage_authorId_idx" ON "TournamentMessage"("authorId");

-- AddForeignKey
ALTER TABLE "TournamentMessage" ADD CONSTRAINT "TournamentMessage_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentMessage" ADD CONSTRAINT "TournamentMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
