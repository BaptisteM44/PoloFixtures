-- Add RR to SundayFormat enum
ALTER TYPE "SundayFormat" ADD VALUE IF NOT EXISTS 'RR';

-- Add thirdPlaceMatch and gfReset to Tournament
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "thirdPlaceMatch" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "gfReset" BOOLEAN NOT NULL DEFAULT false;
