import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ClubsBrowser } from "@/components/ClubsBrowser";

export default async function ClubsPage() {
  const t = await getTranslations("clubs");
  const session = await auth();
  const hasPlayer = !!(session?.user as any)?.playerId;

  const clubs = await prisma.club.findMany({
    where: { approved: true },
    include: {
      manager: { select: { id: true, name: true, slug: true } },
      _count: { select: { members: { where: { status: "MEMBER" } } } },
    },
    orderBy: [{ continentCode: "asc" }, { country: "asc" }, { name: "asc" }],
  });

  const mapped = clubs.map((c) => ({
    id: c.id,
    name: c.name,
    city: c.city,
    country: c.country,
    continentCode: c.continentCode,
    logoPath: c.logoPath,
    memberCount: c._count.members,
  }));

  return (
    <div className="clubs-page">
      <div className="clubs-page__hero">
        <div>
          <h1>{t("title")}</h1>
          <p>{t("subtitle")}</p>
        </div>
        {hasPlayer && (
          <Link className="primary" href="/club/new">{t("create_club")}</Link>
        )}
      </div>

      <ClubsBrowser clubs={mapped} />
    </div>
  );
}
