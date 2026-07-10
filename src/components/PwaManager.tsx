"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";

// Ne pas re-proposer le bandeau avant N jours après un refus.
const DISMISS_KEY = "pwa_banner_dismissed_at";
const DISMISS_DAYS = 14;

function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
}

function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isSafari() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Safari/.test(ua) && !/Chrome|Chromium|Edg|CriOS|FxiOS/.test(ua);
}

/**
 * Registers the Service Worker, handles push subscription, and shows a
 * bottom install banner when the browser offers a PWA install prompt.
 */
export function PwaManager() {
  const { data: session } = useSession();
  const t = useTranslations("pwa");
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [visible, setVisible] = useState(false);
  const [iosHint, setIosHint] = useState(false); // iPhone/iPad : pas de prompt, on guide

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

  // Décide s'il faut proposer l'installation (et comment selon la plateforme).
  useEffect(() => {
    if (isStandalone()) return; // déjà installée
    // Refus récent → ne pas remontrer
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (dismissedAt && Date.now() - dismissedAt < DISMISS_DAYS * 24 * 3600 * 1000) return;

    // iOS/Safari : pas de beforeinstallprompt → on montre directement les
    // instructions manuelles (Partager → Sur l'écran d'accueil).
    if (isIOS() && isSafari()) {
      setIosHint(true);
      setVisible(true);
      return;
    }

    // Chrome/Edge/Android : on attend l'offre d'installation du navigateur.
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const install = useCallback(async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
    setVisible(false);
  }, [installPrompt]);

  const dismiss = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  }, []);

  // Visible si : offre d'install (Chrome/Android) OU instructions iOS
  if (!visible || (!installPrompt && !iosHint)) return null;

  return (
    <div
      role="dialog"
      aria-label={t("banner_title")}
      style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 1000,
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
        padding: "12px 16px", background: "var(--bg-panel, #fff)",
        borderTop: "2px solid var(--border)",
        boxShadow: "0 -4px 16px rgba(0,0,0,0.08)",
      }}
    >
      <div style={{ flex: "1 1 220px", minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>📲 {t("banner_title")}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {iosHint ? t("banner_ios_hint") : t("banner_desc")}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
        {/* iOS : pas de bouton possible (Apple ne fournit pas d'API) — juste l'instruction */}
        {!iosHint && installPrompt && (
          <button className="primary" style={{ fontSize: 13, padding: "8px 16px" }} onClick={install}>
            {t("banner_install")}
          </button>
        )}
        <button
          type="button"
          aria-label={t("banner_dismiss")}
          onClick={dismiss}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, lineHeight: 1, color: "var(--text-muted)", padding: "4px 8px" }}
        >
          ✕
        </button>
      </div>
    </div>
  );
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
