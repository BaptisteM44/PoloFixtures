import { getScreenData } from "@/lib/screen-data";
import { apiMsg } from "@/lib/api-messages";

export const dynamic = "force-dynamic";

/** GET — données de l'écran de salle (public, comme la page du tournoi). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const data = await getScreenData(params.id);
  if (!data) return Response.json({ error: apiMsg("tournament_not_found") }, { status: 404 });
  return Response.json(data, { headers: { "Cache-Control": "no-store" } });
}
