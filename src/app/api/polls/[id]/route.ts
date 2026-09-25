import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { canManagePoll } from "@/lib/poll-access";
import { createNotification } from "@/lib/notify";
import { applyTargeting, narrows, openBlocker } from "@/lib/poll-targeting";
import { notifyPollAudience, sweepPolls } from "@/lib/poll-notify";

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
  // Ciblage (les trois listes vont ensemble) + visibilité publique.
  eligibleClubIds: z.array(z.string().min(1)).max(50).optional(),
  eligibleCountries: z.array(z.string().min(1).max(80)).max(100).optional(),
  eligibleContinents: z.array(z.enum(["EU", "NA", "SA", "AS", "AF", "OC"])).max(6).optional(),
  visibleToAll: z.boolean().optional(),
});

/** Modifie un sondage — son créateur ou un admin (la modération reste admin). */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const poll = await prisma.poll.findUnique({
    where: { id: params.id },
    select: {
      id: true, question: true, createdById: true, blockedAt: true, status: true,
      eligibleClubIds: true, eligibleCountries: true, eligibleContinents: true,
      allowGuests: true,
    },
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
  const willUnblock = d.blocked === false && !!poll.blockedAt;
  const playerId = session?.user?.playerId ?? null;

  // Ciblage : sur un sondage déjà ouvert/fermé, on élargit seulement.
  const touchesTargeting = d.eligibleClubIds !== undefined || d.eligibleCountries !== undefined || d.eligibleContinents !== undefined;
  const requested = {
    clubIds: d.eligibleClubIds ?? poll.eligibleClubIds,
    countries: d.eligibleCountries ?? poll.eligibleCountries,
    continents: d.eligibleContinents ?? poll.eligibleContinents,
  };
  if (touchesTargeting && !isAdmin && poll.status !== "DRAFT") {
    const current = { clubIds: poll.eligibleClubIds, countries: poll.eligibleCountries, continents: poll.eligibleContinents };
    if (narrows(current, requested)) return Response.json({ error: "cannot_narrow" }, { status: 409 });
  }
  if (touchesTargeting && playerId) {
    const validClubs = requested.clubIds.length > 0
      ? (await prisma.club.findMany({ where: { id: { in: requested.clubIds } }, select: { id: true } })).map((c) => c.id)
      : [];
    const { effective, requests } = await applyTargeting(
      poll, { ...requested, clubIds: validClubs },
      { playerId, isAdmin, name: session?.user?.name },
    );
    // Un invité ne peut pas prouver son club/pays : ciblé (ou en passe de
    // l'être) ⇒ vote réservé aux inscrits.
    const restricted = effective.clubIds.length + effective.countries.length + effective.continents.length > 0
      || requests.some((r) => r.kind === "club" || !r.global);
    if (restricted && poll.allowGuests) {
      await prisma.poll.update({ where: { id: poll.id }, data: { allowGuests: false, guestFields: [] } });
    }
  }

  // Un brouillon ne s'ouvre qu'une fois ses demandes de ciblage acceptées.
  if (d.status === "OPEN" && poll.status === "DRAFT") {
    const blocker = await openBlocker(poll.id);
    if (blocker) return Response.json({ error: blocker }, { status: 409 });
  }

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
      ...(d.visibleToAll !== undefined ? { visibleToAll: d.visibleToAll } : {}),
    },
  });

  const payload = { pollId: poll.id, pollQuestion: poll.question.slice(0, 120) };

  // Retour aux signaleurs : bloqué (signalement retenu) ou classé sans suite.
  if (willBlock || d.dismissReports) {
    const reports = await prisma.pollReport.findMany({ where: { pollId: poll.id }, select: { reporterId: true } });
    for (const r of reports) {
      await createNotification(r.reporterId, "POLL_REPORT_HANDLED", { ...payload, outcome: willBlock ? "blocked" : "dismissed" });
    }
  }
  if (d.dismissReports) {
    await prisma.pollReport.deleteMany({ where: { pollId: params.id } });
  }

  // Prévient le créateur (sauf si l'admin bloque son propre sondage).
  const creatorIsOther = poll.createdById && poll.createdById !== playerId;
  if (willBlock && creatorIsOther) {
    await createNotification(poll.createdById!, "POLL_BLOCKED", { ...payload, reason: d.blockedReason?.trim() || "" });
  }
  if (willUnblock && creatorIsOther) {
    await createNotification(poll.createdById!, "POLL_UNBLOCKED", payload);
  }

  // Notifs dépendant de l'état : ouverture (public visé), nouveaux concernés
  // après élargissement, « résultats dispo » à la fermeture…
  await sweepPolls({ pollId: poll.id });
  if (touchesTargeting) await notifyPollAudience(poll.id);

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
