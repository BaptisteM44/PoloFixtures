ALTER TABLE "NotificationPreference" ADD COLUMN IF NOT EXISTS "notifyNewTournaments" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "NotificationPreference" ADD COLUMN IF NOT EXISTS "notifyFollowedClosing" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "NotificationPreference" ADD COLUMN IF NOT EXISTS "notifySquadInvite" BOOLEAN NOT NULL DEFAULT true;
