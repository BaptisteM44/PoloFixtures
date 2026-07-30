import { prisma } from "@/lib/db";
import { getOrgaPlayerId } from "@/lib/orga-auth";
import { z } from "zod";

const patchSchema = z.object({
  feePaid: z.boolean(),
  paymentMethod: z.enum(["BANK_TRANSFER", "PAYPAL", "CASH", "OTHER"]).nullable().optional(),
});

// PATCH /api/tournaments/:id/solo-entries/:entryId — toggle feePaid + record paymentMethod
// for an individual (pre-draw) registration. Only orga/admin of the tournament.
export async function PATCH(req: Request, { params }: { params: { id: string; entryId: string } }) {
  const playerId = await getOrgaPlayerId(params.id);
  if (!playerId) return new Response("Forbidden", { status: 403 });

  const entry = await prisma.tournamentSoloEntry.findUnique({ where: { id: params.entryId } });
  if (!entry || entry.tournamentId !== params.id) return new Response("Not found", { status: 404 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const updated = await prisma.tournamentSoloEntry.update({
    where: { id: params.entryId },
    data: {
      feePaid: parsed.data.feePaid,
      // Uncheck efface le mode de paiement ; check sans mode explicite garde l'existant.
      paymentMethod: !parsed.data.feePaid ? null : parsed.data.paymentMethod !== undefined ? parsed.data.paymentMethod : entry.paymentMethod,
    },
  });

  return Response.json({ ok: true, feePaid: updated.feePaid, paymentMethod: updated.paymentMethod });
}
