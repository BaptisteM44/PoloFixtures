-- Notifications push dans la langue de chaque appareil.
-- À lancer AVANT de déployer le code. Rejouable sans risque. Aucune donnée modifiée
-- (les appareils déjà abonnés reçoivent leur langue à leur prochaine visite ;
-- en attendant, elle est devinée d'après le pays du joueur).

ALTER TABLE "PushSubscription" ADD COLUMN IF NOT EXISTS "locale" TEXT;
