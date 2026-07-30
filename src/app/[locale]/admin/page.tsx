import { prisma } from "@/lib/db";
import { AdminNav } from "@/components/AdminNav";
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { RecomputeBadgesBtn } from "@/components/RecomputeBadgesBtn";
import { AdminTournamentsPanel } from "@/components/AdminTournamentsPanel";
import { AdminClubActions } from "@/components/AdminClubActions";

export default async function AdminPage() {
  const t = await getTranslations("admin");
  const [pendingPlayers, pendingTournaments, rejectedTournaments, activePlayers, totalTournaments] = await Promise.all([
    prisma.player.count({ where: { status: "PENDING" } }),
    prisma.tournament.count({ where: { submissionStatus: "PENDING" } }),
    prisma.tournament.count({ where: { submissionStatus: "REJECTED" } }),
    prisma.player.count({ where: { status: "ACTIVE" } }),
    prisma.tournament.count()
  ]);

  const pending = await prisma.tournament.findMany({
    where: { submissionStatus: "PENDING" },
    select: { id: true, name: true, city: true, country: true, dateStart: true, dateEnd: true, createdAt: true, testMode: true, creator: { select: { id: true, name: true, slug: true } } },
    orderBy: { createdAt: "asc" }
  });

  const rejected = await prisma.tournament.findMany({
    where: { submissionStatus: "REJECTED" },
    include: { creator: { select: { id: true, name: true, slug: true } } },
    orderBy: { updatedAt: "desc" }
  });

  const pendingClubs = await prisma.club.findMany({
    where: { approved: false },
    include: {
      manager: { select: { id: true, name: true, slug: true } },
      _count: { select: { members: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="page">
      <h1>{t("page_title")}</h1>
      <AdminNav />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 32 }}>
        <div className="panel" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 36, fontWeight: 700, fontFamily: "var(--font-display)" }}>{pendingPlayers}</div>
          <p className="meta">{t("pending_players")}</p>
          {pendingPlayers > 0 && <Link href="/admin/players" className="primary" style={{ fontSize: 12, marginTop: 8, display: "inline-block" }}>{t("btn_moderate")}</Link>}
        </div>
        <div className="panel" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 36, fontWeight: 700, fontFamily: "var(--font-display)", color: pendingTournaments > 0 ? "var(--yellow)" : undefined }}>{pendingTournaments}</div>
          <p className="meta">{t("pending_tournaments")}</p>
        </div>
        {rejectedTournaments > 0 && (
          <div className="panel" style={{ textAlign: "center" }}>
            <div style={{ fontSize: 36, fontWeight: 700, fontFamily: "var(--font-display)", color: "var(--pink)" }}>{rejectedTournaments}</div>
            <p className="meta">{t("rejected_tournaments")}</p>
          </div>
        )}
        <div className="panel" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 36, fontWeight: 700, fontFamily: "var(--font-display)" }}>{activePlayers}</div>
          <p className="meta">{t("active_players")}</p>
        </div>
        <div className="panel" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 36, fontWeight: 700, fontFamily: "var(--font-display)" }}>{totalTournaments}</div>
          <p className="meta">{t("total_tournaments")}</p>
        </div>
        <div className="panel" style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <p className="meta" style={{ marginBottom: 0 }}>{t("btn_recompute_badges")}</p>
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
          testMode: t.testMode,
          creatorName: t.creator?.name ?? "?",
          creatorId: t.creator?.id ?? null,
          creatorSlug: t.creator?.slug ?? null,
        }))}
        rejected={rejected.map((t) => ({
          id: t.id,
          name: t.name,
          city: t.city,
          country: t.country,
          dateStart: t.dateStart.toISOString(),
          dateEnd: t.dateEnd.toISOString(),
          rejectionReason: t.rejectionReason ?? "",
          creatorName: t.creator?.name ?? "?",
          creatorId: t.creator?.id ?? null,
          creatorSlug: t.creator?.slug ?? null,
        }))}
      />

      <section className="section" style={{ marginTop: 32 }}>
        <div className="section-header">
          <div>
            <h2>{t("clubs_pending_title")}</h2>
            <p>{pendingClubs.length === 1 ? t("players_count_one", { count: pendingClubs.length }) : t("players_count_other", { count: pendingClubs.length })}</p>
          </div>
        </div>

        {pendingClubs.length === 0 ? (
          <div className="empty-state"><p>{t("clubs_empty_pending")}</p></div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {pendingClubs.map((club) => (
              <div key={club.id} className="panel" style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 20px" }}>
                {club.logoPath && (
                  <img src={club.logoPath} alt={club.name} style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 600, margin: 0 }}>{club.name}</p>
                  <p className="meta" style={{ margin: 0 }}>{club.city}, {club.country}</p>
                  <p className="meta" style={{ margin: 0 }}>
                    {t("clubs_manager")} : <Link href={`/player/${club.manager.slug ?? club.manager.id}`}>{club.manager.name}</Link>
                  </p>
                  {club.description && <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-muted)" }}>{club.description}</p>}
                </div>
                <AdminClubActions clubId={club.id} mode="pending" />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
