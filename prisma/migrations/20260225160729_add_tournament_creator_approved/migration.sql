-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "approved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "creatorId" TEXT;

-- CreateIndex
CREATE INDEX "Tournament_creatorId_idx" ON "Tournament"("creatorId");

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;
