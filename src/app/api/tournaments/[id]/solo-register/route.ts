import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { z } from "zod";

const postSchema = z.object({
  level: z.enum(["C", "C+", "B-", "B", "B+", "A-", "A", "A+"]),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const playerId = (session?.user as { playerId?: string } | undefined)?.playerId;
  if (!playerId) return Response.json({ error: "Non connecté" }, { status: 401 });

  const tournament = await prisma.tournament.findUnique({ where: { id: params.id } });
  if (!tournament) return Response.json({ error: "Tournoi introuvable" }, { status: 404 });

  if (tournament.format !== "ABC Chapeau") {
    return Response.json({ error: "Ce tournoi ne supporte pas les inscriptions individuelles." }, { status: 400 });
  }

  const now = new Date();
  if (tournament.registrationStart && now < tournament.registrationStart) {
    return Response.json({ error: "Les inscriptions ne sont pas encore ouvertes." }, { status: 403 });
  }
  if (tournament.registrationEnd && now > tournament.registrationEnd) {
    return Response.json({ error: "Les inscriptions sont clôturées." }, { status: 403 });
  }

  const json = await request.json();
  const parsed = postSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  // Vérifier si déjà inscrit
  const existing = await prisma.tournamentSoloEntry.findUnique({
    where: { tournamentId_playerId: { tournamentId: params.id, playerId } },
  });
  if (existing) return Response.json({ error: "Vous êtes déjà inscrit à ce tournoi." }, { status: 400 });

  // Compter les inscrits non-waitlisted
  const currentCount = await prisma.tournamentSoloEntry.count({
    where: { tournamentId: params.id, waitlisted: false },
  });

  const maxSolo = (tournament as { maxSoloPlayers?: number | null }).maxSoloPlayers ?? null;
  const waitlisted = maxSolo !== null && currentCount >= maxSolo;

  const entry = await prisma.tournamentSoloEntry.create({
    data: {
      tournamentId: params.id,
      playerId,
      level: parsed.data.level,
      waitlisted,
    },
  });

  return Response.json({ ok: true, waitlisted: entry.waitlisted }, { status: 201 });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const playerId = (session?.user as { playerId?: string } | undefined)?.playerId;
  if (!playerId) return Response.json({ error: "Non connecté" }, { status: 401 });

  const entry = await prisma.tournamentSoloEntry.findUnique({
    where: { tournamentId_playerId: { tournamentId: params.id, playerId } },
  });
  if (!entry) return Response.json({ error: "Inscription introuvable" }, { status: 404 });

  await prisma.tournamentSoloEntry.delete({
    where: { tournamentId_playerId: { tournamentId: params.id, playerId } },
  });

  return Response.json({ ok: true });
}
