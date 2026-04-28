import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { createNotification } from "@/lib/notify";
import { BADGE_CATALOG } from "@/lib/badge-catalog";

const createSchema = z.object({
  type: z.enum(["idea", "bug", "translation"]),
  title: z.string().min(10).max(120),
  body: z.string().min(20).max(2000),
  authorName: z.string().max(50).optional(), // pour les anonymes
});

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

function computeScore(up: number, meh: number, down: number, replyCount: number) {
  return up * 3 + meh * 1 + replyCount * 0.5 - down * 1;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type"); // idea | bug | translation | done | all
  const sort = searchParams.get("sort") ?? "hot"; // hot | new | top

  const session = await auth();
  const playerId = session?.user?.playerId ?? null;

  const whereStatus = type === "done"
    ? { status: "done" }
    : type && type !== "all"
      ? { type, NOT: { status: "done" } }
      : { NOT: { status: "done" } };

  const items = await prisma.communityItem.findMany({
    where: whereStatus,
    include: {
      author: { select: { id: true, name: true, slug: true } },
      votes: { select: { vote: true, playerId: true } },
      replies: { select: { id: true } },
    },
    orderBy: sort === "new" ? { createdAt: "desc" } : { createdAt: "desc" },
  });

  const result = items
    .map((item) => {
      const up = item.votes.filter((v) => v.vote === "up").length;
      const meh = item.votes.filter((v) => v.vote === "meh").length;
      const down = item.votes.filter((v) => v.vote === "down").length;
      const replyCount = item.replies.length;
      const score = computeScore(up, meh, down, replyCount);
      const myVote = playerId
        ? item.votes.find((v) => v.playerId === playerId)?.vote ?? null
        : null;
      return {
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
        score,
        replyCount,
        myVote,
      };
    })
    .sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      if (sort === "new") return b.createdAt.localeCompare(a.createdAt);
      if (sort === "top") return b.up - a.up;
      return b.score - a.score; // hot
    });

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
  }

  const session = await auth();
  const playerId = session?.user?.playerId ?? null;

  const { type, title, body: itemBody, authorName } = parsed.data;

  const item = await prisma.communityItem.create({
    data: {
      type,
      title: title.trim(),
      body: itemBody.trim(),
      authorId: playerId,
      authorName: playerId ? null : (authorName?.trim() || "Anonyme"),
    },
  });

  // Badge first_feedback pour les joueurs connectés
  if (playerId) {
    await grantBadge(playerId, "first_feedback");
  }

  return NextResponse.json(item, { status: 201 });
}
