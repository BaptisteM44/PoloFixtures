import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasAtLeastRole } from "@/lib/rbac";

// GET — réponses au questionnaire d'une inscription individuelle (orga uniquement)
export async function GET(_req: NextRequest, { params }: { params: { entryId: string } }) {
  const session = await auth();
  const playerId = session?.user?.playerId;
  const role = session?.user?.role;

  const entry = await prisma.tournamentSoloEntry.findUnique({
    where: { id: params.entryId },
    select: { tournament: { select: { creatorId: true, coOrganizers: { select: { playerId: true } } } } },
  });
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOrga =
    (role && hasAtLeastRole(role, "ADMIN")) ||
    entry.tournament.creatorId === playerId ||
    entry.tournament.coOrganizers.some((co) => co.playerId === playerId);

  if (!isOrga) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const answers = await prisma.registrationAnswer.findMany({
    where: { soloEntryId: params.entryId },
    include: { field: { select: { label: true, target: true } } },
    orderBy: { field: { order: "asc" } },
  });

  return NextResponse.json(answers);
}
