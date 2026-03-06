-- AlterEnum: add GOLDEN_GOAL to MatchEventType
ALTER TYPE "MatchEventType" ADD VALUE 'GOLDEN_GOAL';

-- AlterTable: add goldenGoal column to Match
ALTER TABLE "Match" ADD COLUMN "goldenGoal" BOOLEAN NOT NULL DEFAULT false;
