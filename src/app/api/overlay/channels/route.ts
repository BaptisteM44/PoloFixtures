import { prisma } from "@/lib/db";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { apiMsg } from "@/lib/api-messages";

const createSchema = z.object({
  slug: z.string().min(1).max(32).regex(/^[a-z0-9-]+$/, "Slug: lettres minuscules, chiffres et tirets uniquement"),
  label: z.string().min(1).max(64),
});

// GET /api/overlay/channels — liste tous les canaux avec leur tournoi
export async function GET() {
  const channels = await prisma.overlayChannel.findMany({
    include: {
      tournament: { select: { id: true, name: true, status: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return Response.json(channels);
}

// POST /api/overlay/channels — crée un canal
// Réservé à l'admin : sans garde, n'importe qui pouvait créer des canaux.
export async function POST(req: Request) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") return Response.json({ error: apiMsg("admins_only") }, { status: 403 });
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const existing = await prisma.overlayChannel.findUnique({ where: { slug: parsed.data.slug } });
  if (existing) {
    return Response.json({ error: apiMsg("slug_taken") }, { status: 409 });
  }

  const channel = await prisma.overlayChannel.create({ data: parsed.data });
  return Response.json(channel, { status: 201 });
}
