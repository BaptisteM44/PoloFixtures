import { prisma } from "@/lib/db";

// GET /api/club-sessions/:id/ics — fichier agenda d'un entraînement
// (iPhone / Mac / Outlook l'ouvrent directement et proposent de l'ajouter).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const s = await prisma.clubSession.findUnique({
    where: { id: params.id },
    select: {
      id: true, title: true, date: true, duration: true, location: true, notes: true, status: true,
      venue: { select: { name: true } }, club: { select: { id: true, name: true } },
    },
  });
  if (!s || s.status === "DELETED") return new Response("Not found", { status: 404 });

  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (m) => "\\" + m);
  const end = new Date(s.date.getTime() + s.duration * 60_000);
  const appUrl = process.env.NEXTAUTH_URL ?? "https://poloperator.com";
  const place = s.venue?.name ?? s.location ?? "";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Poloperator//Training//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:session-${s.id}@poloperator`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(s.date)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${esc(s.title || `Bike polo — ${s.club.name}`)}`,
    ...(place ? [`LOCATION:${esc(place)}`] : []),
    `DESCRIPTION:${esc([s.notes ?? "", `${appUrl}/club/${s.club.id}?tab=sessions`].filter(Boolean).join("\n"))}`,
    `URL:${appUrl}/club/${s.club.id}?tab=sessions`,
    ...(s.status === "CANCELLED" ? ["STATUS:CANCELLED"] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return new Response(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="entrainement-${s.id}.ics"`,
    },
  });
}
