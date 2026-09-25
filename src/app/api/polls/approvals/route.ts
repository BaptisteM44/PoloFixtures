import { auth } from "@/lib/auth";
import { pendingApprovalsFor } from "@/lib/poll-targeting";

export const dynamic = "force-dynamic";

/** Demandes de ciblage que je peux trancher (gérant/admin de club, admin du site). */
export async function GET() {
  const session = await auth();
  const playerId = session?.user?.playerId ?? null;
  const isAdmin = session?.user?.role === "ADMIN";
  if (!playerId && !isAdmin) return Response.json({ approvals: [] });
  return Response.json({ approvals: await pendingApprovalsFor(playerId, isAdmin) });
}
