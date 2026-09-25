import { prisma } from "@/lib/db";
import { getTranslations } from "next-intl/server";
import { AdminNav } from "@/components/AdminNav";
import { AdminStories, type AdminStory } from "@/components/AdminStories";

export const dynamic = "force-dynamic";

export default async function AdminStoriesPage() {
  const t = await getTranslations("stories");
  const rows = await prisma.story.findMany({
    // Signalées/masquées d'abord, puis les plus récentes.
    orderBy: [{ reportCount: "desc" }, { createdAt: "desc" }],
    take: 200,
    select: {
      id: true, imagePath: true, caption: true, createdAt: true, expiresAt: true,
      highlightTitle: true, hiddenAt: true, reportCount: true,
      author: { select: { name: true, slug: true } },
      tournament: { select: { name: true } },
    },
  });
  const stories: AdminStory[] = rows.map((s) => ({
    ...s,
    createdAt: s.createdAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
    hiddenAt: s.hiddenAt?.toISOString() ?? null,
  }));
  return (
    <div className="page">
      <AdminNav />
      <h1 style={{ fontFamily: "var(--font-display)", marginTop: 16 }}>📸 {t("admin_title")}</h1>
      <p className="meta" style={{ marginBottom: 16 }}>{t("admin_intro")}</p>
      <AdminStories stories={stories} />
    </div>
  );
}
