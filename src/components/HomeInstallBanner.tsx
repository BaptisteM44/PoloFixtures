"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { subscribeToPush } from "@/components/PwaManager";

// Refus définitif : l'encart ne revient jamais (et coupe aussi le bandeau bas
// de PwaManager, pour ne pas proposer deux fois la même chose).
export const HOME_INSTALL_DISMISS_KEY = "home_install_banner_dismissed";

type Platform =
  | "ios-safari"   // iPhone/iPad dans Safari : Partager → Sur l'écran d'accueil
  | "ios-other"    // iPhone/iPad dans Chrome/Firefox… : passer par Safari
  | "android-prompt" // Android avec l'offre d'installation du navigateur : un bouton suffit
  | "android-manual" // Android sans offre (Firefox, Samsung…) : menu du navigateur
  | "notifications"  // App déjà installée, notifications pas encore activées
  | null;

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}
function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
function isAndroid() {
  return /Android/i.test(navigator.userAgent);
}
function isIOSSafari() {
  const ua = navigator.userAgent;
  return /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}
function readDismissed() {
  try { return localStorage.getItem(HOME_INSTALL_DISMISS_KEY) === "1"; } catch { return false; }
}

/**
 * Encart de la home : « Installe l'app pour recevoir les notifications »,
 * avec les instructions propres à la plateforme (iOS Safari, iOS autre
 * navigateur, Android avec ou sans bouton d'installation). Une fois l'app
 * installée, il propose d'activer les notifications ; s'il n'y a plus rien à
 * faire ou si l'utilisateur l'a fermé, il ne s'affiche plus.
 */
export function HomeInstallBanner() {
  const t = useTranslations("install_banner");
  const { data: session } = useSession();
  const loggedIn = !!session?.user?.playerId;
  const [platform, setPlatform] = useState<Platform>(null);
  const [installPrompt, setInstallPrompt] = useState<{ prompt: () => void; userChoice: Promise<unknown> } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (readDismissed()) return;

    if (isStandalone()) {
      // Installée : il reste éventuellement à activer les notifications.
      if (loggedIn && "Notification" in window && "PushManager" in window && Notification.permission === "default") {
        setPlatform("notifications");
      }
      return;
    }
    if (isIOS()) { setPlatform(isIOSSafari() ? "ios-safari" : "ios-other"); return; }
    if (!isAndroid()) return; // ordinateur : rien à afficher

    setPlatform("android-manual");
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as unknown as { prompt: () => void; userChoice: Promise<unknown> });
      setPlatform("android-prompt");
    };
    const installed = () => setPlatform(null);
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installed);
    };
  }, [loggedIn]);

  const dismiss = useCallback(() => {
    try { localStorage.setItem(HOME_INSTALL_DISMISS_KEY, "1"); } catch { /* navigation privée */ }
    setPlatform(null);
  }, []);

  const install = useCallback(async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }, [installPrompt]);

  const enableNotifications = useCallback(async () => {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") await subscribeToPush();
    } finally {
      setBusy(false);
      setPlatform(null);
    }
  }, []);

  if (!platform) return null;

  const steps: string[] =
    platform === "ios-safari" ? [t("ios_step_share"), t("ios_step_add"), t("ios_step_open")] :
    platform === "ios-other" ? [t("ios_other_step_safari"), t("ios_step_share"), t("ios_step_add"), t("ios_step_open")] :
    platform === "android-manual" ? [t("android_step_menu"), t("android_step_install"), t("android_step_open")] :
    [];

  return (
    <div className="home-install-banner" role="region" aria-label={t("title")}>
      <span className="home-install-banner__icon" aria-hidden>📲</span>
      <div className="home-install-banner__body">
        <strong>{platform === "notifications" ? t("notif_title") : t("title")}</strong>
        <p>{platform === "notifications" ? t("notif_body") : t("body")}</p>
        {steps.length > 0 && (
          <ol className="home-install-banner__steps">
            {steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        )}
        {platform === "ios-safari" || platform === "ios-other" ? (
          <p className="home-install-banner__note">{t("ios_note")}</p>
        ) : null}
        {platform === "android-prompt" && (
          <button className="primary" onClick={install}>{t("install_btn")}</button>
        )}
        {platform === "notifications" && (
          <button className="primary" onClick={enableNotifications} disabled={busy}>{busy ? "…" : t("notif_btn")}</button>
        )}
      </div>
      <button type="button" className="home-install-banner__close" onClick={dismiss} aria-label={t("dismiss")} title={t("dismiss")}>
        ✕
      </button>
    </div>
  );
}
