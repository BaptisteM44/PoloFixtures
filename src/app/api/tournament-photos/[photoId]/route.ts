import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { getOrgaPlayerId } from "@/lib/orga-auth";
import { rollPhase } from "@/lib/tournament-photos";

/**
 * Supprimer une photo : son auteur (à tout moment — ça lui rend le crédit
 * avant la révélation), l'orga du tournoi (après révélation, modération) ou
 * l'admin.
 */
export async function DELETE(_req: Request, { params }: { params: { photoId: string } }) {
  const session = await auth();
  const photo = await prisma.tournamentPhoto.findUnique({
    where: { id: params.photoId },
    select: { authorId: true, tournamentId: true, tournament: { select: { dateStart: true, dateEnd: true, timezone: true } } },
  });
  if (!photo) return Response.json({ ok: true });
  const isAuthor = !!session?.user?.playerId && session.user.playerId === photo.authorId;
  const isAdmin = session?.user?.role === "ADMIN";
  const isOrga = !isAuthor && !isAdmin && rollPhase(photo.tournament) === "revealed" && !!(await getOrgaPlayerId(photo.tournamentId));
  if (!isAuthor && !isAdmin && !isOrga) return new Response("Non autorisé", { status: 403 });
  await prisma.tournamentPhoto.delete({ where: { id: params.photoId } }).catch(() => {});
  return Response.json({ ok: true });
}

const patchSchema = z.object({ hidden: z.boolean() });

/** Masquer / réafficher (admin). Réafficher remet les signalements à zéro. */
export async function PATCH(request: Request, { params }: { params: { photoId: string } }) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") return new Response("Réservé aux administrateurs", { status: 403 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  await prisma.tournamentPhoto.update({
    where: { id: params.photoId },
    data: parsed.data.hidden ? { hiddenAt: new Date() } : { hiddenAt: null, reportCount: 0 },
  });
  return Response.json({ ok: true });
}
