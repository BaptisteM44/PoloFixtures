-- AddColumn testMode to Tournament
ALTER TABLE "Tournament" ADD COLUMN "testMode" BOOLEAN NOT NULL DEFAULT false;
