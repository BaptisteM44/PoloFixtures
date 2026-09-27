import { z } from "zod";
import { getOrgaPlayerId } from "@/lib/orga-auth";
import { runRefereeAssignment } from "@/lib/referees";

const schema = z.object({ mode: z.enum(["fill", "recompute"]) });

/** « Répartir automatiquement » (orga) : compléter, ou tout recalculer sauf les choix manuels. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  if (!(await getOrgaPlayerId(params.id))) return new Response("Non autorisé", { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  const res = await runRefereeAssignment(params.id, parsed.data.mode);
  return Response.json({ ok: true, ...res });
}
