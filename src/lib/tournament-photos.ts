/**
 * Pellicule jetable d'un tournoi. Pendant le tournoi (du 1er jour 0h au dernier
 * jour 21h, heure du lieu), chaque participant prend jusqu'à 5 photos. Personne
 * ne voit celles des autres : tout est révélé d'un coup à 21h le dernier jour,
 * avec une notif aux participants. Les pellicules révélées récemment (ou
 * épinglées « à la une » par l'admin) apparaissent sur la home.
 */
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notify";
import { localTimeOnDay } from "@/lib/tournament-status";

export const PHOTOS_PER_PLAYER = 5;
export const REVEAL_HOUR_LOCAL = 21;
/** Durée pendant laquelle une pellicule révélée reste sur la home (hors « à la une »). */
export const HOME_ROLL_DAYS = 21;

type TournamentDates = { dateStart: Date; dateEnd: Date; timezone: string | null };

/** Ouverture de l'appareil : 0h (heure locale) le premier jour. */
export const shootingOpensAt = (t: TournamentDates) => localTimeOnDay(t.dateStart, t.timezone, 0);
/** Révélation : 21h (heure locale) le dernier jour. */
export const revealAt = (t: TournamentDates) => localTimeOnDay(t.dateEnd, t.timezone, REVEAL_HOUR_LOCAL);

export type RollPhase = "before" | "shooting" | "revealed";
export function rollPhase(t: TournamentDates, now = new Date()): RollPhase {
  if (now < shootingOpensAt(t)) return "before";
  if (now < revealAt(t)) return "shooting";
  return "revealed";
}

/**
 * Qui peut prendre des photos : les joueurs d'une équipe sélectionnée (ou
 * inscrits en solo, hors liste d'attente) et l'orga du tournoi (créateur,
 * co-orgas). L'admin du site aussi.
 */
export async function isRollParticipant(tournamentId: string, playerId: string): Promise<boolean> {
  const [team, solo, tournament] = await Promise.all([
    prisma.teamPlayer.findFirst({ where: { playerId, team: { tournamentId, selected: true } }, select: { id: true } }),
    prisma.tournamentSoloEntry.findFirst({ where: { playerId, tournamentId, waitlisted: false }, select: { id: true } }),
    prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { creatorId: true, coOrganizers: { where: { playerId }, select: { playerId: true } } },
    }),
  ]);
  return !!team || !!solo || tournament?.creatorId === playerId || (tournament?.coOrganizers.length ?? 0) > 0;
}

export type RollPhoto = {
  id: string;
  imagePath: string;
  createdAt: string;
  author: { id: string; name: string; slug: string | null; photoPath: string | null };
};

const photoSelect = {
  id: true, imagePath: true, createdAt: true,
  author: { select: { id: true, name: true, slug: true, photoPath: true } },
} as const;

type PhotoRow = { id: string; imagePath: string; createdAt: Date; author: RollPhoto["author"] };
const toPhoto = (p: PhotoRow): RollPhoto => ({ ...p, createdAt: p.createdAt.toISOString() });

/** Une pellicule révélée, telle qu'affichée sur la home. */
export type HomeRoll = {
  tournamentId: string;
  tournamentSlug: string | null;
  tournamentName: string;
  pinned: boolean;
  revealedAt: string;
  photos: RollPhoto[];
};

/** Raccourci « appareil photo » d'un tournoi en cours pour un participant. */
export type HomeCamera = {
  tournamentId: string;
  tournamentSlug: string | null;
  tournamentName: string;
  remaining: number;
  revealAt: string;
};

/**
 * Pellicules pour la home : celles révélées depuis moins de HOME_ROLL_DAYS
 * jours ou épinglées (épinglées d'abord), et les appareils ouverts du joueur.
 */
export async function loadHomeRolls(viewerId: string | null, now = new Date()): Promise<{ rolls: HomeRoll[]; cameras: HomeCamera[] }> {
  const recent = new Date(now.getTime() - (HOME_ROLL_DAYS + 1) * 86400_000);
  const tournaments = await prisma.tournament.findMany({
    where: {
      approved: true, hidden: false,
      photos: { some: { hiddenAt: null } },
      OR: [{ photosPinnedAt: { not: null } }, { dateEnd: { gte: recent, lte: now } }],
    },
    select: {
      id: true, slug: true, name: true, dateStart: true, dateEnd: true, timezone: true, photosPinnedAt: true,
      photos: { where: { hiddenAt: null }, orderBy: { createdAt: "asc" }, take: 80, select: photoSelect },
    },
    take: 40,
  });

  const rolls: HomeRoll[] = tournaments
    .map((t) => ({ t, reveal: revealAt(t) }))
    .filter(({ t, reveal }) =>
      reveal <= now && (t.photosPinnedAt !== null || now.getTime() - reveal.getTime() <= HOME_ROLL_DAYS * 86400_000))
    .sort((a, b) =>
      Number(b.t.photosPinnedAt !== null) - Number(a.t.photosPinnedAt !== null) || b.reveal.getTime() - a.reveal.getTime())
    .map(({ t, reveal }) => ({
      tournamentId: t.id,
      tournamentSlug: t.slug,
      tournamentName: t.name,
      pinned: t.photosPinnedAt !== null,
      revealedAt: reveal.toISOString(),
      photos: t.photos.map(toPhoto),
    }));

  const cameras: HomeCamera[] = [];
  if (viewerId) {
    const soon = new Date(now.getTime() + 86400_000);
    const yesterday = new Date(now.getTime() - 2 * 86400_000);
    const live = await prisma.tournament.findMany({
      where: {
        approved: true, hidden: false, testMode: false,
        dateStart: { lte: soon }, dateEnd: { gte: yesterday },
        OR: [
          { teams: { some: { selected: true, players: { some: { playerId: viewerId } } } } },
          { soloEntries: { some: { playerId: viewerId, waitlisted: false } } },
          { creatorId: viewerId },
          { coOrganizers: { some: { playerId: viewerId } } },
        ],
      },
      select: {
        id: true, slug: true, name: true, dateStart: true, dateEnd: true, timezone: true,
        _count: { select: { photos: { where: { authorId: viewerId } } } },
      },
    });
    for (const t of live) {
      if (rollPhase(t, now) !== "shooting") continue;
      cameras.push({
        tournamentId: t.id, tournamentSlug: t.slug, tournamentName: t.name,
        remaining: Math.max(0, PHOTOS_PER_PLAYER - t._count.photos),
        revealAt: revealAt(t).toISOString(),
      });
    }
  }
  return { rolls, cameras };
}

/**
 * Révélations à notifier : tournois dont la pellicule vient d'être révélée
 * (dans les 7 derniers jours), pas encore notifiés, avec au moins une photo.
 * Destinataires : joueurs sélectionnés, solos, orgas et photographes.
 */
export async function sweepPhotoReveals(now = new Date()) {
  const tournaments = await prisma.tournament.findMany({
    where: {
      photosRevealNotifiedAt: null,
      dateEnd: { gte: new Date(now.getTime() - 8 * 86400_000), lte: new Date(now.getTime() + 86400_000) },
      photos: { some: { hiddenAt: null } },
    },
    select: {
      id: true, slug: true, name: true, dateStart: true, dateEnd: true, timezone: true, creatorId: true,
      coOrganizers: { select: { playerId: true } },
      teams: { where: { selected: true }, select: { players: { select: { playerId: true } } } },
      soloEntries: { where: { waitlisted: false }, select: { playerId: true } },
      photos: { where: { hiddenAt: null }, select: { authorId: true } },
    },
  });

  for (const t of tournaments) {
    const reveal = revealAt(t);
    if (reveal > now) continue;
    // Marqué d'abord : un second balayage concurrent ne renotifie pas.
    const claimed = await prisma.tournament.updateMany({
      where: { id: t.id, photosRevealNotifiedAt: null },
      data: { photosRevealNotifiedAt: now },
    });
    if (claimed.count === 0) continue;
    // Pellicule révélée il y a plus de 7 jours (ex. déploiement tardif) : pas de notif.
    if (now.getTime() - reveal.getTime() > 7 * 86400_000) continue;

    const ids = new Set<string>([
      ...(t.creatorId ? [t.creatorId] : []),
      ...t.coOrganizers.map((c) => c.playerId),
      ...t.teams.flatMap((team) => team.players.map((p) => p.playerId)),
      ...t.soloEntries.map((s) => s.playerId),
      ...t.photos.map((p) => p.authorId),
    ]);
    const withAccount = await prisma.player.findMany({
      where: { id: { in: [...ids] }, account: { isNot: null }, status: "ACTIVE" },
      select: { id: true },
    });
    const payload = { tournamentId: t.id, tournamentSlug: t.slug ?? "", tournamentName: t.name, count: t.photos.length };
    for (let i = 0; i < withAccount.length; i += 20) {
      await Promise.all(withAccount.slice(i, i + 20).map((p) => createNotification(p.id, "TOURNAMENT_PHOTOS_REVEALED", payload)));
    }
  }
}

// Balayage opportuniste (sans cron) : au plus toutes les 5 min par instance.
let lastSweep = 0;
export function maybeSweepPhotoReveals() {
  const now = Date.now();
  if (now - lastSweep < 5 * 60_000) return;
  lastSweep = now;
  sweepPhotoReveals().catch((e) => console.error("[photos] reveal sweep failed:", e));
}
