"use server";

import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { apiMsg } from "@/lib/api-messages";
import { createNotification } from "@/lib/notify";
import { COACH_EDITION, nextCollectorNumber } from "@/lib/coach-card";

async function requireAdmin() {
  const session = await auth();
  if ((session?.user as { role?: string } | undefined)?.role !== "ADMIN") throw new Error(apiMsg("not_authorized"));
}

/**
 * Donne la carte Coach de l'édition à un joueur. Tout est fixe (édition,
 * ville) ; le n° d'exemplaire est attribué automatiquement dans l'ordre des
 * dons. Nom et photo viennent du profil du joueur.
 */
export async function assignCoachCardAction(playerId: string) {
  await requireAdmin();
  const player = await prisma.player.findUnique({ where: { id: playerId }, select: { id: true } });
  if (!player) return { error: apiMsg("player_not_found") };

  const existing = await prisma.coachCard.findUnique({ where: { playerId }, select: { collectorNumber: true } });
  if (existing) return { ok: true, collectorNumber: existing.collectorNumber, already: true };

  const taken = (await prisma.coachCard.findMany({ select: { collectorNumber: true } })).map((c) => c.collectorNumber);
  const collectorNumber = nextCollectorNumber(taken);
  await prisma.coachCard.create({
    data: { playerId, tournament: COACH_EDITION.tournament, city: COACH_EDITION.city, collectorNumber },
  });
  await createNotification(playerId, "CARD_GRANTED", { cardId: "coach", cardName: "Coach", edition: COACH_EDITION.tournament });
  revalidatePath("/admin/coach-cards");
  revalidatePath("/account");
  return { ok: true, collectorNumber };
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
