import { auth } from "@/lib/auth";
import { hasAtLeastRole } from "@/lib/rbac";
import { computeCareerBadges } from "@/lib/achievements";
import { BADGE_CATALOG } from "@/lib/badge-catalog";
import { createNotification } from "@/lib/notify";
import { prisma } from "@/lib/db";

export const maxDuration = 300; // 5 min (Vercel Pro/hobby limit)

export async function POST() {
  const session = await auth();
  if (!session?.user?.role || !hasAtLeastRole(session.user.role, "ADMIN")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const players = await prisma.player.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, badges: true, account: { select: { id: true } } },
  });

  // Stream progress back to client
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
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

        controller.enqueue(
          encoder.encode(JSON.stringify({ progress: updated + errors, total: players.length, updated, errors }) + "\n")
        );
      }

      controller.enqueue(encoder.encode(JSON.stringify({ done: true, updated, errors }) + "\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" },
  });
}
