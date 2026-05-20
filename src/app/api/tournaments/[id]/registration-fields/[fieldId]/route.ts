import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasAtLeastRole } from "@/lib/rbac";
import { z } from "zod";

async function requireOrga(tournamentId: string, session: any) {
  const playerId = session?.user?.playerId;
  const role = session?.user?.role;
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { creatorId: true, coOrganizers: { select: { playerId: true } } },
  });
  if (!tournament) return false;
  return (
    (role && hasAtLeastRole(role, "ADMIN")) ||
    tournament.creatorId === playerId ||
    tournament.coOrganizers.some((co) => co.playerId === playerId)
  );
}

const patchSchema = z.object({
  label: z.string().min(1).max(200).optional(),
  required: z.boolean().optional(),
  target: z.enum(["PLAYER", "TEAM", "CAPTAIN"]).optional(),
  order: z.number().int().optional(),
});

// PATCH — update a field
export async function PATCH(req: NextRequest, { params }: { params: { id: string; fieldId: string } }) {
  const session = await auth();
  if (!await requireOrga(params.id, session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const field = await prisma.registrationField.update({
    where: { id: params.fieldId },
    data: parsed.data,
  });
  return NextResponse.json(field);
}

// DELETE — delete a field (cascades answers)
export async function DELETE(_req: NextRequest, { params }: { params: { id: string; fieldId: string } }) {
  const session = await auth();
  if (!await requireOrga(params.id, session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.registrationField.delete({ where: { id: params.fieldId } });
  return NextResponse.json({ ok: true });
}
