-- Identité du votant INSCRIT (playerId) pour stats démographiques admin.
-- Reste séparé du BULLETIN (choix voté) — PollBallot n'a et n'aura jamais ce
-- lien. Idempotent — à exécuter APRÈS polls.sql et
-- polls-results-visibility.sql, AVANT de déployer le code qui l'utilise.

ALTER TABLE "PollVoter" ADD COLUMN IF NOT EXISTS "playerId" TEXT;

CREATE INDEX IF NOT EXISTS "PollVoter_playerId_idx" ON "PollVoter"("playerId");

DO $$ BEGIN
  ALTER TABLE "PollVoter" ADD CONSTRAINT "PollVoter_playerId_fkey"
    FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
