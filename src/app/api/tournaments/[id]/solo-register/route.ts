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

  const player = await prisma.player.findUnique({ where: { id: playerId }, select: { status: true } });
  if (player?.status === "REJECTED") return Response.json({ error: "Votre compte est suspendu. Vous ne pouvez pas vous inscrire à un tournoi." }, { status: 403 });

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

  const maxSolo = (tournament as { maxSoloPlayers?: number | null }).maxSoloPlayers ?? null;
  const isRush = (tournament as { rushRegistration?: boolean }).rushRegistration ?? false;

  // Si rush + max défini → waitlist possible. Sinon toujours admis.
  let waitlisted = false;
  if (isRush && maxSolo !== null) {
    const currentCount = await prisma.tournamentSoloEntry.count({
      where: { tournamentId: params.id, waitlisted: false },
    });
    waitlisted = currentCount >= maxSolo;
  }

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

  const wasActive = !entry.waitlisted;
  const tournament = await prisma.tournament.findUnique({ where: { id: params.id }, select: { rushRegistration: true } });

  await prisma.$transaction(async (tx) => {
    await tx.tournamentSoloEntry.delete({
      where: { tournamentId_playerId: { tournamentId: params.id, playerId } },
    });

    // Si le joueur supprimé était actif et que le tournoi est en mode rush,
    // promouvoir atomiquement le premier en liste d'attente
    if (wasActive && tournament?.rushRegistration) {
      const firstWaiting = await tx.tournamentSoloEntry.findFirst({
        where: { tournamentId: params.id, waitlisted: true },
        orderBy: { createdAt: "asc" },
      });
      if (firstWaiting) {
        await tx.tournamentSoloEntry.update({
          where: { id: firstWaiting.id },
          data: { waitlisted: false },
        });
      }
    }
  });

  return Response.json({ ok: true });
}
