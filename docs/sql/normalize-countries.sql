-- Normalisation des pays (joueurs et clubs) : toutes les écritures d'un même
-- pays (« FR », « france », « Deutschland », « USA », 🇬🇧…) deviennent son nom
-- officiel, celui des listes déroulantes. Généré depuis la prod le 2026-09-26.
-- Idempotent (ne touche que les valeurs exactes listées). À RELIRE avant d'exécuter.
-- Les saisies incompréhensibles (« a », « TBA », « ? »…) et les faux joueurs du
-- bac à sable (« XX ») ne sont pas touchés.

-- Player
UPDATE "Player" SET "country" = 'Germany' WHERE "country" = 'Deutschland'; -- 88
UPDATE "Player" SET "country" = 'United States of America' WHERE "country" = 'United States'; -- 78
UPDATE "Player" SET "country" = 'United Kingdom' WHERE "country" = 'GB'; -- 53
UPDATE "Player" SET "country" = 'Germany' WHERE "country" = 'DE'; -- 53
UPDATE "Player" SET "country" = 'France' WHERE "country" = 'FR'; -- 51
UPDATE "Player" SET "country" = 'Russian Federation' WHERE "country" = 'Russia'; -- 50
UPDATE "Player" SET "country" = 'United Kingdom' WHERE "country" = 'UK'; -- 40
UPDATE "Player" SET "country" = 'United States of America' WHERE "country" = 'US'; -- 40
UPDATE "Player" SET "country" = 'Austria' WHERE "country" = 'AT'; -- 28
UPDATE "Player" SET "country" = 'Switzerland' WHERE "country" = 'CH'; -- 27
UPDATE "Player" SET "country" = 'Italy' WHERE "country" = 'IT'; -- 24
UPDATE "Player" SET "country" = 'Spain' WHERE "country" = 'ES'; -- 23
UPDATE "Player" SET "country" = 'United States of America' WHERE "country" = 'USA'; -- 22
UPDATE "Player" SET "country" = 'Brazil' WHERE "country" = 'Brasil'; -- 18
UPDATE "Player" SET "country" = 'Switzerland' WHERE "country" = 'Suisse'; -- 15
UPDATE "Player" SET "country" = 'France' WHERE "country" = 'france'; -- 12
UPDATE "Player" SET "country" = 'Germany' WHERE "country" = 'de'; -- 12
UPDATE "Player" SET "country" = 'Brazil' WHERE "country" = 'BR'; -- 11
UPDATE "Player" SET "country" = 'Russian Federation' WHERE "country" = 'RU'; -- 10
UPDATE "Player" SET "country" = 'Poland' WHERE "country" = 'PL'; -- 10
UPDATE "Player" SET "country" = 'France' WHERE "country" = 'FRANCE'; -- 10
UPDATE "Player" SET "country" = 'Colombia' WHERE "country" = 'CO'; -- 10
UPDATE "Player" SET "country" = 'Germany' WHERE "country" = 'Allemagne'; -- 9
UPDATE "Player" SET "country" = 'Austria' WHERE "country" = 'Österreich'; -- 8
UPDATE "Player" SET "country" = 'Spain' WHERE "country" = 'España'; -- 8
UPDATE "Player" SET "country" = 'Belgium' WHERE "country" = 'BE'; -- 7
UPDATE "Player" SET "country" = 'Belgium' WHERE "country" = 'Belgique'; -- 7
UPDATE "Player" SET "country" = 'Australia' WHERE "country" = 'AU'; -- 7
UPDATE "Player" SET "country" = 'Russian Federation' WHERE "country" = 'Россия'; -- 7
UPDATE "Player" SET "country" = 'United Kingdom' WHERE "country" = 'Wales'; -- 6
UPDATE "Player" SET "country" = 'United Kingdom' WHERE "country" = 'Uk'; -- 5
UPDATE "Player" SET "country" = 'France' WHERE "country" = 'France '; -- 5
UPDATE "Player" SET "country" = 'Germany' WHERE "country" = 'De'; -- 5
UPDATE "Player" SET "country" = 'Spain' WHERE "country" = 'ESPAGNE'; -- 5
UPDATE "Player" SET "country" = 'Germany' WHERE "country" = 'germany'; -- 5
UPDATE "Player" SET "country" = 'Spain' WHERE "country" = 'Espagne'; -- 5
UPDATE "Player" SET "country" = 'Poland' WHERE "country" = 'Poland '; -- 5
UPDATE "Player" SET "country" = 'Austria' WHERE "country" = 'at'; -- 5
UPDATE "Player" SET "country" = 'Germany' WHERE "country" = 'Allemagne '; -- 4
UPDATE "Player" SET "country" = 'Czech Republic' WHERE "country" = 'CZ'; -- 4
UPDATE "Player" SET "country" = 'United States of America' WHERE "country" = 'Usa'; -- 4
UPDATE "Player" SET "country" = 'Germany' WHERE "country" = 'Deutschland '; -- 4
UPDATE "Player" SET "country" = 'United Kingdom' WHERE "country" = 'England'; -- 4
UPDATE "Player" SET "country" = 'Mexico' WHERE "country" = 'MX'; -- 4
UPDATE "Player" SET "country" = 'Peru' WHERE "country" = 'PE'; -- 4
UPDATE "Player" SET "country" = 'Poland' WHERE "country" = 'pl'; -- 4
UPDATE "Player" SET "country" = 'Brazil' WHERE "country" = 'brasil'; -- 4
UPDATE "Player" SET "country" = 'Colombia' WHERE "country" = 'Colombia '; -- 3
UPDATE "Player" SET "country" = 'Taiwan, Province of China' WHERE "country" = 'Taiwan'; -- 3
UPDATE "Player" SET "country" = 'Czech Republic' WHERE "country" = 'cz'; -- 3
UPDATE "Player" SET "country" = 'Netherlands' WHERE "country" = 'NL'; -- 3
UPDATE "Player" SET "country" = 'United Kingdom' WHERE "country" = 'uk'; -- 3
UPDATE "Player" SET "country" = 'Georgia' WHERE "country" = 'GE'; -- 2
UPDATE "Player" SET "country" = 'Argentina' WHERE "country" = 'AR'; -- 2
UPDATE "Player" SET "country" = 'Switzerland' WHERE "country" = 'Suisse '; -- 2
UPDATE "Player" SET "country" = 'Australia' WHERE "country" = 'Australia '; -- 2
UPDATE "Player" SET "country" = 'United States of America' WHERE "country" = 'United States '; -- 2
UPDATE "Player" SET "country" = 'Hungary' WHERE "country" = 'HU'; -- 2
UPDATE "Player" SET "country" = 'Germany' WHERE "country" = 'deutschland'; -- 2
UPDATE "Player" SET "country" = 'Ukraine' WHERE "country" = 'UA'; -- 2
UPDATE "Player" SET "country" = 'Italy' WHERE "country" = 'it'; -- 2
UPDATE "Player" SET "country" = 'Russian Federation' WHERE "country" = 'Russia '; -- 2
UPDATE "Player" SET "country" = 'Germany' WHERE "country" = 'Berlin'; -- 2
UPDATE "Player" SET "country" = 'Switzerland' WHERE "country" = 'ch'; -- 2
UPDATE "Player" SET "country" = 'Croatia' WHERE "country" = 'HR'; -- 2
UPDATE "Player" SET "country" = 'Austria' WHERE "country" = 'Vienna'; -- 1
UPDATE "Player" SET "country" = 'Austria' WHERE "country" = 'Austria '; -- 1
UPDATE "Player" SET "country" = 'Guatemala' WHERE "country" = 'GT'; -- 1
UPDATE "Player" SET "country" = 'United Kingdom' WHERE "country" = 'England '; -- 1
UPDATE "Player" SET "country" = 'Italy' WHERE "country" = 'ITALY'; -- 1
UPDATE "Player" SET "country" = 'Spain' WHERE "country" = 'espagne'; -- 1
UPDATE "Player" SET "country" = 'Switzerland' WHERE "country" = 'Bern'; -- 1
UPDATE "Player" SET "country" = 'Venezuela' WHERE "country" = 'VE'; -- 1
UPDATE "Player" SET "country" = 'Switzerland' WHERE "country" = 'Swiss'; -- 1
UPDATE "Player" SET "country" = 'Austria' WHERE "country" = 'Linz'; -- 1
UPDATE "Player" SET "country" = 'New Zealand' WHERE "country" = 'NZ'; -- 1
UPDATE "Player" SET "country" = 'New Zealand' WHERE "country" = 'new zealand '; -- 1
UPDATE "Player" SET "country" = 'Lithuania' WHERE "country" = 'LT'; -- 1
UPDATE "Player" SET "country" = 'Czech Republic' WHERE "country" = 'Czechia'; -- 1
UPDATE "Player" SET "country" = 'Italy' WHERE "country" = 'Italy '; -- 1
UPDATE "Player" SET "country" = 'Australia' WHERE "country" = 'Australie'; -- 1
UPDATE "Player" SET "country" = 'Belgium' WHERE "country" = 'Belgium '; -- 1
UPDATE "Player" SET "country" = 'Spain' WHERE "country" = 'Espagne '; -- 1
UPDATE "Player" SET "country" = 'Türkiye' WHERE "country" = 'Turkey'; -- 1
UPDATE "Player" SET "country" = 'Switzerland' WHERE "country" = 'switzerland'; -- 1
UPDATE "Player" SET "country" = 'Netherlands' WHERE "country" = 'Netherlands '; -- 1
UPDATE "Player" SET "country" = 'Russian Federation' WHERE "country" = 'Санкт-Петербург'; -- 1
UPDATE "Player" SET "country" = 'Switzerland' WHERE "country" = 'Swizerland'; -- 1
UPDATE "Player" SET "country" = 'France' WHERE "country" = 'Fr'; -- 1
UPDATE "Player" SET "country" = 'United Kingdom' WHERE "country" = 'Inglaterra'; -- 1
UPDATE "Player" SET "country" = 'Austria' WHERE "country" = 'vienna'; -- 1
UPDATE "Player" SET "country" = 'Italy' WHERE "country" = 'italy'; -- 1
UPDATE "Player" SET "country" = 'Puerto Rico' WHERE "country" = 'Puerto Rico '; -- 1
UPDATE "Player" SET "country" = 'United States of America' WHERE "country" = 'Usa '; -- 1
UPDATE "Player" SET "country" = 'Italy' WHERE "country" = 'Italia'; -- 1
UPDATE "Player" SET "country" = 'Spain' WHERE "country" = 'Cataluña'; -- 1
UPDATE "Player" SET "country" = 'Poland' WHERE "country" = 'poland'; -- 1
UPDATE "Player" SET "country" = 'Czech Republic' WHERE "country" = 'czech republic'; -- 1
UPDATE "Player" SET "country" = 'Canada' WHERE "country" = 'CA'; -- 1
UPDATE "Player" SET "country" = 'Czech Republic' WHERE "country" = 'Czech Republic '; -- 1
UPDATE "Player" SET "country" = 'Italy' WHERE "country" = 'It'; -- 1
UPDATE "Player" SET "country" = 'United Kingdom' WHERE "country" = 'London'; -- 1
UPDATE "Player" SET "country" = 'Germany' WHERE "country" = 'allemagne'; -- 1
UPDATE "Player" SET "country" = 'Russian Federation' WHERE "country" = 'Россия '; -- 1
UPDATE "Player" SET "country" = 'France' WHERE "country" = 'fr'; -- 1
UPDATE "Player" SET "country" = 'France' WHERE "country" = 'Bordeaux'; -- 1
UPDATE "Player" SET "country" = 'France' WHERE "country" = 'Franc '; -- 1
UPDATE "Player" SET "country" = 'Republic of the Congo' WHERE "country" = 'CG'; -- 1
UPDATE "Player" SET "country" = 'Indonesia' WHERE "country" = 'ID'; -- 1
UPDATE "Player" SET "country" = 'Russian Federation' WHERE "country" = 'РоссиЯ'; -- 1
UPDATE "Player" SET "country" = 'France' WHERE "country" = 'Francia'; -- 1
UPDATE "Player" SET "country" = 'Germany' WHERE "country" = 'deutschland '; -- 1
UPDATE "Player" SET "country" = 'Switzerland' WHERE "country" = 'suisse'; -- 1
UPDATE "Player" SET "country" = 'Tunisia' WHERE "country" = 'TN'; -- 1
UPDATE "Player" SET "country" = 'United Kingdom' WHERE "country" = '🇬🇧'; -- 1
UPDATE "Player" SET "country" = 'Switzerland' WHERE "country" = 'Suiss'; -- 1
UPDATE "Player" SET "country" = 'Mexico' WHERE "country" = 'mexico'; -- 1
UPDATE "Player" SET "country" = 'Portugal' WHERE "country" = 'PT'; -- 1
UPDATE "Player" SET "country" = 'Ireland' WHERE "country" = 'IE'; -- 1
UPDATE "Player" SET "country" = 'Czech Republic' WHERE "country" = 'Czech Republik'; -- 1
-- Player : 916 lignes normalisées

-- Club
UPDATE "Club" SET "country" = 'United States of America' WHERE "country" = 'United States'; -- 29
UPDATE "Club" SET "country" = 'Russian Federation' WHERE "country" = 'Russia'; -- 4
UPDATE "Club" SET "country" = 'Taiwan, Province of China' WHERE "country" = 'Taiwan'; -- 2
-- Club : 35 lignes normalisées

-- Vérification : écritures restantes non officielles
SELECT country, count(*) FROM "Player" WHERE country <> 'XX' GROUP BY country ORDER BY count(*) DESC;
