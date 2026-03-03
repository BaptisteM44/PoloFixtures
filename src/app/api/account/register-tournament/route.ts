import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const schema = z.object({
  tournamentId: z.string(),
  notes: z.string().optional()
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.playerId) return new Response("Unauthorized", { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const player = await prisma.player.findUnique({ where: { id: session.user.playerId } });
  if (!player) return new Response("Player not found", { status: 404 });

  const tournament = await prisma.tournament.findUnique({ where: { id: parsed.data.tournamentId } });
  if (!tournament) return Response.json({ error: "Tournament not found" }, { status: 404 });
  if (tournament.status === "COMPLETED") {
    return Response.json({ error: "Ce tournoi est terminé." }, { status: 400 });
  }

  // Check if already registered
  const existing = await prisma.freeAgent.findFirst({
    where: {
      tournamentId: parsed.data.tournamentId,
      name: player.name
    }
  });
  if (existing) {
    return Response.json({ error: "Déjà inscrit à ce tournoi." }, { status: 409 });
  }

  // Retrieve email from PlayerAccount if it exists
  // Using raw query workaround for TS client cache issue
  const accountRows = await prisma.$queryRaw<{ email: string }[]>`
    SELECT email FROM "PlayerAccount" WHERE "playerId" = ${player.id} LIMIT 1
  `;
  const playerEmail = accountRows[0]?.email ?? "";

  const freeAgent = await prisma.freeAgent.create({
    data: {
      tournamentId: parsed.data.tournamentId,
      name: player.name,
      email: playerEmail,
      city: player.city,
      country: player.country,
      notes: parsed.data.notes ?? null
    }
  });

  return Response.json(freeAgent, { status: 201 });
}
