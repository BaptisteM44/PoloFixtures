-- ABC Chapeau : dévoilement des équipes (bouton « Dévoiler les équipes »).
-- À LANCER AVANT le déploiement du code qui lit cette colonne. Rejouable sans risque.

ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "teamsRevealedAt" TIMESTAMP(3);

-- Ne rien cacher de ce qui est déjà public : tournois ABC déjà validés,
-- lancés ou terminés → considérés comme dévoilés.
UPDATE "Tournament"
SET "teamsRevealedAt" = NOW()
WHERE "format" = 'ABC Chapeau'
  AND "teamsRevealedAt" IS NULL
  AND ("selectionLocked" = true OR "status" IN ('LIVE', 'COMPLETED'));

-- Notification « les équipes sont dévoilées ».
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TEAMS_REVEALED';
