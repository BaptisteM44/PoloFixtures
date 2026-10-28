-- Fin des anciens formats : les tournois pas encore terminés de l'ancien
-- système passent au système d'étapes (onglet Format du dashboard).
--
-- À lancer AVANT de déployer le code qui retire le pilotage des anciens formats.
-- Rejouable sans risque. Ne supprime rien : seul le drapeau change.
--
-- Concerné au 28/10/2026 : 12 tournois, tous sans match, sans poule, sans
-- étape (4 vrais : Poloween, Herducken I, Pharaohs Cup, Lovin' Two Two ;
-- 8 tournois de test passés). Les orgas choisiront leur format dans l'onglet
-- Format — la frise du dashboard leur affiche « Choisis le format ».
--
-- Les tournois TERMINÉS de l'ancien système (53) ne sont pas touchés : ils
-- restent affichés en archive.

-- 1) Aperçu : ce qui va être converti
SELECT slug, status, "dateStart"::date AS debut, "saturdayFormat", "sundayFormat", "testMode"
FROM "Tournament" t
WHERE NOT t."usesPipeline"
  AND t.status <> 'COMPLETED'
  AND NOT EXISTS (SELECT 1 FROM "Match" m WHERE m."tournamentId" = t.id)
  AND NOT EXISTS (SELECT 1 FROM "Pool" p WHERE p."tournamentId" = t.id)
ORDER BY t."dateStart";

-- 2) Conversion (garde-fous : jamais un tournoi terminé, ni un tournoi avec des matchs ou des poules)
UPDATE "Tournament" t
SET "usesPipeline" = true
WHERE NOT t."usesPipeline"
  AND t.status <> 'COMPLETED'
  AND NOT EXISTS (SELECT 1 FROM "Match" m WHERE m."tournamentId" = t.id)
  AND NOT EXISTS (SELECT 1 FROM "Pool" p WHERE p."tournamentId" = t.id);

-- 3) Vérification : doit renvoyer 0 ligne (plus aucun tournoi en cours sur l'ancien système)
SELECT slug, status
FROM "Tournament"
WHERE NOT "usesPipeline" AND status <> 'COMPLETED';
