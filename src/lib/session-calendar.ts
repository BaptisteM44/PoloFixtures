/** Liens « ajouter à mon agenda » d'un entraînement (utilisable côté client). */
export function sessionCalendarLinks(s: { id: string; date: string; duration: number; title: string | null; place: string | null; clubName?: string }) {
  const start = new Date(s.date);
  const end = new Date(start.getTime() + s.duration * 60_000);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const text = s.title || (s.clubName ? `Bike polo — ${s.clubName}` : "Bike polo");
  const google = new URL("https://calendar.google.com/calendar/render");
  google.searchParams.set("action", "TEMPLATE");
  google.searchParams.set("text", text);
  google.searchParams.set("dates", `${fmt(start)}/${fmt(end)}`);
  if (s.place) google.searchParams.set("location", s.place);
  return { ics: `/api/club-sessions/${s.id}/ics`, google: google.toString() };
}
