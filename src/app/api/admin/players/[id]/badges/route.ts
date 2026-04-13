import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

// PATCH /api/admin/players/[id]/badges — ajoute ou retire des badges manuellement
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Interdit" }, { status: 403 });
  }

  const body = await req.json();
  const add: string[] = Array.isArray(body.add) ? body.add : [];
  const remove: string[] = Array.isArray(body.remove) ? body.remove : [];

  const player = await prisma.player.findUnique({
    where: { id: params.id },
    select: { badges: true },
  });
  if (!player) return NextResponse.json({ error: "Joueur introuvable" }, { status: 404 });

  const current = new Set<string>(player.badges as string[]);
  for (const b of add) current.add(b);
  for (const b of remove) current.delete(b);

  const updated = await prisma.player.update({
    where: { id: params.id },
    data: { badges: Array.from(current) },
    select: { badges: true },
  });

  return NextResponse.json({ badges: updated.badges });
}
