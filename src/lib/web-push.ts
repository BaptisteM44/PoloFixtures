import webpush from "web-push";
import { prisma } from "@/lib/db";

function getWebPush() {
  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  if (!vapidPublic || !vapidPrivate) {
    console.warn("[web-push] VAPID keys not configured, push disabled");
    return null;
  }
  webpush.setVapidDetails("mailto:contact@bikepolo.app", vapidPublic, vapidPrivate);
  return webpush;
}

/**
 * Send a push notification to all subscriptions of a player.
 * Silently removes expired/invalid subscriptions.
 */
export async function sendPushToPlayer(
  playerId: string,
  payload: { title: string; body: string; url?: string; tag?: string }
) {
  const wp = getWebPush();
  if (!wp) return;

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { playerId },
  });

  if (subscriptions.length === 0) return;

  const data = JSON.stringify(payload);

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await wp.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          data
        );
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        }
      }
    })
  );
}
