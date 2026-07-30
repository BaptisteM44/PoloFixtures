"use server";

import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";

async function requireAdmin() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (role !== "ADMIN") throw new Error("Unauthorized");
}

const assignSchema = z.object({
  playerId: z.string().min(1),
  teamName: z.string().min(1).max(40),
  yearStarted: z.string().regex(/^\d{4}$/, "Année invalide"),
  countryCode: z.string().min(2).max(2),
  bestSkill: z.string().min(1).max(30),
  pedals: z.string().min(1).max(30),
  hand: z.enum(["RIGHTIE", "LEFTIE"]),
  wheelSize: z.string().min(1).max(6),
  gearRatio: z.string().min(1).max(10),
});

/** Search players by name — used to pick who to gift a card to. Only players with a real account (email) can appear here. */
export async function searchPlayersAction(query: string) {
  await requireAdmin();
  if (query.trim().length < 2) return [];
  return prisma.player.findMany({
    where: { name: { contains: query, mode: "insensitive" }, account: { isNot: null } },
    select: { id: true, name: true, slug: true, city: true, country: true },
    take: 15,
    orderBy: { name: "asc" },
  });
}

/** Create or update a player's WHBPC card (gift / edit as admin). */
export async function assignWhbpcCardAction(data: z.infer<typeof assignSchema>) {
  await requireAdmin();
  const parsed = assignSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Données invalides." };

  const { playerId, ...cardData } = parsed.data;
  const player = await prisma.player.findUnique({ where: { id: playerId }, select: { id: true } });
  if (!player) return { error: "Joueur introuvable." };

  // Posséder la carte = avoir une ligne WhbpcCard (voir api/account/profile —
  // ownedCards la dérive dynamiquement, pas besoin de la stocker en double).
  await prisma.whbpcCard.upsert({
    where: { playerId },
    create: { playerId, ...cardData },
    update: cardData,
  });
  revalidatePath("/admin/whbpc");
  revalidatePath("/account");
  return { ok: true };
}

/** Revoke a player's WHBPC card. */
export async function revokeWhbpcCardAction(playerId: string) {
  await requireAdmin();
  await prisma.whbpcCard.deleteMany({ where: { playerId } });
  // Si "whbpc" était leur carte active, on la repasse sur la carte standard
  // (la suppression de WhbpcCard suffit à retirer la possession — voir
  // api/account/profile qui dérive ownedCards depuis whbpcCard).
  const player = await prisma.player.findUnique({ where: { id: playerId }, select: { activeCard: true } });
  if (player?.activeCard === "whbpc") {
    await prisma.player.update({ where: { id: playerId }, data: { activeCard: null } });
  }
  revalidatePath("/admin/whbpc");
  revalidatePath("/account");
  return { ok: true };
}

/** List every player who currently has a WHBPC card. */
export async function listWhbpcCardsAction() {
  await requireAdmin();
  return prisma.whbpcCard.findMany({
    include: { player: { select: { id: true, name: true, slug: true, photoPath: true } } },
    orderBy: { createdAt: "desc" },
  });
}
