import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function DELETE(
  req: Request,
  { params }: { params: { id: string; announcementId: string } }
) {
  const session = await auth();
  const playerId = session?.user?.playerId ?? null;
  const isSiteAdmin = session?.user?.role === "ADMIN";
  if (!playerId) return new Response("Unauthorized", { status: 401 });

  const announcement = await (prisma as any).clubAnnouncement.findUnique({
    where: { id: params.announcementId },
    include: { club: { include: { admins: { select: { playerId: true } } } } },
  });

  if (!announcement || announcement.clubId !== params.id) {
    return new Response("Not found", { status: 404 });
  }

  const isManager = playerId === announcement.club.managerId;
  const isAdmin = isManager || announcement.club.admins.some((a: any) => a.playerId === playerId) || isSiteAdmin;
  if (!isAdmin) return new Response("Forbidden", { status: 403 });

  await (prisma as any).clubAnnouncement.delete({ where: { id: params.announcementId } });
  return new Response(null, { status: 204 });
}
