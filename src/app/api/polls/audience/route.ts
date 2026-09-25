import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { findPollAudience } from "@/lib/poll-access";
import { ownScope, previewTargeting, isGlobal } from "@/lib/poll-targeting";

export const dynamic = "force-dynamic";

const list = (v: string | null) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);

/**
 * Aperçu du ciblage pour le formulaire : nombre de joueurs touchés, cibles qui
 * demanderont une validation, et le périmètre libre du joueur (ses clubs, son pays).
 */
export async function GET(request: Request) {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!playerId) return new Response("Connexion requise", { status: 401 });
  const isAdmin = session?.user?.role === "ADMIN";
  const sp = new URL(request.url).searchParams;
  const requested = { clubIds: list(sp.get("clubs")), countries: list(sp.get("countries")), continents: list(sp.get("continents")) };

  const pollId = sp.get("pollId");
  const poll = pollId
    ? await prisma.poll.findFirst({
        where: { id: pollId, ...(isAdmin ? {} : { createdById: playerId }) },
        select: { id: true, question: true, status: true, createdById: true, eligibleClubIds: true, eligibleCountries: true, eligibleContinents: true },
      })
    : null;

  const [preview, scope] = await Promise.all([previewTargeting(requested, playerId, isAdmin, poll), ownScope(playerId)]);
  const target = { eligibleClubIds: requested.clubIds, eligibleCountries: requested.countries, eligibleContinents: requested.continents, createdById: playerId };
  const count = isGlobal(requested)
    ? await prisma.player.count({ where: { status: "ACTIVE", account: { isNot: null }, id: { not: playerId } } })
    : (await findPollAudience(target)).length;

  const clubIdsToName = [...new Set([...scope.clubIds, ...preview.requests.flatMap((r) => (r.kind === "club" ? [r.clubId] : []))])];
  const clubs = clubIdsToName.length > 0
    ? await prisma.club.findMany({ where: { id: { in: clubIdsToName } }, select: { id: true, name: true } })
    : [];
  const clubName = (id: string) => clubs.find((c) => c.id === id)?.name ?? "?";

  return Response.json({
    count,
    isAdmin,
    ownClubs: scope.clubIds.map((id) => ({ id, name: clubName(id) })),
    ownCountry: scope.countries[0] ?? null,
    needsApproval: {
      clubs: preview.requests.flatMap((r) => (r.kind === "club" ? [{ id: r.clubId, name: clubName(r.clubId) }] : [])),
      admin: preview.requests.find((r) => r.kind === "admin") ?? null,
    },
  });
}
