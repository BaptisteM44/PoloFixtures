import { auth } from "@/lib/auth";
import { hasAtLeastRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { z } from "zod";

const schema = z.object({ reason: z.string().min(10, "La raison doit faire au moins 10 caractères.") });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.role || !hasAtLeastRole(session.user.role, "ADMIN")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const tournament = await prisma.tournament.findUnique({ where: { id: params.id } });
  if (!tournament) return Response.json({ error: "Not found" }, { status: 404 });

  const json = await req.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten().fieldErrors.reason?.[0] ?? "Raison invalide." }, { status: 400 });
  }

  await prisma.tournament.update({
    where: { id: params.id },
    data: {
      approved: false,
      submissionStatus: "REJECTED",
      rejectionReason: parsed.data.reason,
    }
  });

  return Response.json({ ok: true });
}
