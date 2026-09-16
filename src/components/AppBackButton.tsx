"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone === true;
}

// Compte les navigations internes faites DEPUIS l'ouverture de l'app (pas
// l'historique du navigateur en général) : sert à savoir si router.back()
// ramènera bien vers une page du site, ou s'il faut retomber sur l'accueil
// (cas d'un lien profond ouvert directement — notif, partage, favori PWA…).
const DEPTH_KEY = "app_nav_depth";

/**
 * Bouton retour affiché UNIQUEMENT en mode PWA standalone (pas en navigateur
 * classique, où le bouton retour natif existe déjà). Utilise l'historique réel
 * (router.back) plutôt qu'une destination fixe, avec repli sûr vers l'accueil
 * quand il n'y a pas de navigation interne à dérouler.
 */
export function AppBackButton() {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("nav");
  const [standalone, setStandalone] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    setStandalone(isStandalone());
  }, []);

  // Incrémente la profondeur à chaque changement de route (navigation interne
  // via <Link>/router.push) — jamais au premier chargement de l'app.
  useEffect(() => {
    const isFirstLoad = sessionStorage.getItem(DEPTH_KEY) === null;
    if (isFirstLoad) {
      sessionStorage.setItem(DEPTH_KEY, "0");
    } else {
      const depth = Number(sessionStorage.getItem(DEPTH_KEY) ?? "0") + 1;
      sessionStorage.setItem(DEPTH_KEY, String(depth));
    }
    setCanGoBack(Number(sessionStorage.getItem(DEPTH_KEY) ?? "0") > 0);
  }, [pathname]);

  // Pas de bouton sur l'accueil (rien "au-dessus"), ni hors PWA.
  // (usePathname de next-intl renvoie le chemin SANS préfixe de locale.)
  if (!standalone || pathname === "/") return null;

  const handleBack = () => {
    if (canGoBack) {
      // Redescend la profondeur AVANT de naviguer : l'effet ci-dessus la
      // recalculera sur la nouvelle route, mais ça évite un flash "0" visible.
      const depth = Math.max(0, Number(sessionStorage.getItem(DEPTH_KEY) ?? "0") - 1);
      sessionStorage.setItem(DEPTH_KEY, String(depth));
      router.back();
    } else {
      router.push("/");
    }
  };

  return (
    <button
      type="button"
      onClick={handleBack}
      aria-label={t("go_back")}
      className="app-back-btn"
    >
      ←
    </button>
  );
}
