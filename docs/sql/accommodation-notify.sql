-- Hébergement : notifications logés/logeurs + capacité par logeur.
-- Idempotent — à exécuter dans le terminal DB de Coolify AVANT de déployer
-- le code qui utilise ces colonnes/types.

-- Nouvelles valeurs d'enum pour les notifications d'hébergement
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ACCOMMODATION_ASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ACCOMMODATION_GUEST_ADDED';

-- Capacité (places offertes) sur un logeur
ALTER TABLE "AccommodationHost" ADD COLUMN IF NOT EXISTS "capacity" INTEGER;

-- Date de notification d'un logé (null = pas encore prévenu)
ALTER TABLE "AccommodationGuest" ADD COLUMN IF NOT EXISTS "notifiedAt" TIMESTAMP(3);
