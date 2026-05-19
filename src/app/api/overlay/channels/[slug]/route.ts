import { prisma } from "@/lib/db";
import { z } from "zod";

const patchSchema = z.object({
  label:        z.string().min(1).max(64).optional(),
  tournamentId: z.string().nullable().optional(),
  court:        z.string().optional(),
  theme:        z.enum(["dark", "light"]).optional(),
  showClock:    z.boolean().optional(),
  showScore:    z.boolean().optional(),
  showTeamNames: z.boolean().optional(),
  showEventFeed: z.boolean().optional(),
  showHeader:   z.boolean().optional(),
});

// GET /api/overlay/channels/[slug]
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const channel = await prisma.overlayChannel.findUnique({
    where: { slug: params.slug },
    include: { tournament: { select: { id: true, name: true, gameDurationMin: true, status: true } } },
  });
  if (!channel) return Response.json({ error: "Canal introuvable" }, { status: 404 });
  return Response.json(channel);
}

// PATCH /api/overlay/channels/[slug]
export async function PATCH(req: Request, { params }: { params: { slug: string } }) {
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const channel = await prisma.overlayChannel.update({
    where: { slug: params.slug },
    data: parsed.data,
    include: { tournament: { select: { id: true, name: true, status: true } } },
  });
  return Response.json(channel);
}

// DELETE /api/overlay/channels/[slug]
export async function DELETE(_req: Request, { params }: { params: { slug: string } }) {
  await prisma.overlayChannel.delete({ where: { slug: params.slug } });
  return Response.json({ ok: true });
}
