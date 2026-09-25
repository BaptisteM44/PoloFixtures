import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import {
  PHOTOS_PER_PLAYER, isRollParticipant, revealAt, rollPhase, rollTournamentSelect, shootingOpensAt, type RollPhoto,
} from "@/lib/tournament-photos";
import { tournamentTimezone } from "@/lib/timezone";

export const dynamic = "force-dynamic";

const photoSelect = {
  id: true, imagePath: true, createdAt: true,
  author: { select: { id: true, name: true, slug: true, photoPath: true } },
} as const;

async function loadTournament(id: string) {
  return prisma.tournament.findUnique({
    where: { id },
    select: { id: true, ...rollTournamentSelect, photosPinnedAt: true, hidden: true, approved: true },
  });
}

/**
 * État de la pellicule pour le visiteur. Avant la révélation : seulement le
 * nombre total de photos et SES propres photos. Après : toute la pellicule.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const t = await loadTournament(params.id);
  if (!t) return new Response("Not found", { status: 404 });
  const session = await auth();
  const playerId = session?.user?.playerId ?? null;
  const phase = rollPhase(t);

  const [total, mine, participant] = await Promise.all([
    prisma.tournamentPhoto.count({ where: { tournamentId: t.id, hiddenAt: null } }),
    playerId
      ? prisma.tournamentPhoto.findMany({ where: { tournamentId: t.id, authorId: playerId }, orderBy: { createdAt: "asc" }, select: photoSelect })
      : Promise.resolve([]),
    playerId && phase !== "revealed" ? isRollParticipant(t.id, playerId) : Promise.resolve(false),
  ]);
  const photos = phase === "revealed"
    ? await prisma.tournamentPhoto.findMany({ where: { tournamentId: t.id, hiddenAt: null }, orderBy: { createdAt: "asc" }, select: photoSelect })
    : [];
  const iso = (p: { createdAt: Date }) => ({ ...p, createdAt: p.createdAt.toISOString() });

  return Response.json({
    phase,
    opensAt: shootingOpensAt(t).toISOString(),
    revealAt: revealAt(t).toISOString(),
    timezone: tournamentTimezone(t),
    total,
    perPlayer: PHOTOS_PER_PLAYER,
    // Participant : « tu auras 5 photos » avant le tournoi, l'appareil pendant.
    participant,
    canShoot: participant && phase === "shooting",
    remaining: Math.max(0, PHOTOS_PER_PLAYER - mine.length),
    mine: mine.map(iso) as RollPhoto[],
    photos: photos.map(iso) as RollPhoto[],
    pinned: t.photosPinnedAt !== null,
  });
}

const shootSchema = z.object({ imagePath: z.string().url().max(500) });

/** Prendre une photo (participant, pendant le tournoi, 5 max). */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!playerId) return Response.json({ error: "login_required" }, { status: 401 });
  const t = await loadTournament(params.id);
  if (!t) return new Response("Not found", { status: 404 });

  const phase = rollPhase(t);
  if (phase !== "shooting") return Response.json({ error: phase === "before" ? "not_started" : "revealed" }, { status: 409 });
  if (!(await isRollParticipant(t.id, playerId))) return Response.json({ error: "not_participant" }, { status: 403 });

  const parsed = shootSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  // L'image doit venir de notre bucket (upload via /api/upload).
  const bucket = process.env.R2_PUBLIC_URL;
  if (bucket && !parsed.data.imagePath.startsWith(`${bucket}/tournament-photos/`)) {
    return Response.json({ error: "invalid_image" }, { status: 400 });
  }

  const used = await prisma.tournamentPhoto.count({ where: { tournamentId: t.id, authorId: playerId } });
  if (used >= PHOTOS_PER_PLAYER) return Response.json({ error: "no_shots_left" }, { status: 409 });

  const photo = await prisma.tournamentPhoto.create({
    data: { tournamentId: t.id, authorId: playerId, imagePath: parsed.data.imagePath },
    select: { id: true },
  });
  return Response.json({ id: photo.id, remaining: PHOTOS_PER_PLAYER - used - 1 });
}

const patchSchema = z.object({ pinned: z.boolean() });

/** Épingler la pellicule « à la une » sur la home (admin). */
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
