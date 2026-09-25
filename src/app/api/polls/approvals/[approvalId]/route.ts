import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { canDecide, decideApproval } from "@/lib/poll-targeting";

const schema = z.object({
  approve: z.boolean(),
  reason: z.string().max(500).optional().nullable(),
});

/** Accepte ou refuse une demande de ciblage. */
export async function POST(request: Request, { params }: { params: { approvalId: string } }) {
  const session = await auth();
  if (!session?.user) return new Response("Connexion requise", { status: 401 });
  const row = await prisma.pollApproval.findUnique({
    where: { id: params.approvalId },
    select: { clubId: true, poll: { select: { createdById: true } } },
  });
  if (!row) return new Response("Demande introuvable", { status: 404 });
  const isAdmin = session.user.role === "ADMIN";
  if (!(await canDecide(row, session))) return new Response("Non autorisé", { status: 403 });
  // On ne valide pas sa propre demande (sauf l'admin du site).
  if (!isAdmin && row.poll.createdById === session.user.playerId) return new Response("Non autorisé", { status: 403 });

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  const res = await decideApproval(params.approvalId, parsed.data, session.user.playerId ?? null);
  if (!res.ok) return Response.json({ error: res.error }, { status: 409 });
  return Response.json({ ok: true });
}
