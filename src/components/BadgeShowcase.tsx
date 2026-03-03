"use client";

import { useState } from "react";
import { BADGE_CATALOG, type BadgeInfo } from "@/lib/badge-catalog";

const CATEGORY_LABELS: Record<string, string> = {
  performance: "⚡ Performance",
  team: "🤝 Équipe",
  organization: "🏗️ Organisation",
  engagement: "🌐 Engagement",
  social: "🎉 Social",
  secret: "🔮 Secret",
};

const CATEGORY_ORDER = ["performance", "team", "organization", "engagement", "social", "secret"];

const RARITY_COLOR: Record<string, string> = {
  legendary: "var(--yellow)",
  epic: "#c084fc",
  rare: "var(--teal)",
  common: "var(--text-muted)",
};

function BadgeRow({
  info,
  earned,
  pinned,
  canPin,
  onTogglePin,
}: {
  info: BadgeInfo;
  earned: boolean;
  pinned: boolean;
  canPin?: boolean;
  onTogglePin?: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 10px",
        borderRadius: 8,
        border: `2px solid ${pinned ? "var(--teal)" : earned ? "var(--border)" : "var(--border-light, var(--border))"}`,
        background: pinned
          ? "color-mix(in srgb, var(--teal) 8%, var(--surface))"
          : "var(--surface)",
        opacity: earned ? 1 : 0.4,
        filter: earned ? "none" : "grayscale(1)",
      }}
    >
      <span style={{ fontSize: 20, lineHeight: 1 }}>{info.emoji}</span>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 13, fontFamily: "var(--font-display)", color: earned ? "inherit" : "var(--text-muted)" }}>
            {info.name}
          </span>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", padding: "2px 6px", borderRadius: 4, border: "1.5px solid var(--border)", color: RARITY_COLOR[info.rarity] }}>
            {info.rarity}
          </span>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, marginTop: 1 }}>
          {info.description}
        </p>
      </div>

      {/* Pin button — only in edit mode (onTogglePin provided) and badge earned */}
      {onTogglePin && earned && (
        <button
          type="button"
          onClick={onTogglePin}
          disabled={!pinned && !canPin}
          title={pinned ? "Retirer de la carte" : canPin ? "Épingler sur la carte" : "5 badges max sur la carte"}
          style={{
            fontSize: 10, padding: "4px 8px", borderRadius: 6,
            fontWeight: 700, fontFamily: "var(--font-display)",
            background: pinned ? "var(--teal)" : "transparent",
            border: `2px solid ${pinned ? "var(--teal)" : "var(--border)"}`,
            color: pinned ? "var(--text)" : "var(--text-muted)",
            opacity: !pinned && !canPin ? 0.4 : 1,
            cursor: pinned || canPin ? "pointer" : "not-allowed",
            flexShrink: 0,
          }}
        >
          {pinned ? "✓" : "📌"}
        </button>
      )}
    </div>
  );
}

export function BadgeShowcase({
  earnedBadges,
  pinnedBadges,
  onTogglePin,
}: {
  earnedBadges: string[];
  pinnedBadges: string[];
  onTogglePin?: (badgeId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const earnedSet = new Set(earnedBadges);
  const total = Object.keys(BADGE_CATALOG).length;
  const count = earnedBadges.length;

  const categories = CATEGORY_ORDER.map((cat) => {
    const all = Object.values(BADGE_CATALOG).filter((b) => b.category === cat);
    const earned = all.filter((b) => earnedSet.has(b.id));
    const locked = all.filter((b) => !earnedSet.has(b.id));
    return { cat, earned, locked };
  });

  const visibleCategories = expanded
    ? categories
    : categories.filter((c) => c.earned.length > 0);

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Badges</h2>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 20, border: "2px solid var(--border)", color: "var(--text-muted)" }}>
            {count} / {total}
          </span>
          {onTogglePin && (
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              · {pinnedBadges.length}/5 épinglés sur la carte
            </span>
          )}
        </div>
        <button
          type="button"
          className="ghost"
          style={{ fontSize: 13, padding: "4px 12px" }}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Réduire ▲" : "Voir tous les badges ▼"}
        </button>
      </div>

      {/* ── No badges yet ── */}
      {count === 0 && !expanded && (
        <div className="panel">
          <p style={{ color: "var(--text-muted)", fontSize: 14, margin: 0 }}>
            Aucun badge encore. Joue, organise, explore !
          </p>
        </div>
      )}

      {/* ── Category panels ── */}
      <div style={{ display: "grid", gap: 16 }}>
        {visibleCategories.map(({ cat, earned, locked }) => (
          <div key={cat} className="panel" style={{ padding: "16px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontFamily: "var(--font-display)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                {CATEGORY_LABELS[cat]}
              </h3>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {earned.length} / {earned.length + locked.length}
              </span>
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              {earned.map((info) => (
                <BadgeRow
                  key={info.id}
                  info={info}
                  earned
                  pinned={pinnedBadges.includes(info.id)}
                  canPin={!pinnedBadges.includes(info.id) && pinnedBadges.length < 5}
                  onTogglePin={onTogglePin ? () => onTogglePin(info.id) : undefined}
                />
              ))}

              {expanded &&
                locked.map((info) => (
                  <BadgeRow key={info.id} info={info} earned={false} pinned={false} />
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
