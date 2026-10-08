import webpush from "web-push";
import { prisma } from "@/lib/db";
import { pushLocale, type PushLocale } from "@/lib/push-i18n";

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
type PushPayload = { title: string; body: string; url?: string; tag?: string };

/**
 * `payload` : un texte fixe, ou une fonction qui le construit dans la langue
 * de chaque appareil (voir lib/push-i18n).
 */
export async function sendPushToPlayer(
  playerId: string,
  payload: PushPayload | ((locale: PushLocale) => Promise<PushPayload>)
) {
  const wp = getWebPush();
  if (!wp) return;

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { playerId },
  });

  if (subscriptions.length === 0) return;

  // Une seule construction par langue (un joueur a souvent téléphone + ordi).
  let country: string | null | undefined;
  const byLocale = new Map<PushLocale, Promise<string>>();
  const dataFor = async (subLocale: string | null) => {
    if (typeof payload !== "function") return JSON.stringify(payload);
    if (!subLocale && country === undefined) {
      country = (await prisma.player.findUnique({ where: { id: playerId }, select: { country: true } }))?.country ?? null;
    }
    const locale = pushLocale(subLocale, country);
    if (!byLocale.has(locale)) byLocale.set(locale, payload(locale).then((x) => JSON.stringify(x)));
    return byLocale.get(locale)!;
  };

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await wp.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          await dataFor(sub.locale)
        );
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        }
      }
    })
  );
}
