import { prisma } from "@/lib/db";
import { AdminNav } from "@/components/AdminNav";
import Link from "next/link";
import { RecomputeBadgesBtn } from "@/components/RecomputeBadgesBtn";
import { AdminTournamentsPanel } from "@/components/AdminTournamentsPanel";

export default async function AdminPage() {
  const [pendingPlayers, pendingTournaments, rejectedTournaments, activePlayers, totalTournaments] = await Promise.all([
    prisma.player.count({ where: { status: "PENDING" } }),
    prisma.tournament.count({ where: { submissionStatus: "PENDING" } }),
    prisma.tournament.count({ where: { submissionStatus: "REJECTED" } }),
    prisma.player.count({ where: { status: "ACTIVE" } }),
    prisma.tournament.count()
  ]);

  const pending = await prisma.tournament.findMany({
    where: { submissionStatus: "PENDING" },
    include: { creator: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" }
  });

  const rejected = await prisma.tournament.findMany({
    where: { submissionStatus: "REJECTED" },
    include: { creator: { select: { id: true, name: true } } },
    orderBy: { updatedAt: "desc" }
  });

  return (
    <div className="page">
      <h1>Administration</h1>
      <AdminNav />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 32 }}>
        <div className="panel" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 36, fontWeight: 700, fontFamily: "var(--font-display)" }}>{pendingPlayers}</div>
          <p className="meta">Joueurs en attente</p>
          {pendingPlayers > 0 && <Link href="/admin/players" className="primary" style={{ fontSize: 12, marginTop: 8, display: "inline-block" }}>Modérer</Link>}
        </div>
        <div className="panel" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 36, fontWeight: 700, fontFamily: "var(--font-display)", color: pendingTournaments > 0 ? "var(--yellow)" : undefined }}>{pendingTournaments}</div>
          <p className="meta">Tournois à valider</p>
        </div>
        {rejectedTournaments > 0 && (
          <div className="panel" style={{ textAlign: "center" }}>
            <div style={{ fontSize: 36, fontWeight: 700, fontFamily: "var(--font-display)", color: "var(--pink)" }}>{rejectedTournaments}</div>
            <p className="meta">Tournois refusés</p>
          </div>
        )}
        <div className="panel" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 36, fontWeight: 700, fontFamily: "var(--font-display)" }}>{activePlayers}</div>
          <p className="meta">Joueurs actifs</p>
        </div>
        <div className="panel" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 36, fontWeight: 700, fontFamily: "var(--font-display)" }}>{totalTournaments}</div>
          <p className="meta">Tournois total</p>
        </div>
        <div className="panel" style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <p className="meta" style={{ marginBottom: 0 }}>Recalculer les badges</p>
          <RecomputeBadgesBtn />
        </div>
      </div>

      <AdminTournamentsPanel
        pending={pending.map((t) => ({
          id: t.id,
          name: t.name,
          city: t.city,
          country: t.country,
          dateStart: t.dateStart.toISOString(),
          dateEnd: t.dateEnd.toISOString(),
          createdAt: t.createdAt.toISOString(),
          creatorName: t.creator?.name ?? "Inconnu",
          creatorId: t.creator?.id ?? null,
        }))}
        rejected={rejected.map((t) => ({
          id: t.id,
          name: t.name,
          city: t.city,
          country: t.country,
          dateStart: t.dateStart.toISOString(),
          dateEnd: t.dateEnd.toISOString(),
          rejectionReason: t.rejectionReason ?? "",
          creatorName: t.creator?.name ?? "Inconnu",
          creatorId: t.creator?.id ?? null,
        }))}
      />
    </div>
  );
}
