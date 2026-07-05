/**
 * Moteur de planning — horaires et terrains pour les matchs du pipeline,
 * dans le FUSEAU DU TOURNOI (fix du bug de décalage : les horaires étaient
 * interprétés dans le fuseau du visiteur/serveur).
 *
 * Principe : en base, tout est un instant UTC. La conversion se fait aux
 * frontières : saisie orga "9h00" → UTC via le fuseau du tournoi ; affichage
 * → formatage dans le fuseau du tournoi, pour tout le monde.
 */

// ─── Fuseau horaire ──────────────────────────────────────────────────────────

function tzOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));
  const asUTC = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second)
  );
  return asUTC - date.getTime();
}

/**
 * "Ce jour à cette heure, dans ce fuseau" → instant UTC.
 * Ex : zonedToUtc("2026-08-01", "09:00", "Europe/Brussels") → 2026-08-01T07:00:00Z
 */
export function zonedToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [h, min] = timeStr.split(":").map(Number);
  const utcGuess = Date.UTC(y, m - 1, d, h, min);
  const offset = tzOffsetMs(new Date(utcGuess), timeZone);
  let ts = utcGuess - offset;
  const offset2 = tzOffsetMs(new Date(ts), timeZone);
  if (offset2 !== offset) ts = utcGuess - offset2; // bascule DST
  return new Date(ts);
}

/** Formate un instant UTC dans le fuseau du tournoi (ex: "09:00"). */
export function formatInTz(date: Date, timeZone: string, withDate = false): string {
  return new Intl.DateTimeFormat("fr-BE", {
    timeZone, hour12: false,
    ...(withDate ? { day: "2-digit", month: "2-digit" } : {}),
    hour: "2-digit", minute: "2-digit",
  }).format(date);
}

// ─── Planification des rounds ────────────────────────────────────────────────

export type SchedulerConfig = {
  courtNames: string[];
  /** Durée d'un créneau (match + battement), en minutes. */
  slotMinutes: number;
  /** Pause supplémentaire entre rounds, en minutes (défaut 0). */
  roundBreakMinutes?: number;
  startAt: Date;
};

export type ScheduledSlot = { courtName: string; startAt: Date };

/**
 * Planifie des rounds séquentiels : au sein d'un round les matchs remplissent
 * les terrains en parallèle ; le round suivant démarre quand le précédent est
 * fini. Retourne les créneaux dans l'ordre des matchs fournis (round par round).
 */
export function scheduleRounds(
  roundSizes: number[],
  config: SchedulerConfig
): ScheduledSlot[][] {
  const courts = Math.max(config.courtNames.length, 1);
  const slotMs = config.slotMinutes * 60_000;
  const breakMs = (config.roundBreakMinutes ?? 0) * 60_000;

  const out: ScheduledSlot[][] = [];
  let roundStart = new Date(config.startAt);

  for (const size of roundSizes) {
    const slots: ScheduledSlot[] = [];
    for (let i = 0; i < size; i++) {
      slots.push({
        courtName: config.courtNames[i % courts] ?? "Court 1",
        startAt: new Date(roundStart.getTime() + Math.floor(i / courts) * slotMs),
      });
    }
    out.push(slots);
    const rows = Math.ceil(size / courts);
    roundStart = new Date(roundStart.getTime() + rows * slotMs + breakMs);
  }
  return out;
}

// ─── Détection de conflits ───────────────────────────────────────────────────

export type ConflictInput = {
  id: string;
  teamAId: string | null;
  teamBId: string | null;
  courtName: string;
  startAt: Date;
};

/**
 * Détecte : une équipe sur 2 matchs qui se chevauchent, et 2 matchs en même
 * temps sur le même terrain.
 */
export function detectConflicts(matches: ConflictInput[], slotMinutes: number): string[] {
  const problems: string[] = [];
  const slotMs = slotMinutes * 60_000;
  const overlap = (a: Date, b: Date) => Math.abs(a.getTime() - b.getTime()) < slotMs;

  for (let i = 0; i < matches.length; i++) {
    for (let j = i + 1; j < matches.length; j++) {
      const m1 = matches[i], m2 = matches[j];
      if (!overlap(m1.startAt, m2.startAt)) continue;
      if (m1.courtName === m2.courtName) {
        problems.push(`Terrain ${m1.courtName} surbooké (${m1.id} / ${m2.id})`);
      }
      const teams1 = [m1.teamAId, m1.teamBId].filter(Boolean);
      const teams2 = new Set([m2.teamAId, m2.teamBId].filter(Boolean));
      for (const t of teams1) {
        if (teams2.has(t)) problems.push(`Équipe ${t} sur 2 matchs simultanés (${m1.id} / ${m2.id})`);
      }
    }
  }
  return problems;
}
