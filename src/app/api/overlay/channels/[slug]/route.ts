import { prisma } from "@/lib/db";
import { z } from "zod";
import { publishChannelUpdate } from "@/lib/sse";
import { auth } from "@/lib/auth";
import { getOrgaPlayerId } from "@/lib/orga-auth";
import { apiMsg } from "@/lib/api-messages";

/**
 * Qui pilote un canal (ce qui s'affiche en direct dans OBS) : l'admin, ou un
 * organisateur du tournoi assigné au canal. Avant, aucune garde : n'importe
 * qui pouvait changer le tournoi/terrain diffusé ou supprimer le canal.
 */
async function canControl(tournamentId: string | null): Promise<boolean> {
  const session = await auth();
  if (session?.user?.role === "ADMIN") return true;
  if (!tournamentId) return false;
  return !!(await getOrgaPlayerId(tournamentId));
}

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
  activeCourt:  z.string().optional(),
  showChat:     z.boolean().optional(),
});

// GET /api/overlay/channels/[slug]
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const channel = await prisma.overlayChannel.findUnique({
    where: { slug: params.slug },
    include: { tournament: { select: { id: true, name: true, gameDurationMin: true, status: true } } },
  });
  if (!channel) return Response.json({ error: apiMsg("channel_not_found") }, { status: 404 });
  return Response.json(channel);
}

// PATCH /api/overlay/channels/[slug]
export async function PATCH(req: Request, { params }: { params: { slug: string } }) {
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const current = await prisma.overlayChannel.findUnique({ where: { slug: params.slug }, select: { tournamentId: true } });
  if (!current) return Response.json({ error: apiMsg("channel_not_found") }, { status: 404 });
  if (!(await canControl(current.tournamentId))) return Response.json({ error: apiMsg("not_authorized") }, { status: 403 });
  // Réassigner le canal à un autre tournoi : il faut aussi en être organisateur.
  if (parsed.data.tournamentId && parsed.data.tournamentId !== current.tournamentId && !(await canControl(parsed.data.tournamentId))) {
    return Response.json({ error: apiMsg("not_authorized") }, { status: 403 });
  }

  const channel = await prisma.overlayChannel.update({
    where: { slug: params.slug },
    data: parsed.data,
    include: { tournament: { select: { id: true, name: true, status: true } } },
  });

  // Broadcast channel update via SSE so ScoreOverlay updates in real-time
  if (parsed.data.activeCourt !== undefined || parsed.data.showChat !== undefined) {
    publishChannelUpdate({
      channelSlug: params.slug,
      activeCourt: channel.activeCourt,
      showChat: channel.showChat,
    });
  }

  return Response.json(channel);
}

// DELETE /api/overlay/channels/[slug]
export async function DELETE(_req: Request, { params }: { params: { slug: string } }) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") return Response.json({ error: apiMsg("admins_only") }, { status: 403 });
  await prisma.overlayChannel.delete({ where: { slug: params.slug } }).catch(() => {});
  return Response.json({ ok: true });
}
