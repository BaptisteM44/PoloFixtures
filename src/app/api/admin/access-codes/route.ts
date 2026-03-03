import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { hasAtLeastRole } from "@/lib/rbac";
import { z } from "zod";
import bcrypt from "bcryptjs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.role || !hasAtLeastRole(session.user.role, "ADMIN")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const codes = await prisma.accessCode.findMany({
    select: {
      id: true,
      role: true,
      tournamentId: true,
      revokedAt: true,
      expiresAt: true,
      createdAt: true
    }
  });

  return Response.json(codes);
}

const updateSchema = z.object({
  codes: z.array(
    z.object({
      role: z.enum(["REF", "ORGA", "ADMIN"]),
      code: z.string().min(4),
      tournamentId: z.string().optional().nullable()
    })
  )
});

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.role || !hasAtLeastRole(session.user.role, "ADMIN")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await prisma.accessCode.deleteMany();

  for (const code of parsed.data.codes) {
    await prisma.accessCode.create({
      data: {
        role: code.role,
        codeHash: await bcrypt.hash(code.code, 10),
        tournamentId: code.tournamentId ?? null
      }
    });
  }

  return Response.json({ ok: true });
}
