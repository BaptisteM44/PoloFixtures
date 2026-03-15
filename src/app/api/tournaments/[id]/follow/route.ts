import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const playerId = (session?.user as any)?.playerId;
  if (!playerId) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const existing = await (prisma as any).tournamentFollow.findUnique({
    where: { playerId_tournamentId: { playerId, tournamentId: params.id } },
  });

  if (existing) {
    await (prisma as any).tournamentFollow.delete({ where: { id: existing.id } });
    return NextResponse.json({ following: false });
  } else {
    await (prisma as any).tournamentFollow.create({ data: { playerId, tournamentId: params.id } });
    return NextResponse.json({ following: true });
  }
}
