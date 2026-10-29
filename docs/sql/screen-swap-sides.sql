-- Écrans de salle : inverser gauche/droite sur un écran de terrain, sans toucher
-- à l'arbitrage (la TV peut voir le terrain depuis l'autre côté que l'arbitre).
--
-- À lancer AVANT de déployer le code (sinon les écrans et l'onglet Jour J
-- plantent : la colonne est lue partout où un écran est chargé).
-- Rejouable sans risque. N'efface rien.

ALTER TABLE "TournamentScreen" ADD COLUMN IF NOT EXISTS "swapSides" BOOLEAN NOT NULL DEFAULT false;

-- Vérification : doit renvoyer une ligne « swapSides | boolean | false »
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'TournamentScreen' AND column_name = 'swapSides';
