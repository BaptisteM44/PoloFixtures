import { z } from "zod";
import { prisma } from "@/lib/db";
import { getOrgaPlayerId } from "@/lib/orga-auth";
import { apiMsg } from "@/lib/api-messages";
import { publishScreenUpdate } from "@/lib/sse";
import { screenSlug } from "@/lib/screen-slides";
import { toScreenConfig } from "@/lib/screen-data";

const createSchema = z.object({
  name: z.string().trim().min(1).max(40),
  mode: z.enum(["court", "slideshow"]).default("slideshow"),
  court: z.number().int().min(1).max(20).default(1),
});

/** POST — nouvel écran (orga). Le slug d'URL vient du nom, rendu unique. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const t = await prisma.tournament.findFirst({ where: { OR: [{ id: params.id }, { slug: params.id }] }, select: { id: true } });
  if (!t) return Response.json({ error: apiMsg("tournament_not_found") }, { status: 404 });
  if (!(await getOrgaPlayerId(t.id))) return Response.json({ error: apiMsg("not_authorized") }, { status: 403 });
  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const base = screenSlug(parsed.data.name);
  const taken = new Set((await prisma.tournamentScreen.findMany({ where: { tournamentId: t.id }, select: { slug: true } })).map((s) => s.slug));
  let slug = base;
  for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;

  const screen = await prisma.tournamentScreen.create({
    data: { tournamentId: t.id, slug, name: parsed.data.name, mode: parsed.data.mode, court: parsed.data.court },
  });
  const config = toScreenConfig(screen);
  publishScreenUpdate({ tournamentId: t.id, type: "screen_update", slug, screen: config });
  return Response.json(config);
}
