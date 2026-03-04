import { prisma } from "@/lib/db";
import { CalendarGrid } from "@/components/CalendarGrid";
import type { CalendarTournament } from "@/components/CalendarGrid";

export default async function CalendarPage() {
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
    <>
      <h1 style={{ marginBottom: 24 }}>Calendrier des tournois</h1>
      <CalendarGrid tournaments={data} />
    </>
  );
}
