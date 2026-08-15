"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { FullPageState } from "@/components/FullPageState";

/**
 * Error boundary localisée : capture les erreurs de rendu sous /[locale] et
 * affiche un état propre (au lieu d'une page blanche), avec un bouton Réessayer
 * (reset() re-render le segment) et un retour accueil.
 */
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");

  useEffect(() => {
    // Trace côté serveur/monitoring (le digest permet de retrouver l'erreur dans les logs).
    console.error("[app error]", error?.digest ?? "", error);
  }, [error]);

  return (
    <FullPageState
      emoji="🛠️"
      title={t("error_title")}
      description={t("error_desc")}
      actions={
        <>
          <button type="button" className="primary" onClick={() => reset()}>
            {t("btn_retry")}
          </button>
          <Link href="/" className="ghost">{t("btn_home")}</Link>
        </>
      }
    />
  );
}
