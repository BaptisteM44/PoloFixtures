-- Villes : une seule écriture par ville (« Berlin », « Berlin␣ », « berlin »
-- → « Berlin »). Pour chaque ville (comparaison sans casse ni espaces autour),
-- on garde l'écriture la plus fréquente qui commence par une majuscule.
-- Joueurs : ~349 fiches retouchées, clubs : 3 (mesuré en prod le 2026-10-08).
-- Idempotent. Ne fusionne PAS les langues (« Wien » / « Vienna » restent distincts).

WITH v AS (
  SELECT lower(trim(city)) AS k, trim(city) AS spelling, count(*) AS n
  FROM "Player" WHERE city IS NOT NULL AND trim(city) <> '' GROUP BY 1, 2
), best AS (
  SELECT DISTINCT ON (k) k, spelling FROM v ORDER BY k, (spelling ~ '^[[:upper:]]') DESC, n DESC, spelling
)
UPDATE "Player" p SET city = best.spelling
FROM best WHERE lower(trim(p.city)) = best.k AND p.city <> best.spelling;

WITH v AS (
  SELECT lower(trim(city)) AS k, trim(city) AS spelling, count(*) AS n
  FROM "Club" WHERE city IS NOT NULL AND trim(city) <> '' GROUP BY 1, 2
), best AS (
  SELECT DISTINCT ON (k) k, spelling FROM v ORDER BY k, (spelling ~ '^[[:upper:]]') DESC, n DESC, spelling
)
UPDATE "Club" c SET city = best.spelling
FROM best WHERE lower(trim(c.city)) = best.k AND c.city <> best.spelling;

-- Espaces autour des villes restantes (écriture unique mais « Hobart␣ »).
UPDATE "Player" SET city = trim(city) WHERE city <> trim(city);
UPDATE "Club" SET city = trim(city) WHERE city <> trim(city);
