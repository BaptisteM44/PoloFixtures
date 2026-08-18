import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

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
  allowGuests: z.boolean().optional().default(true),
  guestFields: z.array(guestFieldSchema).max(20).optional().default([]),
  openAt: z.string().datetime().optional().nullable(),
  closeAt: z.string().datetime().optional().nullable(),
  showResults: z.enum(["IMMEDIATE", "AT_DATE", "AT_CLOSE", "HIDDEN"]).optional().default("IMMEDIATE"),
  resultsAt: z.string().datetime().optional().nullable(),
});

/** Création d'un sondage — ADMIN uniquement. */
export async function POST(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return new Response("Réservé aux administrateurs", { status: 403 });
  }

  const json = await request.json();
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  const poll = await prisma.poll.create({
    data: {
      question: d.question,
      description: d.description ?? null,
      options: d.options,
      multipleChoice: d.multipleChoice,
      allowGuests: d.allowGuests,
      guestFields: d.guestFields,
      openAt: d.openAt ? new Date(d.openAt) : null,
      closeAt: d.closeAt ? new Date(d.closeAt) : null,
      showResults: d.showResults,
      resultsAt: d.resultsAt ? new Date(d.resultsAt) : null,
      createdById: session.user.playerId ?? null,
      status: "DRAFT",
    },
    select: { id: true },
  });

  return Response.json({ id: poll.id });
}

/** Liste des sondages — ADMIN uniquement (avec compteurs agrégés). */
export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return new Response("Réservé aux administrateurs", { status: 403 });
  }

  const polls = await prisma.poll.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true, question: true, status: true, options: true,
      allowGuests: true, multipleChoice: true, openAt: true, closeAt: true,
      showResults: true, resultsAt: true,
      createdAt: true,
      _count: { select: { ballots: true, voters: true } },
    },
  });

  return Response.json({ polls });
}
