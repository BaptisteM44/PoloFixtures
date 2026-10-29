import { prisma } from "@/lib/db";

/**
 * Peut-on déclarer ce club comme club hôte d'un tournoi ? Oui si on gère le
 * club (manager ou admin du club) ou si on est admin du site — sinon n'importe
 * quel orga pourrait rattacher son tournoi au club de quelqu'un d'autre.
 */
export async function canSetHostClub(playerId: string | null | undefined, role: string | null | undefined, clubId: string): Promise<boolean> {
  if (role === "ADMIN") return true;
  if (!playerId) return false;
  const club = await prisma.club.findFirst({
    where: { id: clubId, OR: [{ managerId: playerId }, { admins: { some: { playerId } } }] },
    select: { id: true },
  });
  return !!club;
}
