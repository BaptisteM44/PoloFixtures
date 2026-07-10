import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { getPublicBadgeCatalog } from "@/lib/badge-catalog";
import { resolveOwnedCards } from "@/lib/card-catalog";

export async function GET() {
  const session = await auth();
  if (!session?.user?.playerId) return new Response("Unauthorized", { status: 401 });

  const player = await prisma.player.findUnique({
    where: { id: session.user.playerId },
    include: {
      teams: {
        include: {
          team: {
            include: { tournament: true }
          }
        }
      },
      squads: {
        include: {
          squad: { select: { id: true, name: true, logoPath: true } }
        }
      },
      createdTournaments: {
        select: { id: true, name: true, status: true, approved: true, city: true, country: true },
        orderBy: { createdAt: "desc" }
      },
      whbpcCard: true,
    }
  });

  if (!player) return new Response("Not found", { status: 404 });
  // Filtrer les pinnedBadges périmés (badges retirés depuis le dernier épinglage)
  const earnedSet = new Set(player.badges as string[]);
  const cleanedPinnedBadges = (player.pinnedBadges as string[]).filter((b) => earnedSet.has(b));
  // La carte "whbpc" est possédée si (et seulement si) une ligne WhbpcCard existe —
  // pas besoin de la dupliquer dans ownedCards.
  const ownedCards = player.whbpcCard ? [...player.ownedCards, "whbpc"] : player.ownedCards;
  return Response.json({ ...player, ownedCards, pinnedBadges: cleanedPinnedBadges, badgeCatalog: getPublicBadgeCatalog(player.badges) });
}

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  city: z.string().optional().nullable(),
  country: z.string().min(2).optional(),
  bio: z.string().max(500).optional().nullable(),
  startYear: z.number().int().min(1990).max(2100).optional().nullable(),
  hand: z.enum(["LEFT", "RIGHT"]).optional().nullable(),
  gender: z.enum(["MALE", "FEMALE", "NON_BINARY", "PREFER_NOT_SAY"]).optional().nullable(),
  showGender: z.boolean().optional(),
  diets: z.array(z.enum(["OMNIVORE", "VEGETARIAN", "VEGAN", "GLUTEN_FREE"])).optional(),
  photoPath: z.string().optional().nullable(),
  clubLogoPath: z.string().optional().nullable(),
  emblemPosition: z.enum(["top-left", "top-right", "bottom-left", "bottom-right"]).optional(),
  teamLogoPath: z.string().optional().nullable(),
  teamLogoPosition: z.enum(["top-left", "top-right", "bottom-left", "bottom-right"]).optional(),
  pinnedBadges: z.array(z.string()).max(5).optional(),
  activeCard: z.string().optional().nullable(),
  petAllergies: z.string().max(500).optional().nullable(),
  foodAllergies: z.string().max(500).optional().nullable(),
});

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.playerId) return new Response("Unauthorized", { status: 401 });

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  // Guard: can only set an active card the player actually owns
  if (parsed.data.activeCard) {
    const current = await prisma.player.findUnique({
      where: { id: session.user.playerId },
      select: { ownedCards: true, whbpcCard: { select: { id: true } } },
    });
    const ownedCards = current?.whbpcCard ? [...(current.ownedCards ?? []), "whbpc"] : current?.ownedCards ?? [];
    const owned = resolveOwnedCards(ownedCards);
    if (!owned.has(parsed.data.activeCard)) {
      return Response.json({ error: "Carte non débloquée." }, { status: 400 });
    }
  }

  const updated = await prisma.player.update({
    where: { id: session.user.playerId },
    data: parsed.data
  });

  return Response.json(updated);
}
