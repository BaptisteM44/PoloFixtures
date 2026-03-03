import { Role } from "@prisma/client";

const roleRank: Record<Role, number> = {
  REF: 1,
  ORGA: 2,
  ADMIN: 3
};

export function hasAtLeastRole(userRole: Role | undefined | null, required: Role) {
  if (!userRole) return false;
  return roleRank[userRole] >= roleRank[required];
}

export function canAccessTournament(userTournamentId: string | null | undefined, requiredTournamentId?: string | null) {
  if (!requiredTournamentId) return true;
  if (!userTournamentId) return false;
  return userTournamentId === requiredTournamentId;
}
