import { auth } from "@/lib/auth";
import { hasAtLeastRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { notifyPlayersNewTournament } from "@/lib/notify";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.role || !hasAtLeastRole(session.user.role, "ADMIN")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const tournament = await prisma.tournament.findUnique({ where: { id: params.id } });
  if (!tournament) return new Response("Not found", { status: 404 });

  await prisma.tournament.update({
    where: { id: params.id },
    data: { approved: true, locked: false, submissionStatus: "APPROVED", rejectionReason: null }
  });

  // Notif instantanée aux joueurs abonnés (filtre géo) — uniquement à la 1re
  // approbation d'un tournoi réel visible (garde anti double-envoi + digest cron
  // conservé en parallèle). `tournament` tient l'état AVANT update.
  if (!tournament.approved && !tournament.testMode && !tournament.hidden) {
    notifyPlayersNewTournament({
      id: tournament.id,
      slug: tournament.slug,
      name: tournament.name,
      city: tournament.city,
      country: tournament.country,
      continentCode: tournament.continentCode,
    }).catch(() => {});
  }

  // Redirect back to admin page
  return new Response(null, {
    status: 303,
    headers: { Location: "/admin" }
  });
}
