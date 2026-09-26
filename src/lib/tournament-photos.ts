/**
 * Galerie d'un tournoi. Du 1er jour (0h heure du lieu, ou dès que l'orga lance
 * le tournoi) jusqu'à 7 jours après la fin, chacun peut ajouter jusqu'à 5
 * photos, visibles tout de suite :
 *  - participants (joueurs sélectionnés, solos inscrits) et orga : publiées
 *    directement ;
 *  - personnes extérieures : proposées, invisibles tant que l'orga (notifiée)
 *    ne les a pas validées dans l'onglet.
 * À la fin du tournoi (21h le dernier jour), les participants reçoivent
 * « N photos dans la galerie — ajoute les tiennes ». Les galeries récentes (ou
 * épinglées « à la une » par l'admin) apparaissent en bulles sur la home.
 */
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notify";
import { localTimeOnDay } from "@/lib/tournament-status";
import { tournamentTimezone } from "@/lib/timezone";

export const PHOTOS_PER_PLAYER = 5;
/** Heure locale de fin du tournoi (notif « ajoute tes photos »). */
export const END_HOUR_LOCAL = 21;
/** Ajouts encore possibles N jours après la fin (photographes, albums tardifs). */
export const GALLERY_OPEN_DAYS_AFTER = 7;
/** Durée pendant laquelle une galerie reste sur la home après la fin (hors « à la une »). */
export const HOME_GALLERY_DAYS = 21;
const DAY_MS = 86400_000;

/**
 * Ce qu'il faut d'un tournoi pour situer sa galerie. Pays et longitude servent
 * de secours quand le fuseau n'est pas renseigné (cf. lib/timezone).
 */
export type TournamentDates = {
  dateStart: Date; dateEnd: Date; timezone: string | null;
  country?: string | null; lng?: number | null; status?: string | null;
};
export const galleryTournamentSelect = {
  dateStart: true, dateEnd: true, timezone: true, country: true, lng: true, status: true,
} as const;

/** Ouverture : 0h (heure locale) le premier jour. */
export const galleryOpensAt = (t: TournamentDates) => localTimeOnDay(t.dateStart, tournamentTimezone(t), 0);
/** Fin du tournoi : 21h (heure locale) le dernier jour. */
export const tournamentEndsAt = (t: TournamentDates) => localTimeOnDay(t.dateEnd, tournamentTimezone(t), END_HOUR_LOCAL);
/** Fermeture des ajouts : 7 jours après la fin. */
export const galleryClosesAt = (t: TournamentDates) => new Date(tournamentEndsAt(t).getTime() + GALLERY_OPEN_DAYS_AFTER * DAY_MS);

export type GalleryPhase = "before" | "open" | "closed";
/** Avant (rien à ajouter) / ouverte (ajouts possibles) / fermée (lecture seule). */
export function galleryPhase(t: TournamentDates, now = new Date()): GalleryPhase {
  if (now >= galleryClosesAt(t)) return "closed";
  if (now >= galleryOpensAt(t) || t.status === "LIVE" || t.status === "COMPLETED") return "open";
  return "before";
}
/** Tournoi en train de se jouer (bulle 📷 sur la home) : ouverte et pas encore fini. */
export const isTournamentRunning = (t: TournamentDates, now = new Date()) =>
  galleryPhase(t, now) === "open" && now < tournamentEndsAt(t);

/**
 * Participants (publication directe) : joueurs d'une équipe sélectionnée,
 * solos hors liste d'attente, créateur et co-orgas du tournoi.
 */
export async function isGalleryParticipant(tournamentId: string, playerId: string): Promise<boolean> {
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

export type GalleryPhoto = {
  id: string;
  imagePath: string;
  createdAt: string;
  pending?: boolean;
  author: { id: string; name: string; slug: string | null; photoPath: string | null };
};

export const galleryPhotoSelect = {
  id: true, imagePath: true, createdAt: true, pendingApproval: true,
  author: { select: { id: true, name: true, slug: true, photoPath: true } },
} as const;

type PhotoRow = { id: string; imagePath: string; createdAt: Date; pendingApproval: boolean; author: GalleryPhoto["author"] };
export const toGalleryPhoto = ({ pendingApproval, ...p }: PhotoRow): GalleryPhoto => ({
  ...p, createdAt: p.createdAt.toISOString(), ...(pendingApproval ? { pending: true } : {}),
});

/** Photos publiques : ni en attente de validation, ni masquées. */
export const visiblePhotoWhere = { hiddenAt: null, pendingApproval: false } as const;

/** Une galerie telle qu'affichée sur la home. */
export type HomeGallery = {
  tournamentId: string;
  tournamentSlug: string | null;
  tournamentName: string;
  pinned: boolean;
  photos: GalleryPhoto[];
};

/** Raccourci « 📷 » d'un tournoi en cours pour un participant. */
export type HomeCamera = {
  tournamentId: string;
  tournamentSlug: string | null;
  tournamentName: string;
  remaining: number;
};

/**
 * Home : galeries avec au moins une photo publique, du tournoi en cours
 * jusqu'à HOME_GALLERY_DAYS jours après sa fin, ou épinglées (en premier) ;
 * les plus fraîches d'abord. Plus les raccourcis 📷 des tournois où je joue.
 */
export async function loadHomeGalleries(viewerId: string | null, now = new Date()): Promise<{ galleries: HomeGallery[]; cameras: HomeCamera[] }> {
  const recent = new Date(now.getTime() - (HOME_GALLERY_DAYS + 1) * DAY_MS);
  const tournaments = await prisma.tournament.findMany({
    where: {
      approved: true, hidden: false,
      photos: { some: visiblePhotoWhere },
      OR: [{ photosPinnedAt: { not: null } }, { dateEnd: { gte: recent } }],
    },
    select: {
      id: true, slug: true, name: true, ...galleryTournamentSelect, photosPinnedAt: true,
      photos: { where: visiblePhotoWhere, orderBy: { createdAt: "asc" }, take: 80, select: galleryPhotoSelect },
    },
    take: 40,
  });

  const galleries: HomeGallery[] = tournaments
    .filter((t) => galleryPhase(t, now) !== "before")
    .filter((t) => t.photosPinnedAt !== null || now.getTime() - tournamentEndsAt(t).getTime() <= HOME_GALLERY_DAYS * DAY_MS)
    .map((t) => ({ t, latest: Math.max(...t.photos.map((p) => p.createdAt.getTime())) }))
    .sort((a, b) => Number(b.t.photosPinnedAt !== null) - Number(a.t.photosPinnedAt !== null) || b.latest - a.latest)
    .map(({ t }) => ({
      tournamentId: t.id,
      tournamentSlug: t.slug,
      tournamentName: t.name,
      pinned: t.photosPinnedAt !== null,
      photos: t.photos.map(toGalleryPhoto),
    }));

  const cameras: HomeCamera[] = [];
  if (viewerId) {
    const soon = new Date(now.getTime() + DAY_MS);
    const yesterday = new Date(now.getTime() - 2 * DAY_MS);
    const live = await prisma.tournament.findMany({
      where: {
        approved: true, hidden: false, testMode: false,
        AND: [
          // En cours d'après les dates, ou lancé en avance par l'orga.
          { OR: [{ dateStart: { lte: soon }, dateEnd: { gte: yesterday } }, { status: "LIVE" }] },
          {
            OR: [
              { teams: { some: { selected: true, players: { some: { playerId: viewerId } } } } },
              { soloEntries: { some: { playerId: viewerId, waitlisted: false } } },
              { creatorId: viewerId },
              { coOrganizers: { some: { playerId: viewerId } } },
            ],
          },
        ],
      },
      select: {
        id: true, slug: true, name: true, ...galleryTournamentSelect,
        _count: { select: { photos: { where: { authorId: viewerId } } } },
      },
    });
    for (const t of live) {
      if (!isTournamentRunning(t, now)) continue;
      cameras.push({
        tournamentId: t.id, tournamentSlug: t.slug, tournamentName: t.name,
        remaining: Math.max(0, PHOTOS_PER_PLAYER - t._count.photos),
      });
    }
  }
  return { galleries, cameras };
}

/** Destinataires « orga » d'un tournoi (créateur + co-orgas avec compte), ou les admins à défaut. */
async function orgaRecipients(tournamentId: string): Promise<string[]> {
  const t = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { creatorId: true, coOrganizers: { select: { playerId: true } } },
  });
  const ids = [...new Set([...(t?.creatorId ? [t.creatorId] : []), ...(t?.coOrganizers.map((c) => c.playerId) ?? [])])];
  const withAccount = ids.length > 0
    ? (await prisma.player.findMany({ where: { id: { in: ids }, account: { isNot: null } }, select: { id: true } })).map((p) => p.id)
    : [];
  if (withAccount.length > 0) return withAccount;
  const admins = await prisma.operator.findMany({ where: { playerId: { not: null }, roles: { has: "ADMIN" } }, select: { playerId: true } });
  return [...new Set(admins.map((a) => a.playerId!))];
}

/**
 * Une personne extérieure a proposé une photo : on prévient l'orga. Une seule
 * notif non lue par tournoi et par orga, dont le compteur est mis à jour (pas
 * 5 notifs pour 5 photos).
 */
export async function notifyPhotoRequest(tournamentId: string) {
  const [t, pending] = await Promise.all([
    prisma.tournament.findUnique({ where: { id: tournamentId }, select: { id: true, slug: true, name: true } }),
    prisma.tournamentPhoto.count({ where: { tournamentId, pendingApproval: true, hiddenAt: null } }),
  ]);
  if (!t || pending === 0) return;
  const payload = { tournamentId: t.id, tournamentSlug: t.slug ?? "", tournamentName: t.name, count: pending };
  for (const playerId of await orgaRecipients(tournamentId)) {
    const existing = await prisma.notification.findFirst({
      where: { playerId, type: "TOURNAMENT_PHOTOS_REQUESTED", read: false, payload: { path: ["tournamentId"], equals: tournamentId } },
      select: { id: true },
    });
    if (existing) await prisma.notification.update({ where: { id: existing.id }, data: { payload } });
    else await createNotification(playerId, "TOURNAMENT_PHOTOS_REQUESTED", payload);
  }
}

/** Retour à l'auteur des photos proposées : acceptées et/ou refusées. */
export async function notifyPhotoDecision(
  authorId: string,
  t: { id: string; slug: string | null; name: string },
  approved: number,
  rejected: number,
) {
  if (approved + rejected === 0) return;
  await createNotification(authorId, "TOURNAMENT_PHOTOS_DECIDED", {
    tournamentId: t.id, tournamentSlug: t.slug ?? "", tournamentName: t.name, approved, rejected,
  });
}

/**
 * Fin de tournoi (21h le dernier jour) : « N photos dans la galerie — ajoute
 * les tiennes ». Une fois par tournoi, seulement s'il y a au moins une photo,
 * et pas si on a plus de 7 jours de retard (ex. déploiement tardif).
 */
export async function sweepGalleryEnds(now = new Date()) {
  const tournaments = await prisma.tournament.findMany({
    where: {
      photosRevealNotifiedAt: null,
      dateEnd: { gte: new Date(now.getTime() - 8 * DAY_MS), lte: new Date(now.getTime() + DAY_MS) },
      photos: { some: visiblePhotoWhere },
    },
    select: {
      id: true, slug: true, name: true, ...galleryTournamentSelect, creatorId: true,
      coOrganizers: { select: { playerId: true } },
      teams: { where: { selected: true }, select: { players: { select: { playerId: true } } } },
      soloEntries: { where: { waitlisted: false }, select: { playerId: true } },
      photos: { where: visiblePhotoWhere, select: { authorId: true } },
    },
  });

  for (const t of tournaments) {
    const endsAt = tournamentEndsAt(t);
    if (endsAt > now) continue;
    // Marqué d'abord : un second balayage concurrent ne renotifie pas.
    const claimed = await prisma.tournament.updateMany({
      where: { id: t.id, photosRevealNotifiedAt: null },
      data: { photosRevealNotifiedAt: now },
    });
    if (claimed.count === 0) continue;
    if (now.getTime() - endsAt.getTime() > 7 * DAY_MS) continue;

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
export function maybeSweepGalleries() {
  const now = Date.now();
  if (now - lastSweep < 5 * 60_000) return;
  lastSweep = now;
  sweepGalleryEnds().catch((e) => console.error("[gallery] end sweep failed:", e));
}
