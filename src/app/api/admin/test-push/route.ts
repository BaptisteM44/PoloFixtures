import { auth } from "@/lib/auth";
import { hasAtLeastRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import webpush from "web-push";

webpush.setVapidDetails(
  "mailto:contact@bikepolo.app",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export async function POST() {
  const session = await auth();
  if (!session?.user?.role || !hasAtLeastRole(session.user.role, "ADMIN")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const playerId = session.user.playerId;
  if (!playerId) {
    return Response.json({ error: "No player linked" }, { status: 400 });
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { playerId },
  });

  if (subscriptions.length === 0) {
    return Response.json({
      error: "Aucune subscription push trouvée. Active les notifs push dans tes paramètres d'abord.",
      sent: 0,
      failed: 0,
      total: 0,
    });
  }

  const payload = JSON.stringify({
    title: "Poloperator — Test",
    body: "Les push notifications fonctionnent !",
    url: "/",
    tag: "test-push",
  });

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      );
      sent++;
    } catch (err: any) {
      failed++;
      errors.push(`${err.statusCode ?? "?"}: ${err.body ?? err.message}`);
      if (err.statusCode === 410 || err.statusCode === 404) {
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
      }
    }
  }

  return Response.json({ sent, failed, total: subscriptions.length, errors });
}
