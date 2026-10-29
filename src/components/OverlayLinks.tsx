"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { copyText } from "@/lib/ui/copy-text";

/**
 * Overlay stream (OBS) : un lien par terrain, à ajouter comme « Source
 * navigateur » dans OBS — score et chrono par-dessus la vidéo. Chaque ligne
 * montre l'adresse, un bouton Copier (avec confirmation) et un Aperçu.
 * Réglage « feed d'événements » répercuté dans l'URL (?feed=off).
 */
export function OverlayLinks({
  tournamentIdOrSlug,
  courtsCount,
}: {
  tournamentIdOrSlug: string;
  courtsCount: number;
}) {
  const t = useTranslations("tournament");
  const locale = useLocale();
  const [showFeed, setShowFeed] = useState(true);
  const [copiedCourt, setCopiedCourt] = useState<number | null>(null);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const buildUrl = (court: number) =>
    `${origin}/${locale}/tournament/${tournamentIdOrSlug}/overlay?court=${court}&theme=dark${showFeed ? "" : "&feed=off"}`;

  const copy = async (court: number) => {
    if (!(await copyText(buildUrl(court)))) return;
    setCopiedCourt(court);
    window.setTimeout(() => setCopiedCourt((c) => (c === court ? null : c)), 1800);
  };

  return (
    <div className="overlay-links">
      <ul className="overlay-links__list">
        {Array.from({ length: courtsCount || 1 }, (_, i) => {
          const court = i + 1;
          const isCopied = copiedCourt === court;
          return (
            <li key={court} className="overlay-links__row">
              <strong>{t("overlay_court", { n: court })}</strong>
              <code title={buildUrl(court)}>…/overlay?court={court}{showFeed ? "" : "&feed=off"}</code>
              <span className="overlay-links__actions">
                <button type="button" className={isCopied ? "primary" : "ghost"} onClick={() => copy(court)}>
                  {isCopied ? `✓ ${t("overlay_copied")}` : `📋 ${t("overlay_copy")}`}
                </button>
                <a className="ghost" href={buildUrl(court)} target="_blank" rel="noreferrer">{t("overlay_preview")} ↗</a>
              </span>
            </li>
          );
        })}
      </ul>
      <label className="overlay-links__feed">
        <input type="checkbox" checked={showFeed} onChange={(e) => setShowFeed(e.target.checked)} />
        {t("overlay_feed_label")}
      </label>
    </div>
  );
}
