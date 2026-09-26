import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { apiMsg } from "@/lib/api-messages";
import { createNotification } from "@/lib/notify";
import { ghostApproverIds, mergePlayers } from "@/lib/player-merge";
import { z } from "zod";

const schema = z.object({ decision: z.enum(["approve", "reject"]) });

// POST /api/merge-requests/:id { decision } → valider (fusion) ou refuser
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: apiMsg("invalid_data") }, { status: 400 });

  const request = await prisma.playerMergeRequest.findUnique({
    where: { id: params.id },
    include: {
      ghost: { select: { id: true, name: true } },
      requester: { select: { id: true, name: true, slug: true } },
    },
  });
  if (!request || request.status !== "PENDING") return Response.json({ error: apiMsg("request_not_found") }, { status: 404 });

  const isAdmin = session.user.role === "ADMIN";
  if (!isAdmin && !(playerId && (await ghostApproverIds(request.ghostPlayerId)).includes(playerId))) {
    return Response.json({ error: apiMsg("forbidden") }, { status: 403 });
  }

  const payload = { ghostName: request.ghost.name, requesterSlug: request.requester.slug ?? request.requester.id };

  if (parsed.data.decision === "reject") {
    await prisma.playerMergeRequest.update({
      where: { id: request.id },
      data: { status: "REJECTED", decidedAt: new Date(), decidedById: playerId ?? null },
    });
    await createNotification(request.requesterId, "PLAYER_MERGE_DECIDED", { ...payload, decision: "rejected" });
    return Response.json({ ok: true });
  }

  const ghostAccount = await prisma.playerAccount.findUnique({ where: { playerId: request.ghostPlayerId }, select: { id: true } });
  if (ghostAccount) return Response.json({ error: apiMsg("merge_has_account") }, { status: 409 });

  // La fusion supprime le profil fictif, et avec lui (cascade) ses demandes.
  await mergePlayers(request.ghostPlayerId, request.requesterId);
  await createNotification(request.requesterId, "PLAYER_MERGE_DECIDED", { ...payload, decision: "approved" });
  return Response.json({ ok: true });
}
