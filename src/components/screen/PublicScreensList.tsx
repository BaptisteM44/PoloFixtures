import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { prisma } from "@/lib/db";
import { defaultScreens } from "@/lib/screen-slides";

/**
 * Onglet public « Écrans » : les écrans du tournoi, à ouvrir sur l'ordi ou le
 * téléphone branché à une TV (ou juste pour suivre en grand).
 */
export async function PublicScreensList({ tournamentId, tournamentSlug, courtsCount }: { tournamentId: string; tournamentSlug: string; courtsCount: number }) {
  const t = await getTranslations("screen");
  const stored = await prisma.tournamentScreen.findMany({ where: { tournamentId }, orderBy: { createdAt: "asc" }, select: { slug: true, name: true, mode: true, court: true } });
  const storedSlugs = new Set(stored.map((s) => s.slug));
  const screens = [...stored, ...defaultScreens(courtsCount).filter((d) => !storedSlugs.has(d.slug))];
  const title = (s: { slug: string; name: string; court: number }) =>
    s.name || (s.slug === "diaporama" ? t("default_slideshow") : t("court_n", { n: s.court }));

  return (
    <div className="panel public-screens">
      <h3 style={{ margin: 0 }}>📺 {t("public_title")}</h3>
      <p className="meta" style={{ margin: "4px 0 16px" }}>{t("public_desc")}</p>
      <div className="public-screens__grid">
        {screens.map((s) => (
          <Link key={s.slug} href={`/tournament/${tournamentSlug}/screen/${s.slug}`} className="public-screens__card" target="_blank">
            <span className="public-screens__icon">{s.mode === "court" ? "🏑" : "🖥"}</span>
            <strong>{title(s)}</strong>
            <small>{s.mode === "court" ? t("public_court_desc") : t("public_slideshow_desc")}</small>
          </Link>
        ))}
      </div>
    </div>
  );
}
