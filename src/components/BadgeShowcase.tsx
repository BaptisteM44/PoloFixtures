"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { BadgeInfo } from "@/lib/badge-catalog";

const CATEGORY_ORDER = ["performance", "team", "organization", "engagement", "social", "secret"];

const RARITY_COLOR: Record<string, string> = {
  legendary: "#d4a017",
  mythic: "#a855f7",
  epic: "#c084fc",
  rare: "var(--teal)",
  common: "var(--text-muted)",
};

function BadgeRow({
  info,
  description,
  earned,
  pinned,
  canPin,
  onTogglePin,
}: {
  info: BadgeInfo;
  description: string;
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
      {info.iconUrl ? (
        <img src={info.iconUrl} alt={info.name} width={20} height={20} style={{ imageRendering: "pixelated" }} />
      ) : (
        <span style={{ fontSize: 20, lineHeight: 1 }}>{info.emoji}</span>
      )}
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
          {description}
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
  catalog,
  onTogglePin,
  playerId,
  onRefresh,
}: {
  earnedBadges: string[];
  pinnedBadges: string[];
  catalog: Record<string, BadgeInfo>;
  onTogglePin?: (badgeId: string) => void;
  playerId?: string;
  onRefresh?: () => Promise<void>;
}) {
  const t = useTranslations("badges");
  const [expanded, setExpanded] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [recalcResult, setRecalcResult] = useState<number | null>(null);

  const handleRecalculate = async () => {
    if (!playerId || recalculating) return;
    setRecalculating(true);
    setRecalcResult(null);
    const res = await fetch(`/api/players/${playerId}/badges`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setRecalcResult(data.newCount ?? 0);
      await onRefresh?.();
    }
    setRecalculating(false);
  };

  const earnedSet = new Set(earnedBadges);
  const total = Object.keys(catalog).length;
  const count = earnedBadges.length;

  const categories = CATEGORY_ORDER.map((cat) => {
    const all = Object.values(catalog).filter((b) => b.category === cat);
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
      <div className="badges-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Badges</h2>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 20, border: "2px solid var(--border)", color: "var(--text-muted)" }}>
            {count} / {total}
          </span>
          {onTogglePin && (
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              · {t("pinned_count", { count: pinnedBadges.length })}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {playerId && onRefresh && (
            <button
              type="button"
              className="ghost"
              style={{ fontSize: 13, padding: "4px 12px" }}
              onClick={handleRecalculate}
              disabled={recalculating}
            >
              {recalculating ? "…" : recalcResult !== null ? t("recalculate_done", { count: recalcResult }) : t("btn_recalculate")}
            </button>
          )}
          <button
            type="button"
            className="ghost"
            style={{ fontSize: 13, padding: "4px 12px" }}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? t("btn_collapse") : t("btn_see_all")}
          </button>
        </div>
      </div>

      {/* ── No badges yet ── */}
      {count === 0 && !expanded && (
        <div className="panel">
          <p style={{ color: "var(--text-muted)", fontSize: 14, margin: 0 }}>
            {t("empty")}
          </p>
        </div>
      )}

      {/* ── Category panels ── */}
      <div style={{ display: "grid", gap: 16 }}>
        {visibleCategories.map(({ cat, earned, locked }) => (
          <div key={cat} className="panel" style={{ padding: "16px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontFamily: "var(--font-display)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                {t(`category_${cat}`)}
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
                  description={t.has(info.id as never) ? t(info.id as never) : info.description}
                  earned
                  pinned={pinnedBadges.includes(info.id)}
                  canPin={!pinnedBadges.includes(info.id) && pinnedBadges.length < 5}
                  onTogglePin={onTogglePin ? () => onTogglePin(info.id) : undefined}
                />
              ))}

              {expanded &&
                locked.map((info) => (
                  <BadgeRow
                    key={info.id}
                    info={info}
                    description={info.description === "???" ? "???" : (t.has(info.id as never) ? t(info.id as never) : info.description)}
                    earned={false}
                    pinned={false}
                  />
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
