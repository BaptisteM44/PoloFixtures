CREATE TABLE "LoginDay" (
  "id"        TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "date"      TEXT NOT NULL,
  "loggedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LoginDay_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LoginDay_accountId_date_key" UNIQUE ("accountId", "date"),
  CONSTRAINT "LoginDay_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "PlayerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "LoginDay_accountId_idx" ON "LoginDay"("accountId");
