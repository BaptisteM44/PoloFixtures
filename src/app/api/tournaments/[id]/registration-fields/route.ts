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
  if (!tournament) return null;
  const ok =
    (role && hasAtLeastRole(role, "ADMIN")) ||
    tournament.creatorId === playerId ||
    tournament.coOrganizers.some((co) => co.playerId === playerId);
  return ok ? tournament : null;
}

// GET — list fields for a tournament (public, needed for registration form)
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const fields = await prisma.registrationField.findMany({
    where: { tournamentId: params.id },
    orderBy: { order: "asc" },
  });
  return NextResponse.json(fields);
}

const createSchema = z.object({
  label: z.string().min(1).max(200),
  required: z.boolean().default(false),
  target: z.enum(["PLAYER", "TEAM", "CAPTAIN"]).default("PLAYER"),
});

// POST — create a new field
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const orga = await requireOrga(params.id, session);
  if (!orga) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // Next order = max + 1
  const maxOrder = await prisma.registrationField.aggregate({
    where: { tournamentId: params.id },
    _max: { order: true },
  });
  const order = (maxOrder._max.order ?? -1) + 1;

  const field = await prisma.registrationField.create({
    data: { tournamentId: params.id, ...parsed.data, order },
  });
  return NextResponse.json(field);
}
