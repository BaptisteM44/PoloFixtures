import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasAtLeastRole } from "@/lib/rbac";

// GET — fetch registration answers for a team (orga only)
export async function GET(_req: NextRequest, { params }: { params: { teamId: string } }) {
  const session = await auth();
  const playerId = session?.user?.playerId;
  const role = session?.user?.role;

  const team = await prisma.team.findUnique({
    where: { id: params.teamId },
    select: { tournamentId: true, tournament: { select: { creatorId: true, coOrganizers: { select: { playerId: true } } } } },
  });
  if (!team) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOrga =
    (role && hasAtLeastRole(role, "ADMIN")) ||
    team.tournament.creatorId === playerId ||
    team.tournament.coOrganizers.some((co) => co.playerId === playerId);

  if (!isOrga) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const answers = await prisma.registrationAnswer.findMany({
    where: {
      OR: [
        { teamId: params.teamId },
        { teamPlayer: { teamId: params.teamId } },
      ],
    },
    include: {
      field: { select: { label: true, target: true } },
      teamPlayer: { select: { player: { select: { name: true } } } },
    },
    orderBy: { field: { order: "asc" } },
  });

  return NextResponse.json(answers);
}
