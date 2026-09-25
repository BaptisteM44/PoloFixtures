import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// DELETE /api/account/delete
// Anonymizes the player: wipes personal data, deletes PlayerAccount (email/password).
// The Player row is kept to preserve tournament history.
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.playerId) return new Response("Unauthorized", { status: 401 });

  const playerId = session.user.playerId;

  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { name: true },
  });
  if (!player) return new Response("Not found", { status: 404 });

  // Compute initials from name: "Baptiste Morvan" → "B.M."
  const initials = player.name
    .trim()
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .filter(Boolean)
    .join(".")
    .concat(".");

  await prisma.$transaction([
    // Delete login credentials (LoginDay cascade-deleted via schema)
    prisma.playerAccount.deleteMany({ where: { playerId } }),
    // Plus aucune notif sur ses appareils, plus de préférences, plus de
    // contenus publics rattachés (stories, annonces agent libre).
    prisma.pushSubscription.deleteMany({ where: { playerId } }),
    prisma.notificationPreference.deleteMany({ where: { playerId } }),
    prisma.tournamentPhoto.deleteMany({ where: { authorId: playerId } }),
    prisma.freeAgent.deleteMany({ where: { playerId } }),
    // Anonymize player data
    prisma.player.update({
      where: { id: playerId },
      data: {
        name: initials,
        slug: null,
        photoPath: null,
        bio: null,
        city: null,
        hand: null,
        gender: null,
        showGender: false,
        diets: [],
        // Données de santé : à effacer en priorité (oubliées jusqu'ici).
        petAllergies: null,
        foodAllergies: null,
        badges: [],
        pinnedBadges: [],
        clubLogoPath: null,
        emblemPosition: null,
        teamLogoPath: null,
        teamLogoPosition: null,
        startYear: null,
        status: "REJECTED" as const,
      },
    }),
  ]);

  return new Response(null, { status: 204 });
}
