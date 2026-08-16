import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

// Tous les champs sont optionnels : le PATCH ne modifie que ce qui est fourni
// (ex: juste { status: "OPEN" } pour ouvrir, ou juste { showResults: "HIDDEN" }).
const patchSchema = z.object({
  status: z.enum(["DRAFT", "OPEN", "CLOSED"]).optional(),
  openAt: z.string().datetime().nullable().optional(),
  closeAt: z.string().datetime().nullable().optional(),
  showResults: z.enum(["IMMEDIATE", "AT_DATE", "AT_CLOSE", "HIDDEN"]).optional(),
  resultsAt: z.string().datetime().nullable().optional(),
});

/** Modifie un sondage (statut, dates, visibilité des résultats) — ADMIN uniquement. */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return new Response("Réservé aux administrateurs", { status: 403 });
  }

  const json = await request.json();
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  const poll = await prisma.poll.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!poll) return new Response("Sondage introuvable", { status: 404 });

  await prisma.poll.update({
    where: { id: params.id },
    data: {
      ...(d.status !== undefined ? { status: d.status } : {}),
      ...(d.openAt !== undefined ? { openAt: d.openAt ? new Date(d.openAt) : null } : {}),
      ...(d.closeAt !== undefined ? { closeAt: d.closeAt ? new Date(d.closeAt) : null } : {}),
      ...(d.showResults !== undefined ? { showResults: d.showResults } : {}),
      ...(d.resultsAt !== undefined ? { resultsAt: d.resultsAt ? new Date(d.resultsAt) : null } : {}),
    },
  });

  return Response.json({ ok: true });
}

/** Suppression d'un sondage — ADMIN uniquement (cascade sur bulletins/émargement). */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return new Response("Réservé aux administrateurs", { status: 403 });
  }
  await prisma.poll.delete({ where: { id: params.id } }).catch(() => {});
  return Response.json({ ok: true });
}
