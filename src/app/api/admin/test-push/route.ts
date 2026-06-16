import { auth } from "@/lib/auth";
import { hasAtLeastRole } from "@/lib/rbac";
import { sendPushToPlayer } from "@/lib/web-push";

export async function POST() {
  const session = await auth();
  if (!session?.user?.role || !hasAtLeastRole(session.user.role, "ADMIN")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const playerId = session.user.playerId;
  if (!playerId) {
    return Response.json({ error: "No player linked" }, { status: 400 });
  }

  try {
    await sendPushToPlayer(playerId, {
      title: "Poloperator — Test",
      body: "Si tu vois ce message, les push notifications fonctionnent !",
      url: "/",
      tag: "test-push",
    });
    return Response.json({ sent: 1, failed: 0 });
  } catch (e: any) {
    return Response.json({ error: e.message, sent: 0, failed: 1 });
  }
}
