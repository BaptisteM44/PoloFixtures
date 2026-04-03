import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = params;
    const body = await req.json();
    const { testMode } = body;

    const playerId = session.user.playerId;
    const role = session.user.role;

    // Verify user is creator, admin, or orga for this tournament
    const tournament = await prisma.tournament.findUnique({
      where: { id },
      select: {
        id: true, creatorId: true, testMode: true,
        coOrganizers: { select: { playerId: true } },
      },
    });

    if (!tournament) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    const isAdmin = role === "ADMIN";
    const isOrgaForThis = role === "ORGA" && session.user.tournamentId === id;
    const isCreator = !!playerId && tournament.creatorId === playerId;
    const isCoOrga = !!playerId && tournament.coOrganizers.some((co) => co.playerId === playerId);

    if (!isAdmin && !isOrgaForThis && !isCreator && !isCoOrga) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Update testMode
    const updated = await prisma.tournament.update({
      where: { id },
      data: { testMode: typeof testMode === "boolean" ? testMode : !tournament.testMode },
      select: { id: true, testMode: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error toggling test mode:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
