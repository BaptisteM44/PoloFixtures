-- Sondages : bornes du nombre de choix (multi-choix) + commentaire anonyme.
-- Idempotent — à exécuter APRÈS les précédents polls*.sql, AVANT de déployer
-- le code qui utilise ces champs.

ALTER TABLE "Poll" ADD COLUMN IF NOT EXISTS "minChoices" INTEGER;
ALTER TABLE "Poll" ADD COLUMN IF NOT EXISTS "maxChoices" INTEGER;
ALTER TABLE "Poll" ADD COLUMN IF NOT EXISTS "allowComment" BOOLEAN NOT NULL DEFAULT false;

-- Commentaire anonyme attaché au bulletin (jamais reliable au votant).
ALTER TABLE "PollBallot" ADD COLUMN IF NOT EXISTS "comment" TEXT;

-- IDs des bulletins d'un votant (pour le re-vote des inscrits). Ne stocke pas le
-- choix, juste les ids — permet de retrouver/supprimer l'ancien bulletin.
ALTER TABLE "PollVoter" ADD COLUMN IF NOT EXISTS "ballotIds" TEXT[] NOT NULL DEFAULT '{}';
