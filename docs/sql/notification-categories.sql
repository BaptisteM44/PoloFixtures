-- Préférences de notification par catégorie. Idempotent — à passer sur
-- Coolify AVANT de déployer.

ALTER TABLE "NotificationPreference" ADD COLUMN IF NOT EXISTS "mutedCategories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- L'ancien interrupteur « Recevoir les notifications de tournois » (enabled)
-- coupait les nouveaux tournois et les notifs de club. Il devient
-- l'interrupteur GÉNÉRAL : pour que personne ne perde ou ne gagne rien, ceux
-- qui l'avaient décoché gardent exactement ce qu'ils recevaient (tournois et
-- clubs coupés, le reste actif). Ne touche qu'une fois chaque ligne.
UPDATE "NotificationPreference"
SET "enabled" = true,
    "notifyNewTournaments" = false,
    "mutedCategories" = ARRAY['clubs']::TEXT[]
WHERE "enabled" = false AND "mutedCategories" = ARRAY[]::TEXT[];
