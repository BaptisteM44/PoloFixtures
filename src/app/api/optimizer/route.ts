import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { hasAtLeastRole } from "@/lib/rbac";
import { optimizeSeeds } from "@/lib/optimizer";
import { z } from "zod";

const schema = z.object({
  tournamentId: z.string(),
  apply: z.boolean().optional(),
  avoidSameCity: z.boolean().optional(),
  avoidSameCountry: z.boolean().optional()
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.role || !hasAtLeastRole(session.user.role, "ORGA")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { tournamentId, apply, avoidSameCity, avoidSameCountry } = parsed.data;

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { teams: true, matches: true }
  });

  if (!tournament) return new Response("Not found", { status: 404 });

  const result = optimizeSeeds(tournament.teams, tournament.matches, {
    avoidSameCity,
    avoidSameCountry
  });

  if (apply) {
    const updates = result.order.map((team, index) =>
      prisma.team.update({ where: { id: team.id }, data: { seed: index + 1 } })
    );
    await prisma.$transaction(updates);
  }

  return Response.json({
    score: result.score,
    order: result.order.map((t, index) => ({ id: t.id, name: t.name, seed: index + 1 }))
  });
}
