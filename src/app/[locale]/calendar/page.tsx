import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getTranslations } from "next-intl/server";
import { CalendarGrid } from "@/components/CalendarGrid";
import type { CalendarTournament } from "@/components/CalendarGrid";

export default async function CalendarPage() {
  const t = await getTranslations("calendar");

  const session = await auth();
  const playerId = session?.user?.playerId;
  let playerContinent: string | null = null;
  if (playerId) {
    const player = await prisma.player.findUnique({ where: { id: playerId }, select: { country: true } });
    if (player?.country) {
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
    where: { approved: true, hidden: false, testMode: false },
    select: {
      id: true,
      slug: true,
      name: true,
      dateStart: true,
      dateEnd: true,
      status: true,
      city: true,
      country: true,
      continentCode: true,
      format: true,
    },
    orderBy: { dateStart: "asc" },
  });

  const data: CalendarTournament[] = tournaments.map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    dateStart: t.dateStart.toISOString(),
    dateEnd: t.dateEnd.toISOString(),
    status: t.status,
    city: t.city,
    country: t.country,
    continentCode: t.continentCode,
    format: t.format,
  }));

  return (
    <div className="calendar-page">
        <h1 style={{ marginBottom: 16 }}>{t("page_title")}</h1>
      <CalendarGrid tournaments={data} defaultContinent={playerContinent} />
    </div>
  );
}
