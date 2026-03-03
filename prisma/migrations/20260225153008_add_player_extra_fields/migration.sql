-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "hand" TEXT,
ADD COLUMN     "isFlinta" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "startYear" INTEGER;
