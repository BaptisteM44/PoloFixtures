import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { ClubCard } from "@/components/ClubCard";
import { getTranslations } from "next-intl/server";

export default async function CountryPage({
  params,
}: {
  params: { code: string; country: string };
}) {
  const t = await getTranslations("continent");
  const code = params.code.toUpperCase();
  const country = decodeURIComponent(params.country);

  const validCodes = ["NA", "SA", "EU", "AF", "AS", "OC"];
  if (!validCodes.includes(code)) notFound();

  const clubs = await prisma.club.findMany({
    where: { continentCode: code, country, approved: true },
    include: {
      _count: {
        select: { members: { where: { status: "MEMBER" } } },
      },
    },
    orderBy: { name: "asc" },
  });

  // Vérifier que le continent est valide
  return (
    <div>
      <div className="section-title" style={{ marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Link className="ghost" href={`/continent/${code}`} style={{ fontSize: 13 }}>
              ← {(t as (key: string) => string)(`name_${code.toLowerCase()}`)}
            </Link>
          </div>
          <h1>{country}</h1>
          <p className="meta">{clubs.length === 1 ? t("country_clubs_count_one", { count: clubs.length }) : t("country_clubs_count_other", { count: clubs.length })}</p>
        </div>
        <Link className="primary" href={`/club/new`}>
          {t("clubs_add")}
        </Link>
      </div>

      {clubs.length > 0 ? (
        <div className="club-grid">
          {clubs.map((c) => (
            <ClubCard
              key={c.id}
              id={c.id}
              name={c.name}
              city={c.city}
              country={c.country}
              logoPath={c.logoPath ?? undefined}
              memberCount={c._count.members}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <p>{t("country_clubs_empty")}</p>
          <Link className="primary" href="/club/new" style={{ marginTop: 12, display: "inline-flex" }}>
            {t("clubs_create_first")}
          </Link>
        </div>
      )}
    </div>
  );
}
