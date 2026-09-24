import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { canManagePoll } from "@/lib/poll-access";
import { createNotification } from "@/lib/notify";

// Tous les champs sont optionnels : le PATCH ne modifie que ce qui est fourni
// (ex: juste { status: "OPEN" } pour ouvrir, ou juste { showResults: "HIDDEN" }).
const patchSchema = z.object({
  status: z.enum(["DRAFT", "OPEN", "CLOSED"]).optional(),
  openAt: z.string().datetime().nullable().optional(),
  closeAt: z.string().datetime().nullable().optional(),
  showResults: z.enum(["IMMEDIATE", "AT_DATE", "AT_CLOSE", "HIDDEN"]).optional(),
  resultsAt: z.string().datetime().nullable().optional(),
  // Modération — admin uniquement.
  blocked: z.boolean().optional(),
  blockedReason: z.string().max(500).nullable().optional(),
  dismissReports: z.boolean().optional(),
});

/** Modifie un sondage — son créateur ou un admin (la modération reste admin). */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const poll = await prisma.poll.findUnique({
    where: { id: params.id },
    select: { id: true, question: true, createdById: true, blockedAt: true },
  });
  if (!poll) return new Response("Sondage introuvable", { status: 404 });
  if (!canManagePoll(poll, session)) return new Response("Non autorisé", { status: 403 });
  const isAdmin = session?.user?.role === "ADMIN";

  const json = await request.json();
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  const touchesModeration = d.blocked !== undefined || d.blockedReason !== undefined || d.dismissReports !== undefined;
  if (touchesModeration && !isAdmin) return new Response("Réservé aux administrateurs", { status: 403 });

  // Un sondage bloqué est gelé pour son créateur : seul l'admin peut le débloquer.
  if (poll.blockedAt && !isAdmin) return Response.json({ error: "blocked" }, { status: 409 });

  const willBlock = d.blocked === true && !poll.blockedAt;

  await prisma.poll.update({
    where: { id: params.id },
    data: {
      ...(d.status !== undefined ? { status: d.status } : {}),
      ...(d.openAt !== undefined ? { openAt: d.openAt ? new Date(d.openAt) : null } : {}),
      ...(d.closeAt !== undefined ? { closeAt: d.closeAt ? new Date(d.closeAt) : null } : {}),
      ...(d.showResults !== undefined ? { showResults: d.showResults } : {}),
      ...(d.resultsAt !== undefined ? { resultsAt: d.resultsAt ? new Date(d.resultsAt) : null } : {}),
      ...(d.blocked === true ? { blockedAt: poll.blockedAt ?? new Date(), blockedReason: d.blockedReason?.trim() || null } : {}),
      ...(d.blocked === false ? { blockedAt: null, blockedReason: null } : {}),
    },
  });

  if (d.dismissReports) {
    await prisma.pollReport.deleteMany({ where: { pollId: params.id } });
  }

  // Prévient le créateur (sauf si l'admin bloque son propre sondage).
  if (willBlock && poll.createdById && poll.createdById !== session?.user?.playerId) {
    await createNotification(poll.createdById, "POLL_BLOCKED", {
      pollId: poll.id,
      pollQuestion: poll.question.slice(0, 120),
      reason: d.blockedReason?.trim() || "",
    });
  }

  return Response.json({ ok: true });
}

/** Suppression d'un sondage — son créateur ou un admin (cascade sur bulletins/émargement). */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const poll = await prisma.poll.findUnique({
    where: { id: params.id },
    select: { createdById: true, blockedAt: true },
  });
  if (!poll) return Response.json({ ok: true });
  if (!canManagePoll(poll, session)) return new Response("Non autorisé", { status: 403 });
  // Un créateur ne peut pas effacer les traces d'un sondage bloqué (preuve de
  // modération) : seul l'admin peut le supprimer.
  if (poll.blockedAt && session?.user?.role !== "ADMIN") {
    return Response.json({ error: "blocked" }, { status: 409 });
  }
  await prisma.poll.delete({ where: { id: params.id } }).catch(() => {});
  return Response.json({ ok: true });
}
