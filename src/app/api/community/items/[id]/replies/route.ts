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

const replySchema = z.object({
  body: z.string().min(5).max(1000),
  authorName: z.string().max(50).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { searchParams } = new URL(request.url);
  const sort = searchParams.get("sort") ?? "new";
  const session = await auth();
  const playerId = session?.user?.playerId ?? null;

  const replies = await prisma.communityReply.findMany({
    where: { itemId: params.id },
    include: {
      author: { select: { id: true, name: true, slug: true } },
      likes: { select: { playerId: true } },
    },
    orderBy: sort === "likes" ? undefined : { createdAt: "asc" },
  });

  const mapped = replies.map((r) => ({
    id: r.id,
    authorId: r.authorId,
    authorName: r.authorId ? r.author?.name : (r.authorName ?? "Anonyme"),
    authorSlug: r.author?.slug ?? null,
    body: r.body,
    isKeyReply: r.isKeyReply,
    createdAt: r.createdAt.toISOString(),
    likeCount: r.likes.length,
    likedByMe: playerId ? r.likes.some((l) => l.playerId === playerId) : false,
  }));

  if (sort === "likes") {
    mapped.sort((a, b) => {
      if (a.isKeyReply && !b.isKeyReply) return -1;
      if (!a.isKeyReply && b.isKeyReply) return 1;
      return b.likeCount - a.likeCount;
    });
  }

  return NextResponse.json(mapped);
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await request.json();
  const parsed = replySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
  }

  const item = await prisma.communityItem.findUnique({
    where: { id: params.id },
    select: { id: true, authorId: true, title: true },
  });
  if (!item) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  const session = await auth();
  const playerId = session?.user?.playerId ?? null;

  const reply = await prisma.communityReply.create({
    data: {
      itemId: params.id,
      authorId: playerId,
      authorName: playerId ? null : (parsed.data.authorName?.trim() || "Anonyme"),
      body: parsed.data.body.trim(),
    },
    include: {
      author: { select: { id: true, name: true, slug: true } },
      likes: { select: { playerId: true } },
    },
  });

  // Badge debate_starter : si 10+ réponses sur l'item et l'auteur a un compte
  if (item.authorId) {
    const replyCount = await prisma.communityReply.count({ where: { itemId: params.id } });
    if (replyCount >= 10) {
      await grantBadge(item.authorId, "debate_starter");
    }
  }

  // Notifier l'auteur de l'item qu'il y a une nouvelle réponse (s'il a un compte)
  if (item.authorId && item.authorId !== playerId) {
    await createNotification(item.authorId, "COMMUNITY_STATUS_CHANGED" as any, {
      itemId: item.id,
      itemTitle: item.title,
      status: "reply",
      message: `💬 Nouvelle réponse sur "${item.title}"`,
    });
  }

  return NextResponse.json({
    id: reply.id,
    authorId: reply.authorId,
    authorName: reply.authorId ? reply.author?.name : (reply.authorName ?? "Anonyme"),
    authorSlug: reply.author?.slug ?? null,
    body: reply.body,
    isKeyReply: reply.isKeyReply,
    createdAt: reply.createdAt.toISOString(),
    likeCount: 0,
    likedByMe: false,
  }, { status: 201 });
}
