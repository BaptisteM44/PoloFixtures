-- Correction des tournois passés à tort en « Afghanistan » (bug du menu pays de
-- la page d'édition, corrigé dans le code). Pays déduit de la ville, du
-- continent enregistré et du pays du créateur. À RELIRE avant d'exécuter.
-- Idempotent : ne touche que les lignes encore en « Afghanistan ».

-- Tournois publics
UPDATE "Tournament" SET "country" = 'United Kingdom'           WHERE id = 'cmo7k10410001rrvwudfxxeah' AND "country" = 'Afghanistan'; -- Loogabarooga I, Loughborough
UPDATE "Tournament" SET "country" = 'United States of America' WHERE id = 'cmobzsunc0001d4molslrbvao' AND "country" = 'Afghanistan'; -- SHOOT THE HOOCH, Atlanta
UPDATE "Tournament" SET "country" = 'Spain'                    WHERE id = 'cmpgp7tx30063bve81b2l4xxz' AND "country" = 'Afghanistan'; -- Test Iruña, Iruña
UPDATE "Tournament" SET "country" = 'Russian Federation'       WHERE id = 'cmr51szex00hgyff8puosfeqo' AND "country" = 'Afghanistan'; -- BLOOD & CONCRETE III, Moscow
UPDATE "Tournament" SET "country" = 'United States of America' WHERE id = 'cmr6v1i6z015g32tt30lh2en2' AND "country" = 'Afghanistan'; -- Pick up, Lafayette
UPDATE "Tournament" SET "country" = 'United States of America' WHERE id = 'cmrc9i16700ebphfp34u2o00v' AND "country" = 'Afghanistan'; -- test 2, DC
UPDATE "Tournament" SET "country" = 'United States of America' WHERE id = 'cmtd0otyb03mhm1lczzox92b2' AND "country" = 'Afghanistan'; -- Shuffle Wuffle 4v4, Birmingham (Alabama : continent NA, créateur US)

-- Tournois de test / masqués
UPDATE "Tournament" SET "country" = 'United States of America' WHERE id = 'cmo52ezra0001ojo0p26l9xq5' AND "country" = 'Afghanistan'; -- Test, Washington
UPDATE "Tournament" SET "country" = 'Germany'                  WHERE id = 'cmq304dqy01pw12ms46tzo9zg' AND "country" = 'Afghanistan'; -- testing for mixed 2026
UPDATE "Tournament" SET "country" = 'United States of America', "continentCode" = 'NA'
                                                                WHERE id = 'cmroad5at001ssyodbgasa9nt' AND "country" = 'Afghanistan'; -- Test 1, Pittsburgh (continent EU erroné aussi)
UPDATE "Tournament" SET "country" = 'United States of America' WHERE id = 'cmrp2a5c800c957urnye6kzn1' AND "country" = 'Afghanistan'; -- dfdagg, dc
UPDATE "Tournament" SET "country" = 'United States of America' WHERE id = 'cmtkorpvc0fpbm1lcp99jgs4i' AND "country" = 'Afghanistan'; -- DMV Fall League, New Carrollton

-- Vérification : ne doit plus rester que des tournois du bac à sable.
SELECT id, name, city FROM "Tournament" WHERE "country" = 'Afghanistan';
