import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { apiMsg } from "@/lib/api-messages";
import { createNotification, notifyAllAdmins } from "@/lib/notify";
import { ghostApproverIds } from "@/lib/player-merge";

// GET  /api/players/:id/merge-request → état de MA demande pour ce profil fictif
// POST /api/players/:id/merge-request → « c'est moi » : demande de fusion dans mon profil
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!playerId) return Response.json({ status: "NONE" });
  const request = await prisma.playerMergeRequest.findUnique({
    where: { ghostPlayerId_requesterId: { ghostPlayerId: params.id, requesterId: playerId } },
    select: { status: true },
  });
  return Response.json({ status: request?.status ?? "NONE" });
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const requesterId = session?.user?.playerId;
  if (!requesterId) return Response.json({ error: apiMsg("login_required") }, { status: 401 });
  if (requesterId === params.id) return Response.json({ error: apiMsg("invalid_data") }, { status: 400 });

  const [ghost, ghostAccount, requester] = await Promise.all([
    prisma.player.findUnique({ where: { id: params.id }, select: { id: true, name: true, slug: true } }),
    prisma.playerAccount.findUnique({ where: { playerId: params.id }, select: { id: true } }),
    prisma.player.findUnique({ where: { id: requesterId }, select: { name: true, slug: true } }),
  ]);
  if (!ghost || !requester) return Response.json({ error: apiMsg("player_not_found") }, { status: 404 });
  if (ghostAccount) return Response.json({ error: apiMsg("merge_has_account") }, { status: 409 });

  const existing = await prisma.playerMergeRequest.findUnique({
    where: { ghostPlayerId_requesterId: { ghostPlayerId: ghost.id, requesterId } },
  });
  if (existing?.status === "PENDING") return Response.json({ status: "PENDING" });

  await prisma.playerMergeRequest.upsert({
    where: { ghostPlayerId_requesterId: { ghostPlayerId: ghost.id, requesterId } },
    create: { ghostPlayerId: ghost.id, requesterId },
    update: { status: "PENDING", decidedAt: null, decidedById: null, createdAt: new Date() },
  });

  const payload = {
    ghostName: ghost.name,
    ghostSlug: ghost.slug ?? ghost.id,
    requesterName: requester.name,
    requesterSlug: requester.slug ?? requesterId,
  };
  const approvers = (await ghostApproverIds(ghost.id)).filter((id) => id !== requesterId);
  if (approvers.length > 0) {
    for (const id of approvers) await createNotification(id, "PLAYER_MERGE_REQUESTED", payload);
  } else {
    await notifyAllAdmins("PLAYER_MERGE_REQUESTED", payload);
  }

  return Response.json({ status: "PENDING" });
}
