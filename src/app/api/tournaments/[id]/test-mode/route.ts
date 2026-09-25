import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { notifyAllAdmins } from "@/lib/notify";

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
    const { testMode, hidden } = body;

    const playerId = session.user.playerId;
    const role = session.user.role;

    // Verify user is creator, admin, or orga for this tournament
    const tournament = await prisma.tournament.findUnique({
      where: { id },
      select: {
        id: true, creatorId: true, testMode: true, hidden: true,
        slug: true, name: true, city: true, country: true, submissionStatus: true, createdViaSandbox: true,
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

    const updateData: { testMode?: boolean; hidden?: boolean } = {};
    if (typeof testMode === "boolean") updateData.testMode = testMode;
    if (typeof hidden === "boolean") updateData.hidden = hidden;

    // Update testMode and/or hidden
    const updated = await prisma.tournament.update({
      where: { id },
      data: updateData,
      select: { id: true, testMode: true, hidden: true },
    });

    // Un tournoi en attente de validation qui passe en test sort de la file
    // admin : on retire la notif « à valider ». S'il redevient réel, il y
    // retourne et les admins sont prévenus.
    const pending = tournament.submissionStatus === "PENDING" && !tournament.createdViaSandbox;
    if (pending && typeof testMode === "boolean" && testMode !== tournament.testMode) {
      if (testMode) {
        await prisma.notification.deleteMany({
          where: { type: "TOURNAMENT_NEEDS_APPROVAL", payload: { path: ["tournamentId"], equals: id } },
        });
      } else {
        notifyAllAdmins("TOURNAMENT_NEEDS_APPROVAL", {
          tournamentId: id,
          tournamentSlug: tournament.slug ?? "",
          tournamentName: tournament.name,
          city: tournament.city,
          country: tournament.country,
        }).catch(() => {});
      }
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error toggling test mode:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
