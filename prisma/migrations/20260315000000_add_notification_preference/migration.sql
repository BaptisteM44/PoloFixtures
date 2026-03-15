CREATE TABLE "NotificationPreference" (
  "id" TEXT NOT NULL,
  "playerId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "continents" TEXT[] NOT NULL DEFAULT '{}',
  "countries" TEXT[] NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NotificationPreference_playerId_key" ON "NotificationPreference"("playerId");
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
