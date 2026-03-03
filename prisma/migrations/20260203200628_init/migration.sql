-- CreateEnum
CREATE TYPE "Role" AS ENUM ('REF', 'ORGA', 'ADMIN');

-- CreateEnum
CREATE TYPE "PlayerStatus" AS ENUM ('ACTIVE', 'PENDING', 'REJECTED');

-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('UPCOMING', 'LIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "SaturdayFormat" AS ENUM ('ALL_DAY', 'SPLIT_POOLS');

-- CreateEnum
CREATE TYPE "SundayFormat" AS ENUM ('SE', 'DE');

-- CreateEnum
CREATE TYPE "SponsorTier" AS ENUM ('GOLD', 'SILVER', 'BRONZE');

-- CreateEnum
CREATE TYPE "MatchPhase" AS ENUM ('POOL', 'BRACKET');

-- CreateEnum
CREATE TYPE "BracketSide" AS ENUM ('W', 'L', 'G');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('SCHEDULED', 'LIVE', 'FINISHED');

-- CreateEnum
CREATE TYPE "MatchEventType" AS ENUM ('START', 'PAUSE', 'GOAL', 'PENALTY', 'TIMEOUT', 'TIME_ADJUST', 'END');

-- CreateEnum
CREATE TYPE "PoolSession" AS ENUM ('MORNING', 'AFTERNOON');

-- CreateEnum
CREATE TYPE "MatchDay" AS ENUM ('SAT', 'SUN');

-- CreateTable
CREATE TABLE "AccessCode" (
    "id" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "tournamentId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tournament" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "continentCode" TEXT NOT NULL,
    "region" TEXT,
    "country" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "dateStart" TIMESTAMP(3) NOT NULL,
    "dateEnd" TIMESTAMP(3) NOT NULL,
    "format" TEXT NOT NULL,
    "gameDurationMin" INTEGER NOT NULL,
    "maxTeams" INTEGER NOT NULL,
    "courtsCount" INTEGER NOT NULL,
    "registrationFeePerTeam" INTEGER NOT NULL,
    "registrationFeeCurrency" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "fridayWelcomeName" TEXT,
    "fridayWelcomeAddress" TEXT,
    "fridayWelcomeMapsUrl" TEXT,
    "saturdayEventName" TEXT,
    "saturdayEventAddress" TEXT,
    "saturdayEventMapsUrl" TEXT,
    "otherNotes" TEXT,
    "links" TEXT[],
    "bannerPath" TEXT,
    "streamYoutubeUrl" TEXT,
    "saturdayFormat" "SaturdayFormat" NOT NULL,
    "sundayFormat" "SundayFormat" NOT NULL,
    "status" "TournamentStatus" NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sponsor" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "tier" "SponsorTier" NOT NULL,
    "name" TEXT NOT NULL,
    "logoPath" TEXT,
    "url" TEXT,

    CONSTRAINT "Sponsor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "country" TEXT,
    "color" TEXT,
    "seed" INTEGER NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "city" TEXT,
    "photoPath" TEXT,
    "status" "PlayerStatus" NOT NULL DEFAULT 'PENDING',
    "badges" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamPlayer" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "isCaptain" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TeamPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pool" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "session" "PoolSession",

    CONSTRAINT "Pool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoolTeam" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,

    CONSTRAINT "PoolTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "phase" "MatchPhase" NOT NULL,
    "poolId" TEXT,
    "bracketSide" "BracketSide",
    "roundIndex" INTEGER NOT NULL,
    "courtName" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "dayIndex" "MatchDay" NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'SCHEDULED',
    "teamAId" TEXT,
    "teamBId" TEXT,
    "scoreA" INTEGER NOT NULL DEFAULT 0,
    "scoreB" INTEGER NOT NULL DEFAULT 0,
    "winnerTeamId" TEXT,
    "nextMatchWinId" TEXT,
    "nextSlotWin" TEXT,
    "nextMatchLoseId" TEXT,
    "nextSlotLose" TEXT,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchEvent" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "type" "MatchEventType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matchClockSec" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "MatchEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnownBikePoloCountry" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "KnownBikePoloCountry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FreeAgent" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "city" TEXT,
    "country" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FreeAgent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccessCode_role_idx" ON "AccessCode"("role");

-- CreateIndex
CREATE INDEX "AccessCode_tournamentId_idx" ON "AccessCode"("tournamentId");

-- CreateIndex
CREATE INDEX "Tournament_continentCode_idx" ON "Tournament"("continentCode");

-- CreateIndex
CREATE INDEX "Tournament_status_idx" ON "Tournament"("status");

-- CreateIndex
CREATE INDEX "Sponsor_tournamentId_idx" ON "Sponsor"("tournamentId");

-- CreateIndex
CREATE INDEX "Team_tournamentId_idx" ON "Team"("tournamentId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamPlayer_teamId_playerId_key" ON "TeamPlayer"("teamId", "playerId");

-- CreateIndex
CREATE INDEX "Pool_tournamentId_idx" ON "Pool"("tournamentId");

-- CreateIndex
CREATE UNIQUE INDEX "PoolTeam_poolId_teamId_key" ON "PoolTeam"("poolId", "teamId");

-- CreateIndex
CREATE INDEX "Match_tournamentId_idx" ON "Match"("tournamentId");

-- CreateIndex
CREATE INDEX "Match_poolId_idx" ON "Match"("poolId");

-- CreateIndex
CREATE INDEX "Match_status_idx" ON "Match"("status");

-- CreateIndex
CREATE INDEX "MatchEvent_matchId_idx" ON "MatchEvent"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "KnownBikePoloCountry_code_key" ON "KnownBikePoloCountry"("code");

-- CreateIndex
CREATE INDEX "FreeAgent_tournamentId_idx" ON "FreeAgent"("tournamentId");

-- AddForeignKey
ALTER TABLE "AccessCode" ADD CONSTRAINT "AccessCode_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sponsor" ADD CONSTRAINT "Sponsor_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamPlayer" ADD CONSTRAINT "TeamPlayer_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamPlayer" ADD CONSTRAINT "TeamPlayer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pool" ADD CONSTRAINT "Pool_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoolTeam" ADD CONSTRAINT "PoolTeam_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoolTeam" ADD CONSTRAINT "PoolTeam_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_teamAId_fkey" FOREIGN KEY ("teamAId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_teamBId_fkey" FOREIGN KEY ("teamBId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchEvent" ADD CONSTRAINT "MatchEvent_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreeAgent" ADD CONSTRAINT "FreeAgent_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE SET NULL ON UPDATE CASCADE;
