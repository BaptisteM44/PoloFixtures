-- CreateEnum
CREATE TYPE "ClubMemberStatus" AS ENUM ('MEMBER', 'PENDING_BY_MANAGER', 'PENDING_BY_PLAYER');

-- CreateTable
CREATE TABLE "Club" (
    "id"            TEXT NOT NULL,
    "name"          TEXT NOT NULL,
    "city"          TEXT NOT NULL,
    "country"       TEXT NOT NULL,
    "continentCode" TEXT NOT NULL,
    "logoPath"      TEXT,
    "description"   TEXT,
    "website"       TEXT,
    "approved"      BOOLEAN NOT NULL DEFAULT false,
    "managerId"     TEXT NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Club_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubMember" (
    "id"       TEXT NOT NULL,
    "clubId"   TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "status"   "ClubMemberStatus" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClubMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Club_continentCode_idx" ON "Club"("continentCode");
CREATE INDEX "Club_country_idx" ON "Club"("country");
CREATE INDEX "Club_managerId_idx" ON "Club"("managerId");

CREATE UNIQUE INDEX "ClubMember_clubId_playerId_key" ON "ClubMember"("clubId", "playerId");
CREATE INDEX "ClubMember_clubId_idx" ON "ClubMember"("clubId");
CREATE INDEX "ClubMember_playerId_idx" ON "ClubMember"("playerId");

-- AddForeignKey
ALTER TABLE "Club" ADD CONSTRAINT "Club_managerId_fkey"
    FOREIGN KEY ("managerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClubMember" ADD CONSTRAINT "ClubMember_clubId_fkey"
    FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClubMember" ADD CONSTRAINT "ClubMember_playerId_fkey"
    FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
