import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AdminNav } from "@/components/AdminNav";
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";

export default async function AdminClubsPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/");
  const t = await getTranslations("admin");

  const pendingClubs = await prisma.club.findMany({
    where: { approved: false },
    include: {
      manager: { select: { id: true, name: true, slug: true } },
      _count: { select: { members: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const approvedClubs = await prisma.club.findMany({
    where: { approved: true },
    include: {
      manager: { select: { id: true, name: true, slug: true } },
      _count: { select: { members: { where: { status: "MEMBER" } } } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="page">
      <h1>{t("page_title")}</h1>
      <AdminNav />

      <section className="section" style={{ marginTop: 24 }}>
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
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <form action={`/api/admin/clubs/${club.id}/approve`} method="POST">
                    <button type="submit" className="primary" style={{ fontSize: 13 }}>✓ {t("btn_approve")}</button>
                  </form>
                  <form action={`/api/admin/clubs/${club.id}/approve`} method="DELETE">
                    <button type="submit" className="ghost" style={{ fontSize: 13, color: "var(--danger)" }}>✗ {t("btn_reject")}</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-header">
          <div>
            <h2>{t("clubs_approved_title")}</h2>
            <p>{approvedClubs.length === 1 ? t("players_count_one", { count: approvedClubs.length }) : t("players_count_other", { count: approvedClubs.length })}</p>
          </div>
        </div>
        {approvedClubs.length === 0 ? (
          <div className="empty-state"><p>{t("clubs_empty_approved")}</p></div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {approvedClubs.map((club) => (
              <div key={club.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--border-light)" }}>
                {club.logoPath && (
                  <img src={club.logoPath} alt={club.name} style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 6 }} />
                )}
                <div style={{ flex: 1 }}>
                  <Link href={`/club/${club.id}`}><strong>{club.name}</strong></Link>
                  <span className="meta"> — {club.city}, {club.country} — {club._count.members} membre{club._count.members > 1 ? "s" : ""}</span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Link href={`/club/${club.id}`} className="ghost" style={{ fontSize: 13 }}>{t("btn_view")}</Link>
                  <form action={`/api/admin/clubs/${club.id}/approve`} method="DELETE">
                    <button type="submit" className="ghost" style={{ fontSize: 13, color: "var(--danger)" }}>{t("btn_delete")}</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
