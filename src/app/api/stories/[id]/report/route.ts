import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isRateLimited } from "@/lib/rate-limit";
import { notifyAllAdmins } from "@/lib/notify";

// Au-delà de ce nombre de signalements, la story est masquée d'office en
// attendant l'avis de l'admin (qui peut la réafficher).
const AUTO_HIDE_REPORTS = 3;

/** Signaler une story (joueur connecté, une fois par story). */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!playerId) return Response.json({ error: "login_required" }, { status: 401 });
  if (isRateLimited(`story-report:${playerId}:${params.id}`, 1, 7 * 24 * 3600_000)) {
    return Response.json({ error: "already_reported" }, { status: 409 });
  }
  if (isRateLimited(`story-report:${playerId}`, 10, 3600_000)) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }

  const story = await prisma.story.findUnique({
    where: { id: params.id },
    select: { id: true, authorId: true, caption: true, hiddenAt: true, author: { select: { name: true } } },
  });
  if (!story || story.hiddenAt) return Response.json({ error: "not_found" }, { status: 404 });
  if (story.authorId === playerId) return Response.json({ error: "own_story" }, { status: 400 });

  const updated = await prisma.story.update({
    where: { id: story.id },
    data: { reportCount: { increment: 1 } },
    select: { reportCount: true },
  });
  const autoHidden = updated.reportCount >= AUTO_HIDE_REPORTS;
  if (autoHidden) await prisma.story.update({ where: { id: story.id }, data: { hiddenAt: new Date() } });

  await notifyAllAdmins("STORY_REPORTED", {
    storyId: story.id,
    authorName: story.author.name,
    caption: (story.caption ?? "").slice(0, 80),
    reportCount: updated.reportCount,
    autoHidden: autoHidden ? "1" : "0",
  });
  return Response.json({ ok: true, autoHidden });
}
