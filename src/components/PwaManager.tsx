"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";

/**
 * Registers the Service Worker, handles push subscription,
 * and shows an install prompt banner for PWA.
 * Renders nothing visible unless install prompt is available.
 */
export function PwaManager() {
  const { data: session } = useSession();

  // Register SW + subscribe to push if logged in
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").then(async (registration) => {
      // Only subscribe to push if user is logged in
      if (!session?.user?.playerId) return;
      if (!("PushManager" in window)) return;

      // Check if already subscribed
      const existing = await registration.pushManager.getSubscription();
      if (existing) return;

      // Check if permission was already denied
      if (Notification.permission === "denied") return;

      // If permission not yet asked, wait for user interaction (handled by NotificationBell or settings)
      if (Notification.permission === "default") return;

      // Permission is "granted" — subscribe
      await subscribeToPush(registration);
    });
  }, [session?.user?.playerId]);

  // Install prompt banner disabled — install is available via account settings
  return null;
}

/** Subscribe to push and send subscription to server */
export async function subscribeToPush(registration?: ServiceWorkerRegistration) {
  try {
    const reg = registration || await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!) as BufferSource,
    });

    const json = subscription.toJSON();
    await fetch("/api/push-subscription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: json.keys,
      }),
    });
  } catch (e) {
    console.error("[pwa] Push subscription failed:", e);
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}
