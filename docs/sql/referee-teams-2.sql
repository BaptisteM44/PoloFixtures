-- Arbitrage par équipe, lot 2 : notification « Ton équipe arbitre N matchs ».
-- À lancer AVANT de déployer le code. Rejouable sans risque. Aucune donnée modifiée.
-- (Les nouveaux réglages — repos, équipes dispensées — vivent dans
-- Tournament.refereeSettings, déjà créé par referee-teams.sql.)

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'REFEREE_ASSIGNED';
