"use client";

import { useState } from "react";

/**
 * Boutons de copie des URL d'overlay (une par terrain) pour OBS, avec :
 *  - un réglage "Feed d'événements" (côtés / masqué) répercuté dans l'URL
 *    copiée via ?feed=off ;
 *  - un feedback visuel "Copié ✓" au clic.
 */
export function OverlayLinks({
  tournamentIdOrSlug,
  courtsCount,
}: {
  tournamentIdOrSlug: string;
  courtsCount: number;
}) {
  const [showFeed, setShowFeed] = useState(true);
  const [copiedCourt, setCopiedCourt] = useState<number | null>(null);

  const buildUrl = (court: number) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const feedParam = showFeed ? "" : "&feed=off";
    return `${origin}/fr/tournament/${tournamentIdOrSlug}/overlay?court=${court}&theme=dark${feedParam}`;
  };

  const copy = async (court: number) => {
    try {
      await navigator.clipboard.writeText(buildUrl(court));
      setCopiedCourt(court);
      window.setTimeout(() => setCopiedCourt((c) => (c === court ? null : c)), 1800);
    } catch {
      /* clipboard indisponible : on ignore silencieusement */
    }
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, marginBottom: 10, cursor: "pointer" }}>
        <input type="checkbox" checked={showFeed} onChange={(e) => setShowFeed(e.target.checked)} />
        Feed d&apos;événements (buts / pénalités sur les côtés)
      </label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {Array.from({ length: courtsCount || 1 }, (_, i) => {
          const court = i + 1;
          const isCopied = copiedCourt === court;
          return (
            <button
              key={i}
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={() => copy(court)}
              style={{ fontSize: 12, minWidth: 96, color: isCopied ? "var(--success, green)" : undefined }}
            >
              {isCopied ? "✓ Copié" : `🎬 Court ${court}`}
            </button>
          );
        })}
      </div>
    </div>
  );
}
