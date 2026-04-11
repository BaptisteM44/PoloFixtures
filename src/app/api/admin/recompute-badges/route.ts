import { auth } from "@/lib/auth";
import { hasAtLeastRole } from "@/lib/rbac";
import { computeCareerBadges } from "@/lib/achievements";
import { BADGE_CATALOG } from "@/lib/badge-catalog";
import { createNotification } from "@/lib/notify";
import { prisma } from "@/lib/db";

const BATCH_SIZE = 10;

// GET /api/admin/recompute-badges?offset=0 — retourne le total de joueurs à traiter
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.role || !hasAtLeastRole(session.user.role, "ADMIN")) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Joueurs "actifs récemment" : connectés récemment OU inscrits à un tournoi récent OU ont joué récemment
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000); // 30 derniers jours

  const url = new URL(req.url);
  const all = url.searchParams.get("all") === "1";

  let playerIds: string[];

  if (all) {
    const players = await prisma.player.findMany({
      where: { status: "ACTIVE" },
      select: { id: true },
    });
    playerIds = players.map((p) => p.id);
  } else {
    // Récemment actifs = ont un compte avec session récente OU inscrits dans une équipe récente OU match récent
    const [recentTeamPlayers, recentMatchPlayers] = await Promise.all([
      prisma.teamPlayer.findMany({
        where: { registeredAt: { gte: since } },
        select: { playerId: true },
        distinct: ["playerId"],
      }),
      prisma.matchEvent.findMany({
        where: { createdAt: { gte: since } },
        select: { payload: true },
      }),
    ]);

    const idSet = new Set<string>(recentTeamPlayers.map((tp) => tp.playerId));
    for (const e of recentMatchPlayers) {
      const pid = (e.payload as { playerId?: string }).playerId;
      if (pid) idSet.add(pid);
    }

    // Toujours inclure tous les joueurs avec un compte (pour welcome/og)
    const accountPlayers = await prisma.player.findMany({
      where: { status: "ACTIVE", account: { isNot: null } },
      select: { id: true },
    });
    for (const p of accountPlayers) idSet.add(p.id);

    playerIds = [...idSet];
  }

  return Response.json({ total: playerIds.length });
}

// POST /api/admin/recompute-badges?offset=0&all=0 — traite un batch de BATCH_SIZE joueurs
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.role || !hasAtLeastRole(session.user.role, "ADMIN")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(req.url);
  const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);
  const all = url.searchParams.get("all") === "1";

  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);

  let playerIds: string[];

  if (all) {
    const players = await prisma.player.findMany({
      where: { status: "ACTIVE", account: { isNot: null } },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    playerIds = players.map((p) => p.id);
  } else {
    const [recentTeamPlayers, recentMatchPlayers, accountPlayers] = await Promise.all([
      prisma.teamPlayer.findMany({
        where: { registeredAt: { gte: since } },
        select: { playerId: true },
        distinct: ["playerId"],
      }),
      prisma.matchEvent.findMany({
        where: { createdAt: { gte: since } },
        select: { payload: true },
      }),
      prisma.player.findMany({
        where: { status: "ACTIVE", account: { isNot: null } },
        select: { id: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const idSet = new Set<string>(recentTeamPlayers.map((tp) => tp.playerId));
    for (const e of recentMatchPlayers) {
      const pid = (e.payload as { playerId?: string }).playerId;
      if (pid) idSet.add(pid);
    }
    for (const p of accountPlayers) idSet.add(p.id);
    playerIds = [...idSet];
  }

  const batch = playerIds.slice(offset, offset + BATCH_SIZE);

  const players = await prisma.player.findMany({
    where: { id: { in: batch } },
    select: { id: true, badges: true, account: { select: { id: true } } },
  });

  let updated = 0;
  let errors = 0;

  for (const player of players) {
    try {
      const oldBadges = new Set<string>(player.badges as string[]);
      const newBadges = await computeCareerBadges(player.id);
      await prisma.player.update({ where: { id: player.id }, data: { badges: newBadges } });

      if (player.account) {
        for (const badge of newBadges) {
          if (!oldBadges.has(badge)) {
            const info = BADGE_CATALOG[badge];
            await createNotification(player.id, "BADGE_UNLOCKED", {
              badge,
              badgeName: info ? `${info.emoji} ${info.name}` : badge,
            });
          }
        }
      }
      updated++;
    } catch {
      errors++;
    }
  }

  return Response.json({
    updated,
    errors,
    processed: batch.length,
    total: playerIds.length,
    nextOffset: offset + BATCH_SIZE < playerIds.length ? offset + BATCH_SIZE : null,
  });
}
