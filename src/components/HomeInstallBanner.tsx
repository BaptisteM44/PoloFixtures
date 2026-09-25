"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

// Refus définitif : l'encart ne revient jamais (et coupe aussi le bandeau bas
// de PwaManager, pour ne pas proposer deux fois la même chose).
export const HOME_INSTALL_DISMISS_KEY = "home_install_banner_dismissed";

type Device = "ios" | "android" | "desktop";
type Browser = "safari" | "chrome" | "firefox" | "edge" | "samsung";

/** Navigateurs proposés par appareil (le premier est le choix conseillé). */
const BROWSERS: Record<Device, Browser[]> = {
  ios: ["safari", "chrome", "firefox", "edge"],
  android: ["chrome", "samsung", "firefox", "edge"],
  desktop: ["chrome", "edge", "safari", "firefox"],
};

/** Clés d'étapes par combinaison appareil × navigateur. */
const STEPS: Record<Device, Partial<Record<Browser, string[]>>> = {
  ios: {
    safari: ["ios_safari_1", "ios_safari_2", "ios_safari_3"],
    chrome: ["ios_chrome_1", "ios_chrome_2", "ios_safari_3"],
    edge: ["ios_edge_1", "ios_edge_2", "ios_safari_3"],
    firefox: ["ios_firefox_1", "ios_firefox_2", "ios_safari_3"],
  },
  android: {
    chrome: ["android_chrome_1", "android_chrome_2", "android_chrome_3"],
    samsung: ["android_samsung_1", "android_samsung_2", "android_samsung_3"],
    firefox: ["android_firefox_1", "android_firefox_2"],
    edge: ["android_edge_1", "android_edge_2"],
  },
  desktop: {
    chrome: ["desktop_chrome_1", "desktop_chrome_2"],
    edge: ["desktop_edge_1", "desktop_edge_2"],
    safari: ["desktop_safari_1", "desktop_safari_2"],
    firefox: ["desktop_firefox_1"],
  },
};

const BROWSER_LABEL: Record<Browser, string> = {
  safari: "Safari", chrome: "Chrome", firefox: "Firefox", edge: "Edge", samsung: "Samsung Internet",
};

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}
function detectDevice(): Device {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}
function detectBrowser(): Browser {
  const ua = navigator.userAgent;
  if (/SamsungBrowser/i.test(ua)) return "samsung";
  if (/EdgiOS|EdgA|Edg\//.test(ua)) return "edge";
  if (/FxiOS|Firefox/.test(ua)) return "firefox";
  if (/CriOS|Chrome|Chromium/.test(ua)) return "chrome";
  if (/Safari/.test(ua)) return "safari";
  return "chrome";
}
function readDismissed() {
  try { return localStorage.getItem(HOME_INSTALL_DISMISS_KEY) === "1"; } catch { return false; }
}

/**
 * Encart de la home : « Installe l'app », avec un sélecteur de navigateur
 * (pré-réglé sur celui détecté) et les étapes exactes pour l'appareil. Quand
 * le navigateur propose l'installation en un clic (Chrome/Edge), un bouton
 * suffit. Masqué si l'app est déjà installée ou si l'encart a été fermé.
 */
export function HomeInstallBanner() {
  const t = useTranslations("install_banner");
  const [device, setDevice] = useState<Device | null>(null);
  const [browser, setBrowser] = useState<Browser>("chrome");
  const [installPrompt, setInstallPrompt] = useState<{ prompt: () => void; userChoice: Promise<unknown> } | null>(null);

  useEffect(() => {
    if (readDismissed() || isStandalone()) return;
    const d = detectDevice();
    const b = detectBrowser();
    setDevice(d);
    setBrowser(BROWSERS[d].includes(b) ? b : BROWSERS[d][0]);

    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as unknown as { prompt: () => void; userChoice: Promise<unknown> });
    };
    const installed = () => setDevice(null);
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  const dismiss = useCallback(() => {
    try { localStorage.setItem(HOME_INSTALL_DISMISS_KEY, "1"); } catch { /* navigation privée */ }
    setDevice(null);
  }, []);

  const install = useCallback(async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }, [installPrompt]);

  if (!device) return null;
  const steps = STEPS[device][browser] ?? [];
  // Le bouton natif n'a de sens que pour le navigateur réellement utilisé.
  const oneClick = !!installPrompt && browser === detectBrowser();

  return (
    <div className="home-install-banner" role="region" aria-label={t("title")}>
      <span className="home-install-banner__icon" aria-hidden>📲</span>
      <div className="home-install-banner__body">
        <strong>{t(`title_${device}`)}</strong>
        <p>{t("body")}</p>

        <div className="home-install-banner__browsers" role="tablist" aria-label={t("browser_label")}>
          <span>{t("browser_label")}</span>
          {BROWSERS[device].map((b) => (
            <button key={b} type="button" role="tab" aria-selected={b === browser}
              className={`home-install-banner__chip${b === browser ? " is-active" : ""}`}
              onClick={() => setBrowser(b)}>
              {BROWSER_LABEL[b]}
            </button>
          ))}
        </div>

        {oneClick ? (
          <button className="primary" onClick={install}>{t("install_btn")}</button>
        ) : (
          <ol className="home-install-banner__steps">
            {steps.map((k) => <li key={k}>{t(k)}</li>)}
          </ol>
        )}
      </div>
      <button type="button" className="home-install-banner__close" onClick={dismiss} aria-label={t("dismiss")} title={t("dismiss")}>
        ✕
      </button>
    </div>
  );
}
