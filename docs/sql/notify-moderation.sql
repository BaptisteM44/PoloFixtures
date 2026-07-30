-- Notifications de modération admin (nouveau tournoi/club à valider) + annonce
-- instantanée aux joueurs quand un tournoi est publié.
-- Idempotent — à exécuter dans le terminal DB de Coolify AVANT de déployer le
-- code qui utilise ces valeurs d'enum.

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TOURNAMENT_NEEDS_APPROVAL';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CLUB_NEEDS_APPROVAL';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'NEW_TOURNAMENT_PUBLISHED';
