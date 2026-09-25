"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

const DISCUSSION_URL = "https://poloverse.net/t/towards-a-mixed-gender-euros/4797/31";
// Fermé = ne revient plus (même logique que l'encart d'installation de la home).
const DISMISS_KEY = "euros_vote_banner_dismissed";

export function EurosVoteBanner() {
  const t = useTranslations("home");
  const [dismissed, setDismissed] = useState(true); // masqué tant qu'on n'a pas vérifié le localStorage (évite un flash)

  useEffect(() => {
    try { setDismissed(localStorage.getItem(DISMISS_KEY) === "1"); } catch { setDismissed(false); }
  }, []);

  const dismiss = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* navigation privée */ }
    setDismissed(true);
  }, []);

  if (dismissed) return null;

  return (
    <a
      href={DISCUSSION_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="euros-vote-banner"
    >
      <span className="euros-vote-banner__icon" aria-hidden>🗳️</span>
      <span className="euros-vote-banner__text">
        <strong>{t("euros_vote_title")}</strong> {t("euros_vote_body")}
      </span>
      <span className="euros-vote-banner__cta">{t("euros_vote_cta")} →</span>
      <button
        type="button"
        className="euros-vote-banner__close"
        onClick={dismiss}
        aria-label={t("euros_vote_dismiss")}
        title={t("euros_vote_dismiss")}
      >
        ✕
      </button>
    </a>
  );
}
