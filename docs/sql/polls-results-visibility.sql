-- Visibilité des résultats pour les votants + date d'ouverture des résultats.
-- Idempotent — à exécuter APRÈS docs/sql/polls.sql, AVANT de déployer le code
-- qui utilise ces champs.

DO $$ BEGIN
  CREATE TYPE "PollResultsMode" AS ENUM ('IMMEDIATE', 'AT_DATE', 'AT_CLOSE', 'HIDDEN');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "Poll" ADD COLUMN IF NOT EXISTS "showResults" "PollResultsMode" NOT NULL DEFAULT 'IMMEDIATE';
ALTER TABLE "Poll" ADD COLUMN IF NOT EXISTS "resultsAt" TIMESTAMP(3);
