import { prisma } from "@/lib/db";
import { guessTimezone } from "@/lib/timezone";
import cityCoords from "@/data/polo-city-coords.json";

const norm = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(",")[0].trim();
const CITY_LNG = new Map(Object.entries(cityCoords as Record<string, { lng: number }>).map(([name, c]) => [norm(name), c.lng]));

/** Fuseau d'un club : pays + longitude de sa ville quand elle est connue (Canada,
 *  États-Unis… ont plusieurs fuseaux : le pays seul donnait Terre-Neuve pour Montréal). */
export function clubTimezone(city: string | null | undefined, country: string | null | undefined): string {
  const lng = city ? CITY_LNG.get(norm(city)) : undefined;
  return guessTimezone(country, lng ?? null) ?? "UTC";
}

/** Les séries récurrentes sont générées jusqu'à cette distance dans le futur. */
const HORIZON_DAYS = 28;
/** Série « endormie » : aucune date depuis plus longtemps → pas de relance
 *  automatique (le club a peut-être arrêté), l'orga la relance d'un clic. */
export const SERIES_DORMANT_DAYS = 21;
const DAY_MS = 86_400_000;

/** Décalage (minutes) du fuseau `tz` à l'instant `at` : heure locale − UTC. */
function tzOffsetMinutes(at: Date, tz: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    }).formatToParts(at);
    const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    const asUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"));
    return Math.round((asUtc - Math.floor(at.getTime() / 60_000) * 60_000) / 60_000);
  } catch {
    return 0;
  }
}

/** Jour local (AAAA-MM-JJ) et heure locale (HH:MM) d'un instant dans `tz`. */
export function localParts(at: Date, tz: string): { ymd: string; hm: string } {
  const local = new Date(at.getTime() + tzOffsetMinutes(at, tz) * 60_000);
  return {
    ymd: local.toISOString().slice(0, 10),
    hm: local.toISOString().slice(11, 16),
  };
}

/** Instant UTC correspondant à « AAAA-MM-JJ HH:MM » heure locale de `tz` (DST compris). */
export function zonedToUtc(ymd: string, hm: string, tz: string): Date {
  const [y, mo, d] = ymd.split("-").map(Number);
  const [h, mi] = hm.split(":").map(Number);
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  // Le décalage dépend de l'instant : on le mesure au voisinage de l'heure visée.
  const offset = tzOffsetMinutes(new Date(naive), tz);
  return new Date(naive - offset * 60_000);
}

function addDays(ymd: string, days: number): string {
  const [y, mo, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d) + days * DAY_MS).toISOString().slice(0, 10);
}

const inFlight = new Map<string, Promise<void>>();

/**
 * Crée les dates manquantes des séries récurrentes de ces clubs, jusqu'à
 * HORIZON_DAYS. Appelé au chargement de la page club et de l'accueil : plus
 * besoin de cliquer « Générer la prochaine séance » chaque semaine (oubli =
 * plus aucune séance affichée, c'est ce qui faisait mourir les entraînements).
 * Une date annulée ou retirée (CANCELLED / DELETED) existe toujours : elle
 * n'est donc jamais recréée. Aucune notification : ce sont des dates prévues.
 */
export async function ensureRecurringSessions(
  clubIds: string[],
  opts: {
    /** Heure locale (HH:MM) imposée pour une série dont l'orga vient de changer l'horaire. */
    timeOverrides?: Record<string, string>;
    /** Séries à relancer même si elles sont endormies (bouton « Relancer »). */
    revive?: string[];
  } = {},
): Promise<void> {
  const ids = [...new Set(clubIds)].filter(Boolean);
  await Promise.all(ids.map((clubId) => {
    const running = inFlight.get(clubId);
    if (running) return running;
    const job = generateForClub(clubId, opts.timeOverrides ?? {}, new Set(opts.revive ?? [])).catch((e) => console.error("[club-sessions] génération", clubId, e))
      .finally(() => inFlight.delete(clubId));
    inFlight.set(clubId, job);
    return job;
  }));
}

async function generateForClub(clubId: string, timeOverrides: Record<string, string>, revive: Set<string>): Promise<void> {
  const templates = await prisma.clubSession.findMany({
    where: { clubId, recurring: true, recurrenceDay: { not: null } },
    include: { club: { select: { city: true, country: true } } },
  });
  if (templates.length === 0) return;

  const now = Date.now();
  const horizon = now + HORIZON_DAYS * DAY_MS;

  for (const tpl of templates) {
    const tz = clubTimezone(tpl.club.city, tpl.club.country);
    const tplLocal = localParts(tpl.date, tz);
    // Heure de la série = celle de sa dernière date réelle (comme l'ancien bouton
    // « Générer », qui ajoutait 7 jours), mais recalée sur l'heure locale : le
    // passage heure d'été / d'hiver ne décale plus l'entraînement. recurrenceTime
    // n'est pas fiable seul : saisi dans le fuseau du navigateur du créateur.
    const latest = await prisma.clubSession.findFirst({
      where: { clubId, OR: [{ seriesId: tpl.id }, { id: tpl.id }] },
      orderBy: { date: "desc" },
      select: { date: true },
    });
    if (!revive.has(tpl.id) && (latest ?? tpl).date.getTime() < now - SERIES_DORMANT_DAYS * DAY_MS) continue;
    const override = timeOverrides[tpl.id];
    const hm = override && /^\d{2}:\d{2}$/.test(override) ? override : localParts((latest ?? tpl).date, tz).hm;

    const existing = await prisma.clubSession.findMany({
      where: {
        clubId,
        date: { gte: new Date(now - 2 * DAY_MS) },
        OR: [
          { seriesId: tpl.id },
          { id: tpl.id },
          // Dates générées avant l'existence de seriesId (rattachées par le SQL de migration en principe)
          { seriesId: null, recurring: false, recurrenceDay: tpl.recurrenceDay },
        ],
      },
      select: { date: true },
    });
    const taken = new Set(existing.map((s) => localParts(s.date, tz).ymd));

    // 1re date de la série après la séance modèle, sur le jour choisi
    // (recurrenceDay : 0 = dimanche, comme getUTCDay) — même s'il a été modifié depuis.
    const [ty, tm, td] = tplLocal.ymd.split("-").map(Number);
    const tplWeekday = new Date(Date.UTC(ty, tm - 1, td)).getUTCDay();
    const firstOffset = ((tpl.recurrenceDay! - tplWeekday + 7) % 7) || 7;

    for (let k = 0; ; k++) {
      const ymd = addDays(tplLocal.ymd, firstOffset + 7 * k);
      const at = zonedToUtc(ymd, hm, tz);
      if (at.getTime() > horizon) break;
      if (at.getTime() <= now || taken.has(ymd)) continue;
      await prisma.clubSession.create({
        data: {
          clubId,
          seriesId: tpl.id,
          title: tpl.title,
          date: at,
          duration: tpl.duration,
          venueId: tpl.venueId,
          location: tpl.location,
          notes: tpl.notes,
          recurring: false,
          recurrenceDay: tpl.recurrenceDay,
          recurrenceTime: hm,
          color: tpl.color,
          createdById: tpl.createdById,
        },
      });
      taken.add(ymd);
    }
  }
}

/** Entraînements réellement faits par un joueur (inscrit confirmé, séance passée et maintenue). */
export async function countAttendedTrainings(playerId: string): Promise<number> {
  return prisma.clubSessionAttendee.count({
    where: { playerId, status: "CONFIRMED", session: { status: "ACTIVE", date: { lt: new Date() } } },
  });
}
