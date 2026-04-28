import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const voteSchema = z.object({
  vote: z.enum(["up", "meh", "down"]),
  comment: z.string().max(500).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await request.json();
  const parsed = voteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }

  const { vote, comment } = parsed.data;

  if (vote === "meh" && !comment?.trim()) {
    return NextResponse.json(
      { error: "Un commentaire est obligatoire pour ce type de vote" },
      { status: 400 }
    );
  }

  const itemExists = await prisma.communityItem.findUnique({
    where: { id: params.id },
    select: { id: true },
  });
  if (!itemExists) {
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  }

  const session = await auth();
  const playerId = session?.user?.playerId ?? null;

  if (playerId) {
    // Upsert pour les joueurs connectés (contrainte unique itemId+playerId)
    await prisma.communityVote.upsert({
      where: { itemId_playerId: { itemId: params.id, playerId } },
      create: { itemId: params.id, playerId, vote, comment: comment?.trim() ?? null },
      update: { vote, comment: vote === "meh" ? (comment?.trim() ?? null) : null },
    });
  } else {
    // Anonymes : pas de contrainte, on crée juste un vote
    await prisma.communityVote.create({
      data: {
        itemId: params.id,
        playerId: null,
        vote,
        comment: vote === "meh" ? (comment?.trim() ?? null) : null,
      },
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  const playerId = session?.user?.playerId ?? null;
  if (!playerId) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  await prisma.communityVote.deleteMany({
    where: { itemId: params.id, playerId },
  });

  return NextResponse.json({ ok: true });
}
