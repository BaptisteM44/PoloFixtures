"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";

// Ne pas re-proposer le bandeau avant N jours après un refus.
const DISMISS_KEY = "pwa_banner_dismissed_at";
const DISMISS_DAYS = 5;

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

// Distance de tirage (px) à partir de laquelle le refresh se déclenche au relâchement.
const PULL_THRESHOLD = 70;

/**
 * En mode standalone (PWA installée), le geste natif "tirer pour rafraîchir"
 * du navigateur n'existe plus (pas de chrome autour de la page) — on le
 * réimplémente à la main, uniquement quand on est en haut de la page.
 */
function usePullToRefresh() {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullDistanceRef = useRef(0);

  useEffect(() => {
    if (!isStandalone()) return;

    let startY = 0;
    let tracking = false;

    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY > 0) { tracking = false; return; }
      startY = e.touches[0].clientY;
      tracking = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!tracking) return;
      const delta = e.touches[0].clientY - startY;
      if (delta <= 0) { pullDistanceRef.current = 0; setPullDistance(0); return; }
      // Empêche le scroll de la page pendant le tirage (uniquement quand on tire vers le bas depuis le haut)
      if (window.scrollY === 0) e.preventDefault();
      const next = Math.min(delta, PULL_THRESHOLD * 1.6);
      pullDistanceRef.current = next;
      setPullDistance(next);
    };

    const onTouchEnd = () => {
      if (!tracking) return;
      tracking = false;
      if (pullDistanceRef.current >= PULL_THRESHOLD) {
        setRefreshing(true);
        window.location.reload();
      } else {
        pullDistanceRef.current = 0;
        setPullDistance(0);
      }
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  return { pullDistance, refreshing };
}

function PullToRefreshIndicator() {
  const { pullDistance, refreshing } = usePullToRefresh();
  if (pullDistance <= 0 && !refreshing) return null;
  const ready = pullDistance >= PULL_THRESHOLD;
  return (
    <div
      style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 2000,
        display: "flex", justifyContent: "center",
        height: refreshing ? 48 : Math.min(pullDistance, PULL_THRESHOLD * 1.6),
        overflow: "hidden", transition: refreshing ? "height 0.15s ease" : "none",
        pointerEvents: "none",
      }}
    >
      <div style={{
        marginTop: 8, width: 28, height: 28, borderRadius: "50%",
        border: "3px solid var(--border)", borderTopColor: "var(--teal)",
        animation: refreshing || ready ? "pwa-spin 0.6s linear infinite" : "none",
        transform: refreshing ? "none" : `rotate(${pullDistance * 3}deg)`,
        opacity: refreshing ? 1 : Math.min(pullDistance / PULL_THRESHOLD, 1),
      }} />
      <style>{`@keyframes pwa-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/**
 * Registers the Service Worker, handles push subscription, shows a
 * bottom install banner when the browser offers a PWA install prompt,
 * and enables pull-to-refresh in standalone mode.
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
  if (!visible || (!installPrompt && !iosHint)) return <PullToRefreshIndicator />;

  return (
    <>
    <PullToRefreshIndicator />
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
    </>
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
