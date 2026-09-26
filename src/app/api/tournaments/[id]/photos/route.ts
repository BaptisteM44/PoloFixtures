import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { getOrgaPlayerId } from "@/lib/orga-auth";
import { tournamentTimezone } from "@/lib/timezone";
import {
  PHOTOS_PER_PLAYER, galleryClosesAt, galleryOpensAt, galleryPhase, galleryPhotoSelect, galleryTournamentSelect,
  isGalleryParticipant, notifyPhotoRequest, toGalleryPhoto, tournamentEndsAt, visiblePhotoWhere,
} from "@/lib/tournament-photos";

export const dynamic = "force-dynamic";

async function loadTournament(id: string) {
  return prisma.tournament.findUnique({
    where: { id },
    select: { id: true, ...galleryTournamentSelect, photosPinnedAt: true },
  });
}

/**
 * État de la galerie pour le visiteur : photos publiques, les siennes (même
 * en attente), et pour l'orga/l'admin les photos proposées à valider.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const t = await loadTournament(params.id);
  if (!t) return new Response("Not found", { status: 404 });
  const session = await auth();
  const playerId = session?.user?.playerId ?? null;
  const isAdmin = session?.user?.role === "ADMIN";
  const phase = galleryPhase(t);

  const [photos, mine, participant, moderator] = await Promise.all([
    prisma.tournamentPhoto.findMany({ where: { tournamentId: t.id, ...visiblePhotoWhere }, orderBy: { createdAt: "asc" }, select: galleryPhotoSelect }),
    playerId
      ? prisma.tournamentPhoto.findMany({ where: { tournamentId: t.id, authorId: playerId }, orderBy: { createdAt: "asc" }, select: galleryPhotoSelect })
      : Promise.resolve([]),
    playerId ? isGalleryParticipant(t.id, playerId) : Promise.resolve(false),
    isAdmin ? Promise.resolve(true) : getOrgaPlayerId(t.id).then((id) => !!id),
  ]);
  const pending = moderator
    ? await prisma.tournamentPhoto.findMany({ where: { tournamentId: t.id, pendingApproval: true, hiddenAt: null }, orderBy: { createdAt: "asc" }, select: galleryPhotoSelect })
    : [];

  return Response.json({
    phase,
    opensAt: galleryOpensAt(t).toISOString(),
    endsAt: tournamentEndsAt(t).toISOString(),
    closesAt: galleryClosesAt(t).toISOString(),
    timezone: tournamentTimezone(t),
    perPlayer: PHOTOS_PER_PLAYER,
    loggedIn: !!playerId,
    // Participant / orga : publication directe. Sinon : proposition à valider.
    participant,
    canAdd: !!playerId && phase === "open",
    remaining: Math.max(0, PHOTOS_PER_PLAYER - mine.length),
    moderator,
    photos: photos.map(toGalleryPhoto),
    mine: mine.map(toGalleryPhoto),
    pending: pending.map(toGalleryPhoto),
    pinned: t.photosPinnedAt !== null,
  });
}

const addSchema = z.object({ imagePath: z.string().url().max(500) });

/**
 * Ajouter une photo (5 max par personne, galerie ouverte). Participant ou orga :
 * publiée. Personne extérieure : en attente, l'orga est prévenue.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!playerId) return Response.json({ error: "login_required" }, { status: 401 });
  const t = await loadTournament(params.id);
  if (!t) return new Response("Not found", { status: 404 });

  const phase = galleryPhase(t);
  if (phase !== "open") return Response.json({ error: phase === "before" ? "not_started" : "closed" }, { status: 409 });

  const parsed = addSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  // L'image doit venir de notre bucket (upload via /api/upload).
  const bucket = process.env.R2_PUBLIC_URL;
  if (bucket && !parsed.data.imagePath.startsWith(`${bucket}/tournament-photos/`)) {
    return Response.json({ error: "invalid_image" }, { status: 400 });
  }

  const used = await prisma.tournamentPhoto.count({ where: { tournamentId: t.id, authorId: playerId } });
  if (used >= PHOTOS_PER_PLAYER) return Response.json({ error: "no_shots_left" }, { status: 409 });

  const direct = session.user?.role === "ADMIN" || (await isGalleryParticipant(t.id, playerId));
  const photo = await prisma.tournamentPhoto.create({
    data: { tournamentId: t.id, authorId: playerId, imagePath: parsed.data.imagePath, pendingApproval: !direct },
    select: { id: true },
  });
  if (!direct) await notifyPhotoRequest(t.id);
  return Response.json({ id: photo.id, pending: !direct, remaining: PHOTOS_PER_PLAYER - used - 1 });
}

const patchSchema = z.object({ pinned: z.boolean() });

/** Épingler la galerie « à la une » sur la home (admin). */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") return new Response("Réservé aux administrateurs", { status: 403 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  await prisma.tournament.update({
    where: { id: params.id },
    data: { photosPinnedAt: parsed.data.pinned ? new Date() : null },
  });
  return Response.json({ ok: true });
}
