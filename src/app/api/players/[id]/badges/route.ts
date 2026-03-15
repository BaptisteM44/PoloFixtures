import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { computeCareerBadges } from "@/lib/achievements";
import { BADGE_CATALOG } from "@/lib/badge-catalog";
import { createNotification } from "@/lib/notify";

// POST /api/players/[id]/badges — recalcule et sauvegarde les badges du joueur
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!playerId) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  // Un joueur ne peut recalculer que ses propres badges (sauf admin)
  const isAdmin = session?.user?.role === "ADMIN";
  if (params.id !== playerId && !isAdmin) {
    return NextResponse.json({ error: "Interdit" }, { status: 403 });
  }

  const player = await prisma.player.findUnique({
    where: { id: params.id },
    select: { badges: true, account: { select: { id: true } } },
  });
  if (!player) return NextResponse.json({ error: "Joueur introuvable" }, { status: 404 });

  const oldBadges = new Set<string>(player.badges as string[]);
  const newBadges = await computeCareerBadges(params.id);

  await prisma.player.update({ where: { id: params.id }, data: { badges: newBadges } });

  // Notifier les nouveaux badges débloqués
  if (player.account) {
    for (const badge of newBadges) {
      if (!oldBadges.has(badge)) {
        const info = BADGE_CATALOG[badge];
        await createNotification(params.id, "BADGE_UNLOCKED", {
          badge,
          badgeName: info ? `${info.emoji} ${info.name}` : badge,
        });
      }
    }
  }

  return NextResponse.json({ badges: newBadges, newCount: newBadges.filter((b) => !oldBadges.has(b)).length });
}
