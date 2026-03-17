import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { hasAtLeastRole } from "@/lib/rbac";
import { z } from "zod";

const adjustSchema = z.object({
  entries: z.array(z.object({
    entryId: z.string(),
    teamId: z.string(),
  })),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const role = session?.user?.role;
  const playerId = (session?.user as { playerId?: string } | undefined)?.playerId;
  if (!playerId) return Response.json({ error: "Non connecté" }, { status: 401 });

  const tournament = await prisma.tournament.findUnique({
    where: { id: params.id },
    include: { coOrganizers: true },
  });
  if (!tournament) return Response.json({ error: "Tournoi introuvable" }, { status: 404 });

  const isOrga =
    (role && hasAtLeastRole(role, "ORGA") && (session?.user as { tournamentId?: string }).tournamentId === params.id) ||
    role === "ADMIN" ||
    tournament.creatorId === playerId ||
    tournament.coOrganizers.some((co) => co.playerId === playerId);

  if (!isOrga) return Response.json({ error: "Accès refusé" }, { status: 403 });

  const json = await request.json();
  const parsed = adjustSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  // Mettre à jour chaque entry
  await Promise.all(
    parsed.data.entries.map((e) =>
      prisma.tournamentSoloEntry.update({
        where: { id: e.entryId },
        data: { teamId: e.teamId },
      })
    )
  );

  return Response.json({ ok: true });
}
