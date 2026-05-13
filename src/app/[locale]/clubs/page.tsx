import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ClubsPageTabs } from "@/components/ClubsPageTabs";
import { ClubMapClient } from "@/components/ClubMapClient";
import type { MapClub } from "@/components/ClubMapClient";

const CODE_TO_CONTINENT: Record<string, string> = {
  AD:"EU",AL:"EU",AT:"EU",BA:"EU",BE:"EU",BG:"EU",BY:"EU",CH:"EU",CY:"EU",CZ:"EU",
  DE:"EU",DK:"EU",EE:"EU",ES:"EU",FI:"EU",FR:"EU",GB:"EU",GE:"EU",GR:"EU",HR:"EU",
  HU:"EU",IE:"EU",IS:"EU",IT:"EU",LI:"EU",LT:"EU",LU:"EU",LV:"EU",MC:"EU",MD:"EU",
  ME:"EU",MK:"EU",MT:"EU",NL:"EU",NO:"EU",PL:"EU",PT:"EU",RO:"EU",RS:"EU",RU:"EU",
  SE:"EU",SI:"EU",SK:"EU",SM:"EU",TR:"EU",UA:"EU",VA:"EU",XK:"EU",
  CA:"NA",MX:"NA",US:"NA",
  AG:"SA",AR:"SA",BB:"SA",BO:"SA",BR:"SA",BS:"SA",BZ:"SA",CL:"SA",CO:"SA",CR:"SA",
  CU:"SA",DM:"SA",DO:"SA",EC:"SA",GD:"SA",GT:"SA",GY:"SA",HN:"SA",HT:"SA",JM:"SA",
  KN:"SA",LC:"SA",NI:"SA",PA:"SA",PE:"SA",PY:"SA",SR:"SA",SV:"SA",TT:"SA",UY:"SA",VC:"SA",VE:"SA",
  AO:"AF",BF:"AF",BI:"AF",BJ:"AF",BW:"AF",CD:"AF",CF:"AF",CG:"AF",CI:"AF",CM:"AF",
  CV:"AF",DJ:"AF",DZ:"AF",EG:"AF",ER:"AF",ET:"AF",GA:"AF",GH:"AF",GM:"AF",GN:"AF",
  GQ:"AF",GW:"AF",KE:"AF",KM:"AF",LR:"AF",LS:"AF",LY:"AF",MA:"AF",MG:"AF",ML:"AF",
  MR:"AF",MU:"AF",MW:"AF",MZ:"AF",NA:"AF",NE:"AF",NG:"AF",RW:"AF",SC:"AF",SD:"AF",
  SL:"AF",SN:"AF",SO:"AF",SS:"AF",ST:"AF",SZ:"AF",TD:"AF",TG:"AF",TN:"AF",TZ:"AF",UG:"AF",ZA:"AF",ZM:"AF",ZW:"AF",
  AE:"AS",AM:"AS",AZ:"AS",BD:"AS",BH:"AS",BN:"AS",BT:"AS",CN:"AS",
  HK:"AS",ID:"AS",IL:"AS",IN:"AS",IQ:"AS",IR:"AS",JO:"AS",JP:"AS",KG:"AS",KH:"AS",
  KP:"AS",KR:"AS",KW:"AS",KZ:"AS",LA:"AS",LB:"AS",LK:"AS",MM:"AS",MN:"AS",MO:"AS",
  MV:"AS",MY:"AS",NP:"AS",OM:"AS",PH:"AS",PK:"AS",PS:"AS",QA:"AS",SA:"AS",SG:"AS",
  SY:"AS",TH:"AS",TJ:"AS",TL:"AS",TM:"AS",TW:"AS",UZ:"AS",VN:"AS",YE:"AS",
  AU:"OC",FJ:"OC",FM:"OC",KI:"OC",MH:"OC",NR:"OC",NZ:"OC",PG:"OC",PW:"OC",SB:"OC",TO:"OC",TV:"OC",VU:"OC",WS:"OC",
};

function resolveContinent(country: string): string | null {
  if (!country) return null;
  const upper = country.trim().toUpperCase();
  if (upper.length === 2 && CODE_TO_CONTINENT[upper]) return CODE_TO_CONTINENT[upper];
  const byName: Record<string, string> = {
    "FRANCE":"EU","GERMANY":"EU","UNITED KINGDOM":"EU","SPAIN":"EU","ITALY":"EU",
    "NETHERLANDS":"EU","BELGIUM":"EU","PORTUGAL":"EU","SWITZERLAND":"EU","AUSTRIA":"EU",
    "POLAND":"EU","SWEDEN":"EU","NORWAY":"EU","DENMARK":"EU","FINLAND":"EU",
    "CZECH REPUBLIC":"EU","HUNGARY":"EU","ROMANIA":"EU","SLOVAKIA":"EU","CROATIA":"EU",
    "IRELAND":"EU","GREECE":"EU","SERBIA":"EU","UKRAINE":"EU","RUSSIA":"EU",
    "UNITED STATES":"NA","USA":"NA","CANADA":"NA","MEXICO":"NA",
    "BRAZIL":"SA","ARGENTINA":"SA","CHILE":"SA","COLOMBIA":"SA","PERU":"SA",
    "URUGUAY":"SA","ECUADOR":"SA","BOLIVIA":"SA","VENEZUELA":"SA","PARAGUAY":"SA",
    "JAPAN":"AS","SINGAPORE":"AS","SOUTH KOREA":"AS","CHINA":"AS","INDIA":"AS",
    "THAILAND":"AS","TAIWAN":"AS","PHILIPPINES":"AS","INDONESIA":"AS","VIETNAM":"AS",
    "MALAYSIA":"AS","PAKISTAN":"AS","ISRAEL":"AS",
    "AUSTRALIA":"OC","NEW ZEALAND":"OC",
    "SOUTH AFRICA":"AF","NIGERIA":"AF","KENYA":"AF","MOROCCO":"AF","GHANA":"AF","EGYPT":"AF",
  };
  return byName[upper] ?? null;
}

export default async function ClubsPage() {
  const t = await getTranslations("clubs");
  const session = await auth();
  const playerId = (session?.user as any)?.playerId ?? null;
  const hasPlayer = !!playerId;

  let playerContinent: string | null = null;
  if (playerId) {
    const player = await prisma.player.findUnique({ where: { id: playerId }, select: { country: true } });
    if (player?.country) playerContinent = resolveContinent(player.country);
  }

  const clubs = await prisma.club.findMany({
    where: { approved: true },
    include: {
      manager: { select: { id: true, name: true, slug: true } },
      _count: { select: { members: { where: { status: "MEMBER", player: { status: { not: "REJECTED" } } } } } },
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

  const mapClubs: MapClub[] = clubs
    .filter((c) => c.lat != null && c.lng != null)
    .map((c) => ({
      id: c.id,
      name: c.name,
      city: c.city,
      country: c.country,
      continentCode: c.continentCode,
      logoPath: c.logoPath,
      memberCount: c._count.members,
      lat: c.lat as number,
      lng: c.lng as number,
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

      {mapClubs.length > 0 && (
        <section>
          <ClubMapClient clubs={mapClubs} userContinent={playerContinent ?? undefined} />
        </section>
      )}

      <ClubsPageTabs clubs={mapped} />
    </div>
  );
}
