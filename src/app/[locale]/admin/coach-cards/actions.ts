"use server";

import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiMsg } from "@/lib/api-messages";

async function requireAdmin() {
  const session = await auth();
  if ((session?.user as { role?: string } | undefined)?.role !== "ADMIN") throw new Error(apiMsg("not_authorized"));
}

const assignSchema = z.object({
  playerId: z.string().min(1),
  tournament: z.string().trim().min(1).max(40),
  city: z.string().trim().min(1).max(30),
  collectorNumber: z.string().trim().min(1).max(10),
});

/** Donne (ou modifie) la carte Coach d'un joueur. */
export async function assignCoachCardAction(data: z.infer<typeof assignSchema>) {
  await requireAdmin();
  const parsed = assignSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Données invalides." };

  const { playerId, ...cardData } = parsed.data;
  const player = await prisma.player.findUnique({ where: { id: playerId }, select: { id: true } });
  if (!player) return { error: apiMsg("player_not_found") };

  // Posséder la carte = avoir une ligne CoachCard (ownedCards la dérive, comme pour la WHBPC).
  await prisma.coachCard.upsert({ where: { playerId }, create: { playerId, ...cardData }, update: cardData });
  revalidatePath("/admin/coach-cards");
  revalidatePath("/account");
  return { ok: true };
}

/** Retire la carte Coach (et la désactive si c'était la carte affichée). */
export async function revokeCoachCardAction(playerId: string) {
  await requireAdmin();
  await prisma.coachCard.deleteMany({ where: { playerId } });
  const player = await prisma.player.findUnique({ where: { id: playerId }, select: { activeCard: true } });
  if (player?.activeCard === "coach") {
    await prisma.player.update({ where: { id: playerId }, data: { activeCard: null } });
  }
  revalidatePath("/admin/coach-cards");
  revalidatePath("/account");
  return { ok: true };
}
