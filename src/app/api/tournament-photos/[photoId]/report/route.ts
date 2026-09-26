import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isRateLimited } from "@/lib/rate-limit";
import { notifyAllAdmins } from "@/lib/notify";

// Masquée d'office à partir de ce nombre de signalements, en attendant l'admin.
const AUTO_HIDE_REPORTS = 3;

/** Signaler une photo publiée (joueur connecté, une fois par photo). */
export async function POST(_req: Request, { params }: { params: { photoId: string } }) {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!playerId) return Response.json({ error: "login_required" }, { status: 401 });

  const photo = await prisma.tournamentPhoto.findUnique({
    where: { id: params.photoId },
    select: {
      id: true, authorId: true, hiddenAt: true, pendingApproval: true,
      author: { select: { name: true } },
      tournament: { select: { name: true } },
    },
  });
  if (!photo || photo.hiddenAt || photo.pendingApproval) return Response.json({ error: "not_found" }, { status: 404 });
  if (photo.authorId === playerId) return Response.json({ error: "own_photo" }, { status: 400 });
  if (isRateLimited(`photo-report:${playerId}:${photo.id}`, 1, 7 * 86400_000)) {
    return Response.json({ error: "already_reported" }, { status: 409 });
  }
  if (isRateLimited(`photo-report:${playerId}`, 10, 3600_000)) return Response.json({ error: "rate_limited" }, { status: 429 });

  const updated = await prisma.tournamentPhoto.update({
    where: { id: photo.id },
    data: { reportCount: { increment: 1 } },
    select: { reportCount: true },
  });
  const autoHidden = updated.reportCount >= AUTO_HIDE_REPORTS;
  if (autoHidden) await prisma.tournamentPhoto.update({ where: { id: photo.id }, data: { hiddenAt: new Date() } });

  await notifyAllAdmins("TOURNAMENT_PHOTO_REPORTED", {
    photoId: photo.id,
    authorName: photo.author.name,
    tournamentName: photo.tournament.name,
    reportCount: updated.reportCount,
    autoHidden: autoHidden ? "1" : "0",
  });
  return Response.json({ ok: true, autoHidden });
}
