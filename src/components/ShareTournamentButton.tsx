"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

/**
 * Partage d'un tournoi : feuille de partage native (mobile) si dispo, sinon
 * copie du lien. Le lien est sans préfixe de langue : chacun l'ouvre dans la
 * sienne.
 */
export function ShareTournamentButton({ path, title }: { path: string; title: string }) {
  const t = useTranslations("tournament");
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    const url = `${window.location.origin}${path}`;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (e) {
        if ((e as DOMException)?.name === "AbortError") return; // partage annulé
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt(t("share_copy_prompt"), url);
    }
  }

  const label = copied ? t("share_copied") : t("share");
  return (
    <button type="button" onClick={handleClick} className={`follow-btn share-btn${copied ? " follow-btn--active" : ""}`} title={label} aria-label={label}>
      {copied ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
      )}
      {copied && <span className="share-btn__toast" role="status">{t("share_copied")}</span>}
    </button>
  );
}
