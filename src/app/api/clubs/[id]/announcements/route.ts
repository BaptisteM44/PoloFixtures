import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notify";
import { z } from "zod";

async function getClubAndCheck(clubId: string) {
  const session = await auth();
  const playerId = session?.user?.playerId ?? null;
  const isSiteAdmin = session?.user?.role === "ADMIN";

  const club = await prisma.club.findUnique({
    where: { id: clubId },
    include: {
      admins: { select: { playerId: true } },
      members: { where: { status: "MEMBER" }, select: { playerId: true } },
    },
  });
  if (!club) return null;

  const isManager = playerId === club.managerId;
  const isAdmin = isManager || club.admins.some((a) => a.playerId === playerId) || isSiteAdmin;
  const isMember = isManager || club.members.some((m) => m.playerId === playerId);

  return { club, playerId, isAdmin, isMember };
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const ctx = await getClubAndCheck(params.id);
  if (!ctx) return new Response("Not found", { status: 404 });
  if (!ctx.isMember) return new Response("Forbidden", { status: 403 });

  const announcements = await (prisma as any).clubAnnouncement.findMany({
    where: { clubId: params.id },
    orderBy: { createdAt: "desc" },
    include: { author: { select: { id: true, name: true } } },
  });

  return Response.json(announcements.map((a: any) => ({
    ...a,
    createdAt: a.createdAt.toISOString(),
  })));
}

const createSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(2000),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await getClubAndCheck(params.id);
  if (!ctx) return new Response("Not found", { status: 404 });
  if (!ctx.isAdmin) return new Response("Forbidden", { status: 403 });
  if (!ctx.playerId) return new Response("Unauthorized", { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const announcement = await (prisma as any).clubAnnouncement.create({
    data: {
      clubId: params.id,
      authorId: ctx.playerId,
      title: parsed.data.title,
      content: parsed.data.content,
    },
    include: { author: { select: { id: true, name: true } } },
  });

  // Notify all members (excluding the author)
  const allMembers = await prisma.clubMember.findMany({
    where: { clubId: params.id, status: "MEMBER" },
    select: { playerId: true },
  });
  const recipientIds = new Set<string>();
  allMembers.forEach((m) => { if (m.playerId !== ctx.playerId) recipientIds.add(m.playerId); });
  if (ctx.club.managerId && ctx.club.managerId !== ctx.playerId) recipientIds.add(ctx.club.managerId);

  for (const recipientId of recipientIds) {
    await createNotification(recipientId, "CLUB_ANNOUNCEMENT", {
      clubId: params.id,
      clubName: ctx.club.name,
      announcementTitle: parsed.data.title,
    });
  }

  return Response.json({ ...announcement, createdAt: announcement.createdAt.toISOString() }, { status: 201 });
}
