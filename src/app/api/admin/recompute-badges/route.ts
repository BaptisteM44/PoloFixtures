import { auth } from "@/lib/auth";
import { hasAtLeastRole } from "@/lib/rbac";
import { recomputeAllBadges } from "@/lib/achievements";

export async function POST() {
  const session = await auth();
  if (!session?.user?.role || !hasAtLeastRole(session.user.role, "ADMIN")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await recomputeAllBadges();
  return Response.json(result);
}
