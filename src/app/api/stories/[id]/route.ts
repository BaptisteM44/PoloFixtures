import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const patchSchema = z.object({
  // Épingler « à la une » sous ce titre (null = désépingler).
  highlightTitle: z.string().trim().min(1).max(40).nullable().optional(),
  hidden: z.boolean().optional(),
});

/** Modération (admin) : épingler à la une, masquer / réafficher. */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") return new Response("Réservé aux administrateurs", { status: 403 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  const d = parsed.data;
  const story = await prisma.story.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!story) return new Response("Story introuvable", { status: 404 });

  await prisma.story.update({
    where: { id: params.id },
    data: {
      ...(d.highlightTitle !== undefined
        ? { highlightTitle: d.highlightTitle, pinnedAt: d.highlightTitle ? new Date() : null }
        : {}),
      // Réafficher remet aussi le compteur de signalements à zéro (examinée).
      ...(d.hidden === true ? { hiddenAt: new Date() } : {}),
      ...(d.hidden === false ? { hiddenAt: null, reportCount: 0 } : {}),
    },
  });
  return Response.json({ ok: true });
}

/** Suppression : son auteur ou un admin. */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const playerId = session?.user?.playerId;
  const story = await prisma.story.findUnique({ where: { id: params.id }, select: { authorId: true } });
  if (!story) return Response.json({ ok: true });
  if (session?.user?.role !== "ADMIN" && story.authorId !== playerId) {
    return new Response("Non autorisé", { status: 403 });
  }
  await prisma.story.delete({ where: { id: params.id } }).catch(() => {});
  return Response.json({ ok: true });
}
