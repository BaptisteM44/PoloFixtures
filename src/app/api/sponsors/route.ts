import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { hasAtLeastRole } from "@/lib/rbac";
import { z } from "zod";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tournamentId = searchParams.get("tournamentId");
  const sponsors = await prisma.sponsor.findMany({
    where: tournamentId ? { tournamentId } : undefined,
    orderBy: { name: "asc" }
  });
  return Response.json(sponsors);
}

const createSchema = z.object({
  tournamentId: z.string(),
  tier: z.enum(["GOLD", "SILVER", "BRONZE"]),
  name: z.string().min(2),
  logoPath: z.string().optional().nullable(),
  url: z.string().optional().nullable()
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.role || !hasAtLeastRole(session.user.role, "ORGA")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const created = await prisma.sponsor.create({ data: parsed.data });
  return Response.json(created);
}
