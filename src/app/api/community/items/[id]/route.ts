import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { createNotification } from "@/lib/notify";
import { BADGE_CATALOG } from "@/lib/badge-catalog";

async function grantBadge(playerId: string, badge: string) {
  try {
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { badges: true },
    });
    if (!player || player.badges.includes(badge)) return;
    const newBadges = [...player.badges, badge];
    await prisma.player.update({ where: { id: playerId }, data: { badges: newBadges } });
    const info = BADGE_CATALOG[badge];
    await createNotification(playerId, "BADGE_UNLOCKED", {
      badge,
      badgeName: info ? `${info.emoji} ${info.name}` : badge,
    });
  } catch (e) {
    console.error("[community] grantBadge failed:", badge, e);
  }
}

const patchSchema = z.object({
  status: z.enum(["open", "thinking", "in_progress", "done", "rejected"]).optional(),
  pinned: z.boolean().optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  const playerId = session?.user?.playerId ?? null;

  const item = await prisma.communityItem.findUnique({
    where: { id: params.id },
    include: {
      author: { select: { id: true, name: true, slug: true } },
      votes: { select: { vote: true, comment: true, playerId: true } },
      replies: {
        include: {
          author: { select: { id: true, name: true, slug: true } },
          likes: { select: { playerId: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!item) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  const up = item.votes.filter((v) => v.vote === "up").length;
  const meh = item.votes.filter((v) => v.vote === "meh").length;
  const down = item.votes.filter((v) => v.vote === "down").length;
  const myVote = playerId ? item.votes.find((v) => v.playerId === playerId) ?? null : null;

  return NextResponse.json({
    id: item.id,
    type: item.type,
    title: item.title,
    body: item.body,
    authorId: item.authorId,
    authorName: item.authorId ? item.author?.name : (item.authorName ?? "Anonyme"),
    authorSlug: item.author?.slug ?? null,
    status: item.status,
    pinned: item.pinned,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    up,
    meh,
    down,
    score: up * 3 + meh + item.replies.length * 0.5 - down,
    myVote: myVote ? { vote: myVote.vote, comment: myVote.comment } : null,
    replies: item.replies.map((r) => ({
      id: r.id,
      authorId: r.authorId,
      authorName: r.authorId ? r.author?.name : (r.authorName ?? "Anonyme"),
      authorSlug: r.author?.slug ?? null,
      body: r.body,
      isKeyReply: r.isKeyReply,
      createdAt: r.createdAt.toISOString(),
      likeCount: r.likes.length,
      likedByMe: playerId ? r.likes.some((l) => l.playerId === playerId) : false,
    })),
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }

  const item = await prisma.communityItem.findUnique({
    where: { id: params.id },
    include: {
      votes: { select: { playerId: true, vote: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!item) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  const updated = await prisma.communityItem.update({
    where: { id: params.id },
    data: parsed.data,
  });

  const STATUS_MESSAGES: Record<string, string> = {
    thinking: `🤔 "${item.title}" est à l'étude`,
    in_progress: `🚧 "${item.title}" est en cours de développement`,
    done: `✅ "${item.title}" est maintenant implémenté !`,
    rejected: `"${item.title}" ne sera pas retenu`,
  };

  // Notifier l'auteur de l'item de tout changement de statut (hors "open")
  if (
    item.authorId &&
    parsed.data.status &&
    parsed.data.status !== item.status &&
    parsed.data.status !== "open"
  ) {
    await createNotification(item.authorId, "COMMUNITY_STATUS_CHANGED" as any, {
      itemId: item.id,
      itemTitle: item.title,
      status: parsed.data.status,
      message: STATUS_MESSAGES[parsed.data.status],
    });
  }

  // Si passage en "done" → notifications aux votants + badges
  if (parsed.data.status === "done" && item.status !== "done") {
    // Notifier tous les votants avec un compte (l'auteur est déjà notifié ci-dessus)
    const votersWithAccount = item.votes.filter((v) => v.playerId !== null);
    for (const voter of votersWithAccount) {
      if (!voter.playerId || voter.playerId === item.authorId) continue;
      await createNotification(voter.playerId, "COMMUNITY_STATUS_CHANGED" as any, {
        itemId: item.id,
        itemTitle: item.title,
        status: "done",
        message: `✅ "${item.title}" est maintenant implémenté !`,
      });
    }

    // Badge community_voice pour l'auteur
    if (item.authorId) {
      await grantBadge(item.authorId, "community_voice");
    }

    // Badge early_backer pour les 5 premiers votants avec un compte
    const earlyVoters = votersWithAccount.slice(0, 5);
    for (const voter of earlyVoters) {
      if (voter.playerId) {
        await grantBadge(voter.playerId, "early_backer");
      }
    }

    // Badge constructive pour les votants "meh" (ils ont eu raison de nuancer)
    const mehVoters = votersWithAccount.filter((v) => v.vote === "meh");
    for (const voter of mehVoters) {
      if (voter.playerId) {
        await grantBadge(voter.playerId, "constructive");
      }
    }
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  const playerId = session?.user?.playerId ?? null;
  const isAdmin = session?.user?.role === "ADMIN";

  const item = await prisma.communityItem.findUnique({ where: { id: params.id } });
  if (!item) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  if (!isAdmin && item.authorId !== playerId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  await prisma.communityItem.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
