import { prisma } from "@/lib/db";
import { getTranslations } from "next-intl/server";
import { AdminNav } from "@/components/AdminNav";
import { AdminPhotos, type AdminPhoto } from "@/components/AdminPhotos";

export const dynamic = "force-dynamic";

export default async function AdminPhotosPage() {
  const t = await getTranslations("photos");
  const rows = await prisma.tournamentPhoto.findMany({
    // Signalées d'abord, puis les plus récentes.
    orderBy: [{ reportCount: "desc" }, { createdAt: "desc" }],
    take: 300,
    select: {
      id: true, imagePath: true, createdAt: true, hiddenAt: true, reportCount: true, pendingApproval: true,
      author: { select: { name: true, slug: true } },
      tournament: { select: { id: true, slug: true, name: true } },
    },
  });
  const photos: AdminPhoto[] = rows.map((p) => ({
    id: p.id,
    imagePath: p.imagePath,
    createdAt: p.createdAt.toISOString(),
    hidden: !!p.hiddenAt,
    reportCount: p.reportCount,
    pending: p.pendingApproval,
    author: p.author,
    tournament: { slug: p.tournament.slug ?? p.tournament.id, name: p.tournament.name },
  }));
  return (
    <div className="page">
      <AdminNav />
      <h1 style={{ fontFamily: "var(--font-display)", marginTop: 16 }}>📸 {t("admin_title")}</h1>
      <p className="meta" style={{ marginBottom: 16 }}>{t("admin_intro")}</p>
      <AdminPhotos photos={photos} />
    </div>
  );
}
