/**
 * DEMO — image « podium » à partager en story, sur un VRAI tournoi terminé.
 * ?t=<slug ou id> pour choisir ; sinon le dernier tournoi public terminé.
 * Sert à vérifier le rendu (photos des cartes comprises) avant de l'envoyer
 * aux participants. Non indexée (robots + noindex).
 */

import { prisma } from "@/lib/db";
import { Link } from "@/i18n/navigation";
import { getPodiumTeamIds } from "@/lib/podium";
import { getPipeline, finalRanking } from "@/engine/pipeline-server";
import { auth } from "@/lib/auth";
import { PodiumStory, type PodiumTeam } from "@/components/PodiumStory";

export const dynamic = "force-dynamic";
export const metadata = { title: "Démo podium", robots: { index: false, follow: false } };

const PUBLIC = { status: "COMPLETED" as const, testMode: false, hidden: false, approved: true, createdViaSandbox: false };

const playerSelect = {
  id: true, name: true, country: true, city: true, photoPath: true, badges: true, pinnedBadges: true,
  startYear: true, hand: true, gender: true, showGender: true, activeCard: true, coachCard: true, whbpcCard: true,
} as const;

export default async function DemoPodiumPage({ params, searchParams }: { params: { locale: string }; searchParams: { t?: string } }) {
  const recent = await prisma.tournament.findMany({
    where: PUBLIC, orderBy: { dateEnd: "desc" }, take: 12,
    select: { id: true, slug: true, name: true },
  });
  const pick = searchParams.t
    ? await prisma.tournament.findFirst({ where: { OR: [{ id: searchParams.t }, { slug: searchParams.t }] }, select: { id: true } })
    : recent[0] ?? null;

  const tournament = pick
    ? await prisma.tournament.findUnique({
        where: { id: pick.id },
        select: { id: true, slug: true, name: true, city: true, country: true, dateStart: true, dateEnd: true, usesPipeline: true, _count: { select: { teams: { where: { selected: true } } } } },
      })
    : null;

  // Toutes les équipes du tournoi, avec leur rang (podium ; classement complet
  // pour les tournois en étapes), pour pouvoir mettre en avant n'importe laquelle.
  let teams: PodiumTeam[] = [];
  let podiumIds: string[] = [];
  let defaultTeamId: string | null = null;
  if (tournament) {
    const podium = await getPodiumTeamIds(tournament.id);
    podiumIds = [podium.first, podium.second, podium.third].filter((x): x is string => !!x);
    const rank = new Map<string, number>();
    if (tournament.usesPipeline) {
      const pipeline = await getPipeline(tournament.id);
      if (pipeline) for (const r of finalRanking(pipeline)) rank.set(r.teamId, r.rank);
    }
    podiumIds.forEach((id, i) => rank.set(id, i + 1));

    const rows = await prisma.team.findMany({
      where: { tournamentId: tournament.id, selected: true },
      select: { id: true, name: true, color: true, players: { select: { player: { select: playerSelect } } } },
    });
    teams = rows.map((r) => ({
      id: r.id, name: r.name, color: r.color, rank: rank.get(r.id) ?? null,
      players: r.players.map(({ player: p }) => ({
        id: p.id, name: p.name, country: p.country, city: p.city, photoPath: p.photoPath,
        badges: p.pinnedBadges?.length ? p.pinnedBadges : p.badges, startYear: p.startYear, hand: p.hand,
        gender: p.gender ?? undefined, showGender: p.showGender, activeCard: p.activeCard,
        coachData: p.coachCard ? { tournament: p.coachCard.tournament, city: p.coachCard.city, collectorNumber: p.coachCard.collectorNumber } : null,
        whbpcData: p.whbpcCard ? { ...p.whbpcCard, hand: p.whbpcCard.hand as "RIGHTIE" | "LEFTIE" } : null,
      })),
    })).sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999) || a.name.localeCompare(b.name));

    // Par défaut : l'équipe de la personne connectée, sinon les vainqueurs
    const me = (await auth())?.user?.playerId;
    defaultTeamId = teams.find((t) => t.players.some((p) => p.id === me))?.id ?? podiumIds[0] ?? teams[0]?.id ?? null;
  }

  const fmt = new Intl.DateTimeFormat(params.locale, { day: "numeric", month: "short", year: "numeric" });
  const dates = tournament
    ? tournament.dateStart.toDateString() === tournament.dateEnd.toDateString()
      ? fmt.format(tournament.dateStart)
      : fmt.formatRange(tournament.dateStart, tournament.dateEnd) // « 17–18 oct. 2026 »
    : "";

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 16px 60px", display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 900, margin: "0 0 6px" }}>DEMO — PODIUM À PARTAGER</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 14, margin: 0, lineHeight: 1.6 }}>
          Format story Instagram (1080×1920). Génère l&apos;image pour vérifier que toutes les photos
          des cartes apparaissent bien dans le PNG exporté.
        </p>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {recent.map((r) => (
          <Link key={r.id} href={`/demo-podium?t=${r.slug ?? r.id}`} className="badge"
            style={{ padding: "4px 10px", border: "2px solid var(--border)", borderRadius: 999, fontSize: 12, textDecoration: "none",
              background: r.id === tournament?.id ? "var(--yellow)" : "var(--surface)", color: "#1a1a1a" }}>
            {r.name}
          </Link>
        ))}
      </div>

      {!tournament ? (
        <p>Aucun tournoi terminé trouvé.</p>
      ) : podiumIds.length === 0 || !defaultTeamId ? (
        <p>Pas de podium calculable pour « {tournament.name} ».</p>
      ) : (
        <PodiumStory
          key={tournament.id}
          tournamentName={tournament.name}
          place={`${tournament.city}, ${tournament.country}`}
          dates={dates}
          teamCount={tournament._count.teams}
          teams={teams}
          podiumIds={podiumIds}
          defaultTeamId={defaultTeamId}
          resultsPath={`/${params.locale}/tournament/${tournament.slug ?? tournament.id}?tab=recap`}
        />
      )}
    </div>
  );
}
