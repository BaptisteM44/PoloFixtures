import webpush from "web-push";
import { prisma } from "@/lib/db";

webpush.setVapidDetails(
  "mailto:contact@bikepolo.app",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

/**
 * Send a push notification to all subscriptions of a player.
 * Silently removes expired/invalid subscriptions.
 */
export async function sendPushToPlayer(
  playerId: string,
  payload: { title: string; body: string; url?: string; tag?: string }
) {
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { playerId },
  });

  if (subscriptions.length === 0) return;

  const data = JSON.stringify(payload);

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          data
        );
      } catch (err: any) {
        // 410 Gone or 404 = subscription expired, remove it
        if (err.statusCode === 410 || err.statusCode === 404) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        }
      }
    })
  );
}
