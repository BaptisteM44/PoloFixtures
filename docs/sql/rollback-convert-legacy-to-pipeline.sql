-- ANNULATION de docs/sql/convert-legacy-to-pipeline.sql (à ne lancer qu'en cas de problème).
-- Remet sur l'ancien système de formats les 12 tournois convertis le 29/10/2026,
-- tant qu'aucune étape n'y a été créée (sinon on casserait leur nouveau format).
-- Tournois : test-lyon-2026, testing-for-mixed-2026-fake-berlin-2026, liga-bike-polo-bogota-2026-bogota-2026, test-washington-2026, dfdagg-dc-2026, back-to-school-mixed-boston-2026, broken-broccoli-utrecht-2026, swiss-champs-2026-zurich-2026, poloween-2026-glasgow-2026, herducken-i-richmond-2026, pharaohs-international-bike-polo-cup-cairo-2026, lovin-two-two-10-salies-du-salat-2027

UPDATE "Tournament" t
SET "usesPipeline" = false
WHERE t.id IN ('cmpayirjk0003wmaxx2gron87', 'cmq304dqy01pw12ms46tzo9zg', 'cmp2p4s10033mlf8h0vvnwegj', 'cmo52ezra0001ojo0p26l9xq5', 'cmrp2a5c800c957urnye6kzn1', 'cmpcl76iv000ffjr377laud1n', 'cmqf3p94z006kzbwu83cbnaus', 'cmrevv5qy0163phfpj265knpw', 'cmsdf797j03i1z2wd5vpo9jl5', 'cmrf0iboq016lphfphaulmrcs', 'cmqa3lfgh003z5tlz1e3vnjus', 'cmn6cg4m4000ar0vpgvu3noat')
  AND NOT EXISTS (SELECT 1 FROM "Stage" s WHERE s."tournamentId" = t.id);
