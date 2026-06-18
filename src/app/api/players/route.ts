import { prisma } from "@/lib/db";
import { z } from "zod";
import { toSlug } from "@/lib/utils";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const search = searchParams.get("search");
  const excludeTournamentId = searchParams.get("excludeTournamentId");
  const hasAccount = searchParams.get("hasAccount") === "true";
  const country = searchParams.get("country");
  const continent = searchParams.get("continent");
  const browse = searchParams.get("browse") === "true";

  // Get player IDs already in a team for this tournament
  let excludedPlayerIds: string[] = [];
  if (excludeTournamentId) {
    const teamPlayers = await prisma.teamPlayer.findMany({
      where: { team: { tournamentId: excludeTournamentId } },
      select: { playerId: true }
    });
    excludedPlayerIds = teamPlayers.map((tp) => tp.playerId);
  }

  // By default only return ACTIVE players (real accounts).
  // Pass status=PENDING or status=all only for admin use cases.
  const statusFilter =
    status === "all" ? undefined
    : status === "PENDING" || status === "REJECTED" ? { status: status as "PENDING" | "REJECTED" }
    : { status: "ACTIVE" as const };

  // For browse mode, filter by country/continent via club membership
  let continentPlayerIds: string[] | undefined;
  if (continent) {
    const clubMembers = await prisma.clubMember.findMany({
      where: { club: { continentCode: continent, approved: true }, status: "MEMBER" },
      select: { playerId: true },
    });
    continentPlayerIds = clubMembers.map((m) => m.playerId);
  }

  const whereClause = {
    ...statusFilter,
    ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
    ...(excludedPlayerIds.length > 0 ? { id: { notIn: excludedPlayerIds } } : {}),
    ...(hasAccount ? { account: { email: { not: "" } } } : {}),
    ...(country ? { country: { equals: country, mode: "insensitive" as const } } : {}),
    ...(continentPlayerIds !== undefined ? { id: { in: continentPlayerIds } } : {}),
  };

  if (browse) {
    const players = await prisma.player.findMany({
      where: whereClause,
      select: {
        id: true, name: true, country: true, city: true, slug: true,
        photoPath: true, badges: true, pinnedBadges: true,
        startYear: true, hand: true, gender: true, showGender: true,
        clubLogoPath: true,
        clubMemberships: {
          where: { status: "MEMBER" },
          select: { club: { select: { name: true } } },
          take: 1,
        },
      },
    });
    // Full Fisher-Yates shuffle across all results
    for (let i = players.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [players[i], players[j]] = [players[j], players[i]];
    }
    const result = players.map(({ clubMemberships, ...p }) => ({
      ...p,
      clubName: clubMemberships[0]?.club.name ?? null,
    }));
    return Response.json(result);
  }

  const players = await prisma.player.findMany({
    where: whereClause,
    orderBy: { name: "asc" },
    take: search ? 10 : undefined,
    include: status ? { account: { select: { email: true } } } : undefined,
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
      status: "ACTIVE",
      badges: []
    }
  });

  return Response.json(created);
}
