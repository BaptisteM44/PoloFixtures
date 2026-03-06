import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const patchSchema = z.object({
  orgaNote: z.string().max(1000).nullable(),
});

export async function PATCH(req: Request, { params }: { params: { teamId: string } }) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const team = await prisma.team.findUnique({
    where: { id: params.teamId },
    include: { tournament: { include: { coOrganizers: true } } },
  });
  if (!team) return new Response("Not found", { status: 404 });

  const isOrga =
    session.user.role === "ADMIN" ||
    team.tournament.coOrganizers.some((o) => o.playerId === session.user.playerId);
  if (!isOrga) return new Response("Forbidden", { status: 403 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const updated = await prisma.team.update({
    where: { id: params.teamId },
    data: { orgaNote: parsed.data.orgaNote },
  });

  return Response.json(updated);
}
