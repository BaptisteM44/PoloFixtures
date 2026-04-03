import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = params;
    const body = await req.json();
    const { testMode } = body;

    // Verify user is creator or admin
    const tournament = await prisma.tournament.findUnique({
      where: { id },
      select: { id: true, creatorId: true, testMode: true },
    });

    if (!tournament) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    const isCreator = tournament.creatorId === session.user.id;
    const isAdmin = (session.user as any).isAdmin;

    if (!isCreator && !isAdmin) {
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
