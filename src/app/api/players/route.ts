import { prisma } from "@/lib/db";
import { z } from "zod";
import { toSlug } from "@/lib/utils";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const search = searchParams.get("search");
  const excludeTournamentId = searchParams.get("excludeTournamentId");

  // Get player IDs already in a team for this tournament
  let excludedPlayerIds: string[] = [];
  if (excludeTournamentId) {
    const teamPlayers = await prisma.teamPlayer.findMany({
      where: { team: { tournamentId: excludeTournamentId } },
      select: { playerId: true }
    });
    excludedPlayerIds = teamPlayers.map((tp) => tp.playerId);
  }

  const players = await prisma.player.findMany({
    where: {
      ...(status ? { status: status as "ACTIVE" | "PENDING" | "REJECTED" } : {}),
      ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
      ...(excludedPlayerIds.length > 0 ? { id: { notIn: excludedPlayerIds } } : {})
    },
    orderBy: { name: "asc" },
    take: search ? 10 : undefined
  });
  return Response.json(players);
}

const createSchema = z.object({
  name: z.string().min(2),
  country: z.string().min(2),
  city: z.string().optional().nullable(),
  photoPath: z.string().optional().nullable()
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const base = toSlug(parsed.data.name);
  let slug = base;
  let i = 2;
  while (await prisma.player.findUnique({ where: { slug } })) {
    slug = `${base}-${i++}`;
  }

  const created = await prisma.player.create({
    data: {
      ...parsed.data,
      slug,
      status: "PENDING",
      badges: []
    }
  });

  return Response.json(created);
}
