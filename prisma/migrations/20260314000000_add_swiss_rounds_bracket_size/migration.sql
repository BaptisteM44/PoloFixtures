-- AlterTable: add swissRounds and bracketSize to Tournament
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "swissRounds" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "bracketSize" INTEGER NOT NULL DEFAULT 16;
