import { z } from "zod";
import { prisma } from "@/lib/db";
import { getOrgaPlayerId } from "@/lib/orga-auth";
import { apiMsg } from "@/lib/api-messages";
import { publishScreenUpdate } from "@/lib/sse";
import { defaultScreens } from "@/lib/screen-slides";
import { toScreenConfig } from "@/lib/screen-data";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  mode: z.enum(["court", "slideshow"]).optional(),
  court: z.number().int().min(1).max(20).optional(),
  theme: z.enum(["dark", "light"]).optional(),
  clockPosition: z.enum(["top", "bottom"]).optional(),
  slides: z.array(z.object({ key: z.string().max(40), seconds: z.number().int().min(3).max(600).optional() })).max(60).nullable().optional(),
  slideSeconds: z.number().int().min(3).max(600).optional(),
  paused: z.boolean().optional(),
  pinnedSlide: z.string().max(40).nullable().optional(),
  announcement: z.string().max(200).nullable().optional(),
});

async function resolve(idOrSlug: string) {
  const t = await prisma.tournament.findFirst({ where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] }, select: { id: true, courtsCount: true } });
  if (!t) return { error: Response.json({ error: apiMsg("tournament_not_found") }, { status: 404 }) };
  if (!(await getOrgaPlayerId(t.id))) return { error: Response.json({ error: apiMsg("not_authorized") }, { status: 403 }) };
  return { t };
}

/**
 * PATCH — réglages / pilotage d'un écran (orga). Un écran par défaut
 * (« diaporama », « terrain-N ») n'existe pas encore en base : il est créé
 * au premier réglage. Diffusé en direct aux écrans ouverts (SSE).
 */
export async function PATCH(req: Request, { params }: { params: { id: string; slug: string } }) {
  const r = await resolve(params.id);
  if (r.error) return r.error;
  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const { slides, announcement, ...rest } = parsed.data;
  const data = {
    ...rest,
    ...(slides !== undefined ? { slides: slides === null ? null : slides } : {}),
    ...(announcement !== undefined ? { announcement: announcement?.trim() || null } : {}),
  };

  const existing = await prisma.tournamentScreen.findUnique({ where: { tournamentId_slug: { tournamentId: r.t.id, slug: params.slug } } });
  let screen;
  if (existing) {
    screen = await prisma.tournamentScreen.update({ where: { id: existing.id }, data: data as never });
  } else {
    const def = defaultScreens(r.t.courtsCount).find((d) => d.slug === params.slug);
    if (!def) return Response.json({ error: apiMsg("not_found") }, { status: 404 });
    screen = await prisma.tournamentScreen.create({
      data: { tournamentId: r.t.id, slug: def.slug, name: "", mode: def.mode, court: def.court, ...(data as object) } as never,
    });
  }
  const config = toScreenConfig(screen);
  publishScreenUpdate({ tournamentId: r.t.id, type: "screen_update", slug: config.slug, screen: config });
  return Response.json(config);
}

/** DELETE — supprime un écran (un écran par défaut revient à ses réglages d'origine). */
export async function DELETE(_req: Request, { params }: { params: { id: string; slug: string } }) {
  const r = await resolve(params.id);
  if (r.error) return r.error;
  await prisma.tournamentScreen.deleteMany({ where: { tournamentId: r.t.id, slug: params.slug } });
  publishScreenUpdate({ tournamentId: r.t.id, type: "screen_deleted", slug: params.slug });
  return Response.json({ ok: true });
}
