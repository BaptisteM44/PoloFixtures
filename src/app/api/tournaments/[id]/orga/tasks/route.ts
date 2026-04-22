import { prisma } from "@/lib/db";
import { getOrgaPlayerId } from "@/lib/orga-auth";
import { createNotification } from "@/lib/notify";
import { z } from "zod";

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  deadline: z.string().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  assigneeIds: z.array(z.string()).optional(),
});

const taskInclude = {
  assignees: { include: { player: { select: { id: true, name: true } } } },
  createdBy: { select: { id: true, name: true } },
};

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const playerId = await getOrgaPlayerId(params.id);
  if (!playerId) return new Response("Forbidden", { status: 403 });

  const tasks = await prisma.orgaTask.findMany({
    where: { tournamentId: params.id },
    include: taskInclude,
    orderBy: { createdAt: "desc" },
  });

  return Response.json(tasks);
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const playerId = await getOrgaPlayerId(params.id);
  if (!playerId || playerId === "admin") return new Response("Forbidden — a linked player account is required to create tasks", { status: 403 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { title, description, deadline, priority, assigneeIds } = parsed.data;

  const task = await prisma.orgaTask.create({
    data: {
      tournamentId: params.id,
      title,
      description: description ?? null,
      deadline: deadline ? new Date(deadline) : null,
      priority,
      createdById: playerId,
      assignees: assigneeIds?.length
        ? { create: assigneeIds.map((id) => ({ playerId: id })) }
        : undefined,
    },
    include: taskInclude,
  });

  // Notify newly assigned people (excluding creator)
  if (assigneeIds?.length) {
    const tournament = await prisma.tournament.findUnique({ where: { id: params.id }, select: { name: true, slug: true } });
    const creator = await prisma.player.findUnique({ where: { id: playerId }, select: { name: true } });
    for (const assigneeId of assigneeIds) {
      if (assigneeId !== playerId) {
        await createNotification(assigneeId, "TASK_ASSIGNED", {
          taskTitle: title,
          tournamentId: params.id,
          tournamentSlug: tournament?.slug ?? "",
          tournamentName: tournament?.name ?? "",
          assignedByName: creator?.name ?? "",
        });
      }
    }
  }

  return Response.json(task, { status: 201 });
}
