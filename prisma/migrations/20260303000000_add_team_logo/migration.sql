-- AddColumn: teamLogoPath
ALTER TABLE "Player" ADD COLUMN "teamLogoPath" TEXT;

-- AddColumn: teamLogoPosition
ALTER TABLE "Player" ADD COLUMN "teamLogoPosition" TEXT NOT NULL DEFAULT 'bottom-right';
