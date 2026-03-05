-- Migration: add reset token fields to PlayerAccount
ALTER TABLE "PlayerAccount" ADD COLUMN IF NOT EXISTS "resetToken" TEXT;
ALTER TABLE "PlayerAccount" ADD COLUMN IF NOT EXISTS "resetTokenExpiry" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "PlayerAccount_resetToken_key" ON "PlayerAccount"("resetToken");
