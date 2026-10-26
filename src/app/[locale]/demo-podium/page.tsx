/**
 * DEMO — image « podium » à partager en story, sur un VRAI tournoi terminé.
 * ?t=<slug ou id> pour choisir ; sinon le dernier tournoi public terminé.
 * Sert à vérifier le rendu (photos des cartes comprises) avant de l'envoyer
 * aux participants. Non indexée (robots + noindex).
 */

import { prisma } from "@/lib/db";
import { Link } from "@/i18n/navigation";
import { auth } from "@/lib/auth";
import { getPodiumShareData, formatTournamentDates } from "@/lib/podium-share";
import { PodiumStory } from "@/components/PodiumStory";

export const dynamic = "force-dynamic";
export const metadata = { title: "Démo podium", robots: { index: false, follow: false } };

const PUBLIC = { status: "COMPLETED" as const, testMode: false, hidden: false, approved: true, createdViaSandbox: false };

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
        select: { id: true, slug: true, name: true, city: true, country: true, dateStart: true, dateEnd: true },
      })
    : null;

  const me = (await auth())?.user?.playerId;
  const share = tournament ? await getPodiumShareData(tournament.id, me) : null;
  const dates = tournament ? formatTournamentDates(params.locale, tournament.dateStart, tournament.dateEnd) : "";

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
      ) : !share ? (
        <p>Pas de podium calculable pour « {tournament.name} ».</p>
      ) : (
        <PodiumStory
          key={tournament.id}
          tournamentName={tournament.name}
          place={`${tournament.city}, ${tournament.country}`}
          dates={dates}
          teamCount={share.teams.length}
          teams={share.teams}
          podiumIds={share.podiumIds}
          defaultTeamId={share.defaultTeamId}
          resultsPath={`/${params.locale}/tournament/${tournament.slug ?? tournament.id}?tab=recap`}
        />
      )}
    </div>
  );
}
