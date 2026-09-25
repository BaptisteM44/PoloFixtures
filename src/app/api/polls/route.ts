import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { isRateLimited } from "@/lib/rate-limit";
import { applyTargeting, previewTargeting } from "@/lib/poll-targeting";

// Un champ du formulaire libre demandé aux guests. L'email n'est PAS ici : il
// est toujours demandé séparément (anti-fraude). type "club" affiche une liste
// déroulante des clubs existants + une option "Autre" avec champ libre.
const guestFieldSchema = z.object({
  key: z.string().min(1).max(40),
  label: z.string().min(1).max(120),
  required: z.boolean().optional().default(false),
  type: z.enum(["text", "club"]).optional().default("text"),
});

const createSchema = z.object({
  question: z.string().min(3).max(300),
  description: z.string().max(2000).optional().nullable(),
  options: z.array(z.string().min(1).max(120)).min(2).max(20),
  multipleChoice: z.boolean().optional().default(false),
  minChoices: z.number().int().min(1).max(20).optional().nullable(),
  maxChoices: z.number().int().min(1).max(20).optional().nullable(),
  allowComment: z.boolean().optional().default(false),
  allowGuests: z.boolean().optional().default(true),
  guestFields: z.array(guestFieldSchema).max(20).optional().default([]),
  openAt: z.string().datetime().optional().nullable(),
  closeAt: z.string().datetime().optional().nullable(),
  showResults: z.enum(["IMMEDIATE", "AT_DATE", "AT_CLOSE", "HIDDEN"]).optional().default("IMMEDIATE"),
  resultsAt: z.string().datetime().optional().nullable(),
  eligibleClubIds: z.array(z.string().min(1)).max(50).optional().default([]),
  eligibleCountries: z.array(z.string().min(1).max(80)).max(100).optional().default([]),
  eligibleContinents: z.array(z.enum(["EU", "NA", "SA", "AS", "AF", "OC"])).max(6).optional().default([]),
  visibleToAll: z.boolean().optional().default(false),
});

/**
 * Création d'un sondage — tout joueur inscrit (l'admin peut ensuite le bloquer).
 * Ses clubs et son pays sont ciblés d'office ; le reste part en validation.
 */
export async function POST(request: Request) {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!playerId) return new Response("Connexion requise", { status: 401 });
  const isAdmin = session?.user?.role === "ADMIN";

  // Anti-spam : 5 sondages par jour et par joueur (l'admin n'est pas limité).
  if (!isAdmin && isRateLimited(`poll-create:${playerId}`, 5, 24 * 60 * 60 * 1000)) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }

  const json = await request.json();
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  // Ne garde que des clubs qui existent (évite un ciblage vers un id inventé,
  // qui rendrait le sondage impossible à voter).
  const clubIds = d.eligibleClubIds.length > 0
    ? (await prisma.club.findMany({ where: { id: { in: d.eligibleClubIds } }, select: { id: true } })).map((c) => c.id)
    : [];
  const requested = { clubIds, countries: d.eligibleCountries, continents: d.eligibleContinents };
  // Un invité ne peut pas prouver son club/pays : dès qu'un ciblage est posé
  // (accordé ou demandé), seuls les inscrits votent.
  const preview = await previewTargeting(requested, playerId, isAdmin);
  const restricted = preview.effective.clubIds.length + preview.effective.countries.length + preview.effective.continents.length > 0
    || preview.requests.some((r) => r.kind === "club" || !r.global);

  const poll = await prisma.poll.create({
    data: {
      question: d.question,
      description: d.description ?? null,
      options: d.options,
      multipleChoice: d.multipleChoice,
      minChoices: d.multipleChoice ? (d.minChoices ?? null) : null,
      maxChoices: d.multipleChoice ? (d.maxChoices ?? null) : null,
      allowComment: d.allowComment,
      allowGuests: restricted ? false : d.allowGuests,
      guestFields: restricted ? [] : d.guestFields,
      openAt: d.openAt ? new Date(d.openAt) : null,
      closeAt: d.closeAt ? new Date(d.closeAt) : null,
      showResults: d.showResults,
      resultsAt: d.resultsAt ? new Date(d.resultsAt) : null,
      visibleToAll: d.visibleToAll,
      createdById: playerId,
      status: "DRAFT",
    },
    select: {
      id: true, question: true, status: true, createdById: true,
      eligibleClubIds: true, eligibleCountries: true, eligibleContinents: true,
    },
  });
  const { requests } = await applyTargeting(poll, requested, { playerId, isAdmin, name: session?.user?.name });

  return Response.json({ id: poll.id, pendingApprovals: requests.length });
}

/**
 * Liste de gestion des sondages.
 *  - admin : tous les sondages (avec créateur, blocage et signalements) ;
 *  - joueur : uniquement les siens. `?mine=1` force cette vue même pour un admin.
 */
export async function GET(request: Request) {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!playerId) return new Response("Connexion requise", { status: 401 });
  const isAdmin = session?.user?.role === "ADMIN";
  const mine = new URL(request.url).searchParams.get("mine") === "1";

  const polls = await prisma.poll.findMany({
    where: isAdmin && !mine ? {} : { createdById: playerId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, question: true, status: true, options: true,
      allowGuests: true, multipleChoice: true, openAt: true, closeAt: true,
      showResults: true, resultsAt: true, createdAt: true,
      eligibleClubIds: true, eligibleCountries: true, eligibleContinents: true,
      blockedAt: true, blockedReason: true, visibleToAll: true,
      approvals: {
        where: { status: { in: ["PENDING", "REJECTED"] } },
        select: { id: true, status: true, reason: true, countries: true, continents: true, global: true, club: { select: { name: true } } },
      },
      createdBy: { select: { id: true, name: true, slug: true } },
      _count: { select: { ballots: true, voters: true, reports: true } },
      // Le détail des signalements (qui, pourquoi) n'est montré qu'à l'admin.
      ...(isAdmin
        ? { reports: { select: { reason: true, createdAt: true, reporter: { select: { name: true, slug: true } } }, orderBy: { createdAt: "desc" as const } } }
        : {}),
    },
  });

  return Response.json({ polls, isAdmin });
}
