"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";

/** Detects Safari (no beforeinstallprompt support) */
function isSafari() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua);
}

function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
}

interface Props {
  variant?: "settings" | "footer";
}

export function InstallAppButton({ variant = "footer" }: Props) {
  const t = useTranslations(variant === "settings" ? "account" : "footer");
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [standalone, setStandalone] = useState(false);
  const [safari, setSafari] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setStandalone(isStandalone());
    setSafari(isSafari());
    setIos(isIOS());

    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = useCallback(async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
    setStandalone(true);
  }, [installPrompt]);

  // Already installed as PWA
  if (standalone) {
    if (variant === "footer") return null;
    return (
      <p style={{ fontSize: 13, color: "var(--teal)", margin: 0, fontWeight: 600 }}>
        {t("install_app_installed")}
      </p>
    );
  }

  // Chrome/Edge: use prompt API
  if (installPrompt) {
    if (variant === "footer") {
      return (
        <button
          onClick={handleInstall}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--text-muted)", textDecoration: "underline", padding: 0 }}
        >
          {t("install_app")}
        </button>
      );
    }
    return (
      <button className="primary" onClick={handleInstall} style={{ fontSize: 13 }}>
        {t("install_app_btn")}
      </button>
    );
  }

  // Safari: show instructions
  if (safari) {
    const hint = ios ? t("install_app_safari_ios") : t("install_app_safari_mac");
    if (variant === "footer") {
      return (
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {hint}
        </span>
      );
    }
    return (
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0, lineHeight: 1.5 }}>
        {hint}
      </p>
    );
  }

  // Other browsers without prompt (Firefox, etc) — hide
  return null;
}
