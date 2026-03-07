import { prisma } from "@/lib/db";
import { getOrgaPlayerId } from "@/lib/orga-auth";
import { createNotification } from "@/lib/notify";
import { z } from "zod";

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  deadline: z.string().nullable().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  completed: z.boolean().optional(),
  assignedToId: z.string().nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string; taskId: string } }) {
  const playerId = await getOrgaPlayerId(params.id);
  if (!playerId) return new Response("Forbidden", { status: 403 });

  const existing = await prisma.orgaTask.findUnique({ where: { id: params.taskId } });
  if (!existing || existing.tournamentId !== params.id) return new Response("Not found", { status: 404 });

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) data.title = parsed.data.title;
  if (parsed.data.description !== undefined) data.description = parsed.data.description;
  if (parsed.data.deadline !== undefined) data.deadline = parsed.data.deadline ? new Date(parsed.data.deadline) : null;
  if (parsed.data.priority !== undefined) data.priority = parsed.data.priority;
  if (parsed.data.completed !== undefined) data.completed = parsed.data.completed;
  if (parsed.data.assignedToId !== undefined) data.assignedToId = parsed.data.assignedToId;

  const updated = await prisma.orgaTask.update({
    where: { id: params.taskId },
    data,
    include: {
      assignedTo: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });

  // Notify if newly assigned
  if (parsed.data.assignedToId && parsed.data.assignedToId !== existing.assignedToId && parsed.data.assignedToId !== playerId) {
    const tournament = await prisma.tournament.findUnique({ where: { id: params.id }, select: { name: true } });
    const assigner = await prisma.player.findUnique({ where: { id: playerId }, select: { name: true } });
    await createNotification(parsed.data.assignedToId, "TASK_ASSIGNED", {
      taskTitle: updated.title,
      tournamentId: params.id,
      tournamentName: tournament?.name ?? "",
      assignedByName: assigner?.name ?? "",
    });
  }

  return Response.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: { id: string; taskId: string } }) {
  const playerId = await getOrgaPlayerId(params.id);
  if (!playerId) return new Response("Forbidden", { status: 403 });

  const existing = await prisma.orgaTask.findUnique({ where: { id: params.taskId } });
  if (!existing || existing.tournamentId !== params.id) return new Response("Not found", { status: 404 });

  await prisma.orgaTask.delete({ where: { id: params.taskId } });
  return new Response(null, { status: 204 });
}
