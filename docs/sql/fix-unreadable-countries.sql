-- Pays illisibles (2e passe) : uniquement les joueurs dont la ville permet de
-- trancher sans risque. Généré depuis la prod le 2026-10-08. Idempotent (cible
-- chaque joueur par son id ET son ancienne valeur). Aucun de ces joueurs n'a
-- de compte : ce sont des joueurs ajoutés à la main par des orgas.
-- Les saisies bidons (« a », « asdf », « TBA », « ? », « Instant mix »…) ne
-- sont PAS touchées.

UPDATE "Player" SET "country" = 'Australia' WHERE "id" = 'cmq1kl82s00by12msywhlpkmy' AND "country" = 'AUS';          -- Dr Andy, Melbourne
UPDATE "Player" SET "country" = 'Australia' WHERE "id" = 'cmp5cbzmw0009hkc9ea3oc1z0' AND "country" = 'Aus';          -- Shannon F, Hobart
UPDATE "Player" SET "country" = 'Australia' WHERE "id" = 'cmp5cbzfi0008hkc9s0d5shn5' AND "country" = 'Aus';          -- Robert H, Hobart
UPDATE "Player" SET "country" = 'Australia' WHERE "id" = 'cmp5cbztt000ahkc9u0lswqqm' AND "country" = 'Aus';          -- Max N, Brisbane
UPDATE "Player" SET "country" = 'Czech Republic' WHERE "id" = 'cmujnjefa00ownbl8ty46xf7n' AND "country" = 'Czech';   -- Frax, Prague
UPDATE "Player" SET "country" = 'United States of America' WHERE "id" = 'cmr1aa7il012lsn09x1xxx6lz' AND "country" = 'NY'; -- Hannah, New York
UPDATE "Player" SET "country" = 'Italy' WHERE "id" = 'cmurtgjjd0788nbl8gvem9zbb' AND "country" = 'Sicilia';          -- Sicile
UPDATE "Player" SET "country" = 'Germany' WHERE "id" = 'cmpzoy59c00f314ji989yvick' AND "country" = 'Welt';           -- Holger, Schwerin
UPDATE "Player" SET "country" = 'Germany' WHERE "id" = 'cmpzkjrem009p14jiu57t1uvf' AND "country" = 'Welt';           -- Holger, Schwerin (doublon)
UPDATE "Player" SET "country" = 'Germany' WHERE "id" = 'cmpw74z8600bj9h4c7foptsgy' AND "country" = 'Welt';           -- Holger, Schwerin (doublon)
UPDATE "Player" SET "country" = 'Germany' WHERE "id" = 'cmpw77q9u00by9h4cmy8boq5y' AND "country" = 'Z';              -- Marcel, Mainz
UPDATE "Player" SET "country" = 'Canada' WHERE "id" = 'cmp3uomms038jlf8hn7phcx3n' AND "country" = 'can';             -- Lou, Montréal
UPDATE "Player" SET "country" = 'Germany' WHERE "id" = 'cmuiwg8ve02rhgmvjje82p1ck' AND "country" = 'deutschland';    -- pedro, München
UPDATE "Player" SET "country" = 'Spain' WHERE "id" = 'cmp3uv5y1039zlf8hieaivmiw' AND "country" = 'sp';               -- romina, Barcelona
