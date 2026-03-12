import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getTranslations } from "next-intl/server";
import { TournamentBrowser } from "@/components/TournamentBrowser";

export default async function TournamentsPage() {
  const t = await getTranslations("tournaments");

  const session = await auth();
  const playerId = session?.user?.playerId;
  let playerContinent: string | null = null;
  if (playerId) {
    const player = await prisma.player.findUnique({ where: { id: playerId }, select: { country: true } });
    if (player?.country) {
      // Map country → continent code (covers most bike polo countries)
      const euCountries = ["FR","BE","NL","DE","GB","ES","IT","CH","AT","SE","NO","DK","FI","PL","CZ","SK","HU","RO","BG","HR","SI","PT","IE","LU","GR","LT","LV","EE","IS","RS","UA","TR"];
      const naCountries = ["US","CA","MX"];
      const saCountries = ["BR","AR","CL","CO","PE","UY","EC","VE","BO","PY"];
      const asCountries = ["JP","KR","CN","TW","IN","TH","SG","AU","NZ","ID","PH","VN","MY","HK"];
      const afCountries = ["ZA","NG","KE","GH","EG","MA","TN"];
      const c = player.country.toUpperCase();
      if (euCountries.includes(c)) playerContinent = "EU";
      else if (naCountries.includes(c)) playerContinent = "NA";
      else if (saCountries.includes(c)) playerContinent = "SA";
      else if (asCountries.includes(c)) playerContinent = "AS";
      else if (afCountries.includes(c)) playerContinent = "AF";
    }
  }

  const tournaments = await prisma.tournament.findMany({
    where: { approved: true },
    include: { teams: true },
    orderBy: { dateStart: "asc" }
  });

  const data = tournaments.map((t) => ({
    id: t.id,
    name: t.name,
    continentCode: t.continentCode,
    country: t.country,
    city: t.city,
    dateStart: t.dateStart.toISOString(),
    dateEnd: t.dateEnd.toISOString(),
    format: t.format,
    status: t.status,
    maxTeams: t.maxTeams,
    teamCount: t.teams.length,
    registrationStart: t.registrationStart?.toISOString() ?? null,
    registrationEnd: t.registrationEnd?.toISOString() ?? null,
    bannerPath: t.bannerPath,
  }));

  return (
    <div>
      <div className="section-header" style={{ marginBottom: 24 }}>
        <div>
          <h1>{t("page_title")}</h1>
          <p>{t("page_subtitle")}</p>
        </div>
      </div>
      <TournamentBrowser tournaments={data} defaultContinent={playerContinent} />
    </div>
  );
}
