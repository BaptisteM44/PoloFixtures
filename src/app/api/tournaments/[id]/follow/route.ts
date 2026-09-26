import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { apiMsg } from "@/lib/api-messages";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!playerId) return NextResponse.json({ error: apiMsg("not_logged_in") }, { status: 401 });

  const tournament = await prisma.tournament.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!tournament) return NextResponse.json({ error: apiMsg("tournament_not_found") }, { status: 404 });

  const existing = await prisma.tournamentFollow.findUnique({
    where: { playerId_tournamentId: { playerId, tournamentId: params.id } },
  });

  if (existing) {
    await prisma.tournamentFollow.delete({ where: { id: existing.id } });
    return NextResponse.json({ following: false });
  } else {
    await prisma.tournamentFollow.create({ data: { playerId, tournamentId: params.id } });
    return NextResponse.json({ following: true });
  }
}
