import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { z } from "zod";

export async function GET() {
  const tournaments = await prisma.tournament.findMany({
    where: { approved: true },
    include: {
      teams: true,
      matches: true
    },
    orderBy: { dateStart: "asc" }
  });

  return Response.json(tournaments);
}

const createSchema = z.object({
  name: z.string().min(2),
  continentCode: z.string().min(2),
  region: z.string().optional().nullable(),
  country: z.string().min(2),
  city: z.string().min(1),
  dateStart: z.string(),
  dateEnd: z.string(),
  format: z.string(),
  gameDurationMin: z.number().int().min(1).max(60),
  maxTeams: z.number().int().min(2).max(64),
  courtsCount: z.number().int().min(1).max(20),
  registrationFeePerTeam: z.number().min(0),
  registrationFeeCurrency: z.string().default("EUR"),
  contactEmail: z.string().email(),
  registrationStart: z.string().optional().nullable(),
  registrationEnd: z.string().optional().nullable(),
  saturdayFormat: z.enum(["ALL_DAY", "SPLIT_POOLS", "SWISS"]),
  sundayFormat: z.enum(["SE", "DE"]),
  accommodationAvailable: z.boolean().default(false),
  breakfastProvided: z.boolean().default(false),
  lunchProvided: z.boolean().default(false),
  dinnerProvided: z.boolean().default(false),
  coOrganizerIds: z.array(z.string()).optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.playerId) {
    return new Response("Connectez-vous pour créer un tournoi", { status: 401 });
  }

  const json = await request.json();
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { coOrganizerIds, ...data } = parsed.data;

  // Validate date logic
  const start = new Date(data.dateStart);
  const end = new Date(data.dateEnd);
  if (end < start) {
    return Response.json({ error: "La date de fin doit être après la date de début." }, { status: 400 });
  }
  if (data.registrationStart && data.registrationEnd) {
    const regStart = new Date(data.registrationStart);
    const regEnd = new Date(data.registrationEnd);
    if (regEnd < regStart) {
      return Response.json({ error: "La fin des inscriptions doit être après leur ouverture." }, { status: 400 });
    }
  }

  const created = await prisma.tournament.create({
    data: {
      ...data,
      dateStart: start,
      dateEnd: end,
      registrationStart: data.registrationStart ? new Date(data.registrationStart) : null,
      registrationEnd: data.registrationEnd ? new Date(data.registrationEnd) : null,
      links: [],
      status: "UPCOMING",
      locked: false,
      approved: false,
      submissionStatus: "PENDING",
      creatorId: session.user.playerId,
      ...(coOrganizerIds && coOrganizerIds.length > 0 ? {
        coOrganizers: {
          create: coOrganizerIds
            .filter((id) => id !== session.user!.playerId)
            .map((playerId) => ({ playerId }))
        }
      } : {})
    }
  });

  return Response.json(created);
}
