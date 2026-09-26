import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { getOrgaPlayerId } from "@/lib/orga-auth";
import { notifyPhotoDecision } from "@/lib/tournament-photos";
import { apiMsg } from "@/lib/api-messages";

const schema = z.object({
  photoIds: z.array(z.string().min(1)).min(1).max(100),
  approve: z.boolean(),
});

/**
 * L'orga (ou l'admin) accepte ou refuse des photos proposées par des personnes
 * extérieures. Accepter = publier ; refuser = supprimer (le crédit est rendu).
 * Chaque auteur reçoit une seule notif récapitulative.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";
  if (!isAdmin && !(await getOrgaPlayerId(params.id))) return new Response(apiMsg("not_authorized"), { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });

  const photos = await prisma.tournamentPhoto.findMany({
    where: { id: { in: parsed.data.photoIds }, tournamentId: params.id, pendingApproval: true },
    select: { id: true, authorId: true },
  });
  if (photos.length === 0) return Response.json({ ok: true, count: 0 });
  const ids = photos.map((p) => p.id);
  if (parsed.data.approve) {
    await prisma.tournamentPhoto.updateMany({ where: { id: { in: ids } }, data: { pendingApproval: false } });
  } else {
    await prisma.tournamentPhoto.deleteMany({ where: { id: { in: ids } } });
  }

  const t = await prisma.tournament.findUnique({ where: { id: params.id }, select: { id: true, slug: true, name: true } });
  if (t) {
    const byAuthor = new Map<string, number>();
    for (const p of photos) byAuthor.set(p.authorId, (byAuthor.get(p.authorId) ?? 0) + 1);
    for (const [authorId, n] of byAuthor) {
      await notifyPhotoDecision(authorId, t, parsed.data.approve ? n : 0, parsed.data.approve ? 0 : n);
    }
  }
  return Response.json({ ok: true, count: photos.length });
}
