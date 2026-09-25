import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { STORIES_PER_DAY, STORY_CAPTION_MAX, STORY_TTL_MS, loadStoryGroups } from "@/lib/stories";

export const dynamic = "force-dynamic";

const schema = z.object({
  imagePath: z.string().url().max(500),
  caption: z.string().max(STORY_CAPTION_MAX).optional().nullable(),
  tournamentId: z.string().min(1).optional().nullable(),
});

/** Groupes de stories de la home (rafraîchissement après publication). */
export async function GET() {
  const session = await auth();
  return Response.json({ groups: await loadStoryGroups(session?.user?.playerId ?? null) });
}

/** Publie une story (joueur connecté, compte non suspendu). */
export async function POST(request: Request) {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!playerId) return Response.json({ error: "login_required" }, { status: 401 });
  if ((session.user as { playerStatus?: string }).playerStatus === "REJECTED") {
    return Response.json({ error: "suspended" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  const d = parsed.data;

  // L'image doit venir de notre bucket (upload via /api/upload) : pas de lien
  // vers une image externe arbitraire affichée en plein écran sur la home.
  const bucket = process.env.R2_PUBLIC_URL;
  if (bucket && !d.imagePath.startsWith(`${bucket}/stories/`)) {
    return Response.json({ error: "invalid_image" }, { status: 400 });
  }

  // Anti-spam, compté en base (survit aux redémarrages) : N stories / 24 h.
  const recent = await prisma.story.count({
    where: { authorId: playerId, createdAt: { gt: new Date(Date.now() - 24 * 3600_000) } },
  });
  if (recent >= STORIES_PER_DAY) return Response.json({ error: "rate_limited" }, { status: 429 });

  const tournamentId = d.tournamentId
    ? (await prisma.tournament.findFirst({ where: { id: d.tournamentId, approved: true, hidden: false }, select: { id: true } }))?.id ?? null
    : null;

  const story = await prisma.story.create({
    data: {
      authorId: playerId,
      imagePath: d.imagePath,
      caption: d.caption?.trim() || null,
      tournamentId,
      expiresAt: new Date(Date.now() + STORY_TTL_MS),
    },
    select: { id: true },
  });
  return Response.json({ id: story.id });
}
