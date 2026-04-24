import { prisma } from "@/lib/db";
import { getTranslations } from "next-intl/server";
import { OverlayHub } from "@/components/OverlayHub";

export default async function OverlayHubPage() {
  const t = await getTranslations("overlay");

  const tournaments = await prisma.tournament.findMany({
    where: {
      status: { in: ["UPCOMING", "LIVE"] },
      hidden: false,
    },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      courtsCount: true,
      dateStart: true,
      dateEnd: true,
      city: true,
      country: true,
    },
    orderBy: { dateStart: "asc" },
  });

  return (
    <div className="container" style={{ maxWidth: 800, margin: "0 auto", padding: "32px 16px" }}>
      <h1>{t("title")}</h1>
      <p className="meta" style={{ marginBottom: 24 }}>{t("subtitle")}</p>

      {/* How it works */}
      <div className="card" style={{ marginBottom: 32, padding: 24 }}>
        <h2 style={{ marginTop: 0, marginBottom: 16 }}>{t("how_title")}</h2>
        <ol style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          <li>
            <strong>{t("step1_title")}</strong>
            <br />
            <span className="meta">{t("step1_desc")}</span>
          </li>
          <li>
            <strong>{t("step2_title")}</strong>
            <br />
            <span className="meta">{t("step2_desc")}</span>
          </li>
          <li>
            <strong>{t("step3_title")}</strong>
            <br />
            <span className="meta">{t("step3_desc")}</span>
          </li>
        </ol>
      </div>

      {/* Tournament list */}
      <h2>{t("tournaments_title")}</h2>
      {tournaments.length === 0 ? (
        <p className="meta">{t("no_tournaments")}</p>
      ) : (
        <OverlayHub tournaments={tournaments} />
      )}
    </div>
  );
}
