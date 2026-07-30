"use client";

import { MatchEvent } from "@prisma/client";
import { useTranslations } from "next-intl";

type RecapPayload = {
  teamId?: string;
  playerId?: string;
  delta?: number;
  timeoutType?: "normal" | "mechanical";
};

function formatClock(sec: number) {
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export function MatchRecapModal({
  teamAId,
  teamBId,
  teamAName,
  teamBName,
  events,
  playerNames,
  onClose,
}: {
  teamAId: string | null;
  teamBId: string | null;
  teamAName: string;
  teamBName: string;
  events: MatchEvent[];
  /** playerId → nom, pour résoudre buteurs/fautifs affichés dans le récap. */
  playerNames: Map<string, string>;
  onClose: () => void;
}) {
  const t = useTranslations("tournament");

  // Chronologie : uniquement les événements de jeu, dans l'ordre du match
  const relevant = events
    .filter((e) => ["GOAL", "GOLDEN_GOAL", "PENALTY", "TIMEOUT"].includes(e.type))
    .sort((a, b) => a.matchClockSec - b.matchClockSec);

  const teamLabel = (teamId?: string) => (teamId === teamAId ? teamAName : teamId === teamBId ? teamBName : "?");

  const iconFor = (e: MatchEvent) => {
    if (e.type === "GOAL") return "⚽";
    if (e.type === "GOLDEN_GOAL") return "🌟";
    if (e.type === "PENALTY") return "🟨";
    return "⏱️";
  };

  const labelFor = (e: MatchEvent) => {
    const p = (e.payload ?? {}) as RecapPayload;
    const team = teamLabel(p.teamId);
    const playerName = p.playerId ? playerNames.get(p.playerId) : undefined;

    if (e.type === "GOAL" || e.type === "GOLDEN_GOAL") {
      const scorer = playerName ? ` — ${playerName}` : "";
      return e.type === "GOLDEN_GOAL"
        ? `${t("recap_golden_goal", { team })}${scorer}`
        : `${t("recap_goal", { team })}${scorer}`;
    }
    if (e.type === "PENALTY") {
      const isCancel = (p.delta ?? 1) < 0;
      const who = playerName ? ` — ${playerName}` : "";
      return isCancel ? `${t("recap_penalty_cancel", { team })}${who}` : `${t("recap_penalty", { team })}${who}`;
    }
    if (e.type === "TIMEOUT") {
      const isCancel = (p.delta ?? 1) < 0;
      const kind = p.timeoutType === "mechanical" ? t("recap_timeout_mechanical") : t("recap_timeout_normal");
      return isCancel ? t("recap_timeout_cancel", { team }) : `${t("recap_timeout", { team })} (${kind})`;
    }
    return e.type;
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="panel"
        style={{ maxWidth: 440, width: "100%", maxHeight: "80vh", overflowY: "auto", position: "relative" }}
      >
        <button
          type="button"
          onClick={onClose}
          className="ghost"
          style={{ position: "absolute", top: 10, right: 10, fontSize: 18, padding: "2px 10px" }}
        >
          ×
        </button>

        <h3 style={{ marginBottom: 2, paddingRight: 30 }}>{t("recap_title")}</h3>
        <p className="meta" style={{ marginBottom: 16 }}>{teamAName} vs {teamBName}</p>

        {relevant.length === 0 ? (
          <p className="meta">{t("recap_empty")}</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {relevant.map((e) => (
              <div
                key={e.id}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 10px", borderRadius: 8,
                  background: "var(--surface-alt, rgba(0,0,0,0.03))",
                  fontSize: 13,
                }}
              >
                <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600, color: "var(--text-muted)", minWidth: 42 }}>
                  {formatClock(e.matchClockSec)}
                </span>
                <span style={{ fontSize: 15 }}>{iconFor(e)}</span>
                <span style={{ flex: 1 }}>{labelFor(e)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
