import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { hasAtLeastRole } from "@/lib/rbac";
import { z } from "zod";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: params.id },
    include: {
      sponsors: true,
      teams: {
        include: {
          players: {
            include: {
              player: true
            }
          }
        }
      },
      pools: {
        include: {
          teams: { include: { team: true } }
        }
      },
      matches: {
        include: {
          teamA: true,
          teamB: true,
          events: true
        },
        orderBy: { startAt: "asc" }
      }
    }
  });

  if (!tournament) return new Response("Not found", { status: 404 });
  return Response.json(tournament);
}

const updateSchema = z.object({
  name: z.string().min(2),
  continentCode: z.string().min(2),
  region: z.string().optional().nullable(),
  country: z.string().min(2),
  city: z.string().min(1),
  dateStart: z.string(),
  dateEnd: z.string(),
  format: z.string(),
  gameDurationMin: z.number(),
  maxTeams: z.number(),
  courtsCount: z.number(),
  registrationFeePerTeam: z.number(),
  registrationFeeCurrency: z.string(),
  contactEmail: z.string().email(),
  registrationStart: z.string().optional().nullable(),
  registrationEnd: z.string().optional().nullable(),
  fridayWelcomeName: z.string().optional().nullable(),
  fridayWelcomeAddress: z.string().optional().nullable(),
  fridayWelcomeMapsUrl: z.string().optional().nullable(),
  saturdayEventName: z.string().optional().nullable(),
  saturdayEventAddress: z.string().optional().nullable(),
  saturdayEventMapsUrl: z.string().optional().nullable(),
  otherNotes: z.string().optional().nullable(),
  links: z.array(z.string()).default([]),
  bannerPath: z.string().optional().nullable(),
  streamYoutubeUrl: z.string().optional().nullable(),
  saturdayFormat: z.enum(["ALL_DAY", "SPLIT_POOLS"]),
  sundayFormat: z.enum(["SE", "DE"]),
  status: z.enum(["UPCOMING", "LIVE", "COMPLETED"]),
  locked: z.boolean()
});

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.role || !hasAtLeastRole(session.user.role, "ORGA")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const tournament = await prisma.tournament.findUnique({ where: { id: params.id } });
  if (!tournament) return new Response("Not found", { status: 404 });

  const json = await request.json();
  const parsed = updateSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const structuralFields = ["format", "maxTeams", "courtsCount", "saturdayFormat", "sundayFormat"] as const;
  if (tournament.locked) {
    for (const field of structuralFields) {
      if ((data as Record<string, unknown>)[field] !== (tournament as Record<string, unknown>)[field]) {
        return Response.json({ error: `${field} cannot be changed when locked` }, { status: 400 });
      }
    }
  }

  const updated = await prisma.tournament.update({
    where: { id: params.id },
    data: {
      ...data,
      dateStart: new Date(data.dateStart),
      dateEnd: new Date(data.dateEnd),
      registrationStart: data.registrationStart ? new Date(data.registrationStart) : null,
      registrationEnd: data.registrationEnd ? new Date(data.registrationEnd) : null
    }
  });

  return Response.json(updated);
}
