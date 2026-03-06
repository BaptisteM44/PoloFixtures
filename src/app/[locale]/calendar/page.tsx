import { prisma } from "@/lib/db";
import { getTranslations } from "next-intl/server";
import { CalendarGrid } from "@/components/CalendarGrid";
import type { CalendarTournament } from "@/components/CalendarGrid";

export default async function CalendarPage() {
  const t = await getTranslations("calendar");
  const tournaments = await prisma.tournament.findMany({
    where: { approved: true },
    select: {
      id: true,
      name: true,
      dateStart: true,
      dateEnd: true,
      status: true,
      city: true,
      country: true,
      format: true,
    },
    orderBy: { dateStart: "asc" },
  });

  const data: CalendarTournament[] = tournaments.map((t) => ({
    id: t.id,
    name: t.name,
    dateStart: t.dateStart.toISOString(),
    dateEnd: t.dateEnd.toISOString(),
    status: t.status,
    city: t.city,
    country: t.country,
    format: t.format,
  }));

  return (
    <div className="calendar-page">
        <h1 style={{ marginBottom: 16 }}>{t("page_title")}</h1>
      <CalendarGrid tournaments={data} />
    </div>
  );
}
