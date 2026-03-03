-- AlterTable
ALTER TABLE "AccessCode" ADD COLUMN     "operatorId" TEXT;

-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "bio" TEXT;

-- CreateTable
CREATE TABLE "Operator" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roles" "Role"[],
    "tournamentIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Operator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerAccount" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Operator_name_idx" ON "Operator"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerAccount_email_key" ON "PlayerAccount"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerAccount_playerId_key" ON "PlayerAccount"("playerId");

-- CreateIndex
CREATE INDEX "PlayerAccount_email_idx" ON "PlayerAccount"("email");

-- CreateIndex
CREATE INDEX "AccessCode_operatorId_idx" ON "AccessCode"("operatorId");

-- AddForeignKey
ALTER TABLE "AccessCode" ADD CONSTRAINT "AccessCode_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerAccount" ADD CONSTRAINT "PlayerAccount_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
