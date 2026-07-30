-- Mode de paiement (Virement/PayPal/Cash/Autre) + suivi paiement des inscriptions
-- individuelles (ABC Chapeau). Idempotent — à exécuter dans le terminal DB de
-- Coolify AVANT de déployer le code qui utilise ces colonnes/type.

DO $$ BEGIN
  CREATE TYPE "PaymentMethod" AS ENUM ('BANK_TRANSFER', 'PAYPAL', 'CASH', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "paymentMethod" "PaymentMethod";

ALTER TABLE "TournamentSoloEntry" ADD COLUMN IF NOT EXISTS "feePaid" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TournamentSoloEntry" ADD COLUMN IF NOT EXISTS "paymentMethod" "PaymentMethod";
