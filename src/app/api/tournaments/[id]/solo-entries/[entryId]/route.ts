import { prisma } from "@/lib/db";
import { getOrgaPlayerId } from "@/lib/orga-auth";
import { z } from "zod";
import { apiMsg } from "@/lib/api-messages";
import { moveSoloEntry } from "@/lib/abc-teams";

const patchSchema = z.object({
  // Paiement (au moins l'un des deux blocs doit être présent).
  feePaid: z.boolean().optional(),
  paymentMethod: z.enum(["BANK_TRANSFER", "PAYPAL", "CASH", "OTHER"]).nullable().optional(),
  // Sélection manuelle IN/OUT : waitlisted=false → IN, true → liste d'attente.
  waitlisted: z.boolean().optional(),
});

// PATCH /api/tournaments/:id/solo-entries/:entryId — met à jour une inscription
// individuelle (pré-tirage) : paiement (feePaid/paymentMethod) et/ou sélection
// manuelle IN/OUT (waitlisted). Orga/admin du tournoi uniquement.
export async function PATCH(req: Request, { params }: { params: { id: string; entryId: string } }) {
  const playerId = await getOrgaPlayerId(params.id);
  if (!playerId) return new Response("Forbidden", { status: 403 });

  const entry = await prisma.tournamentSoloEntry.findUnique({ where: { id: params.entryId } });
  if (!entry || entry.tournamentId !== params.id) return new Response("Not found", { status: 404 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const data: {
    feePaid?: boolean;
    paymentMethod?: "BANK_TRANSFER" | "PAYPAL" | "CASH" | "OTHER" | null;
    waitlisted?: boolean;
  } = {};

  if (parsed.data.feePaid !== undefined) {
    data.feePaid = parsed.data.feePaid;
    // Uncheck efface le mode de paiement ; check sans mode explicite garde l'existant.
    data.paymentMethod = !parsed.data.feePaid
      ? null
      : parsed.data.paymentMethod !== undefined
        ? parsed.data.paymentMethod
        : entry.paymentMethod;
  }
  if (parsed.data.waitlisted !== undefined) {
    const t = await prisma.tournament.findUnique({ where: { id: params.id }, select: { selectionLocked: true } });
    if (t?.selectionLocked) return Response.json({ error: apiMsg("draw_locked") }, { status: 409 });
    data.waitlisted = parsed.data.waitlisted;
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Passé en liste d'attente : il quitte aussi son équipe (sinon il y restait).
    if (data.waitlisted && entry.teamId) await moveSoloEntry(tx, params.id, entry.id, null);
    return tx.tournamentSoloEntry.update({ where: { id: params.entryId }, data });
  });

  return Response.json({
    ok: true,
    feePaid: updated.feePaid,
    paymentMethod: updated.paymentMethod,
    waitlisted: updated.waitlisted,
  });
}
