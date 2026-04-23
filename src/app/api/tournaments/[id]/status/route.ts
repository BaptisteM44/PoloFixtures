import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = params;
  const { status } = await req.json();

  if (!["UPCOMING", "LIVE", "COMPLETED"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const playerId = session.user.playerId;
  const role = session.user.role;

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    select: { id: true, creatorId: true, coOrganizers: { select: { playerId: true } } },
  });
  if (!tournament) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isAdmin = role === "ADMIN";
  const isOrgaForThis = role === "ORGA" && session.user.tournamentId === id;
  const isCreator = !!playerId && tournament.creatorId === playerId;
  const isCoOrga = !!playerId && tournament.coOrganizers.some((co) => co.playerId === playerId);

  if (!isAdmin && !isOrgaForThis && !isCreator && !isCoOrga) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updated = await prisma.tournament.update({
    where: { id },
    data: { status },
    select: { id: true, status: true },
  });

  return NextResponse.json(updated);
}
