import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { hasAtLeastRole } from "@/lib/rbac";
import { z } from "zod";

export async function GET() {
  const session = await auth();
  if (!session?.user?.role || !hasAtLeastRole(session.user.role, "ADMIN")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const countries = await prisma.knownBikePoloCountry.findMany({ orderBy: { name: "asc" } });
  return Response.json(countries);
}

const createSchema = z.object({
  code: z.string().length(2),
  name: z.string().min(2)
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.role || !hasAtLeastRole(session.user.role, "ADMIN")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const created = await prisma.knownBikePoloCountry.create({ data: parsed.data });
  return Response.json(created);
}

const deleteSchema = z.object({ code: z.string().length(2) });

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.role || !hasAtLeastRole(session.user.role, "ADMIN")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await request.json();
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await prisma.knownBikePoloCountry.delete({ where: { code: parsed.data.code } });
  return Response.json({ ok: true });
}
