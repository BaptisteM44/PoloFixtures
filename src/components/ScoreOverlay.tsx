"use client";

import { useEffect, useState } from "react";
import { type MatchEvent } from "@prisma/client";

type OverlayMatch = {
  id: string;
  courtName: string;
  status: string;
  scoreA: number;
  scoreB: number;
  goldenGoal: boolean;
  teamAId: string | null;
  teamBId: string | null;
  teamA?: { id: string; name: string } | null;
  teamB?: { id: string; name: string } | null;
  events: MatchEvent[];
};

function computeClockFromEvents(events: MatchEvent[]): { clockSec: number; paused: boolean } {
  let clockSec = 0;
  let lastStartSec = 0;
  let lastStartReal = 0;
  let paused = true;

  for (const e of events) {
    const t = new Date(e.createdAt as unknown as string).getTime();
    if (e.type === "START") {
      lastStartSec = e.matchClockSec;
      lastStartReal = t;
      paused = false;
    } else if (e.type === "PAUSE" || e.type === "END") {
      clockSec = e.matchClockSec;
      paused = true;
    }
  }

  if (!paused && lastStartReal > 0) {
    const elapsed = Math.floor((Date.now() - lastStartReal) / 1000);
    clockSec = lastStartSec + elapsed;
  }

  return { clockSec, paused };
}

function fmtClock(sec: number) {
  const s = Math.max(0, sec);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s) % 60).padStart(2, "0")}`;
}

export function ScoreOverlay({
  tournamentId,
  tournamentName,
  initialMatches,
  gameDurationMin,
  court,
  theme,
}: {
  tournamentId: string;
  tournamentName: string;
  initialMatches: OverlayMatch[];
  gameDurationMin: number;
  court: string;
  theme: string;
}) {
  const [matches, setMatches] = useState<OverlayMatch[]>(initialMatches);

  // Find the current match on the specified court
  const courtName = `Court ${court}`;
  const liveMatch = matches.find((m) => m.status === "LIVE" && m.courtName === courtName);
  const scheduledMatch = matches.find((m) => m.status === "SCHEDULED" && m.courtName === courtName);
  const currentMatch = liveMatch ?? scheduledMatch;

  // Clock state
  const getInitialClock = () =>
    currentMatch ? computeClockFromEvents(currentMatch.events ?? []) : { clockSec: 0, paused: true };
  const [clockSec, setClockSec] = useState(() => getInitialClock().clockSec);
  const [paused, setPaused] = useState(() => getInitialClock().paused);

  // Recalculate when match or events change
  const lastEvtId = currentMatch?.events?.[currentMatch.events.length - 1]?.id;
  useEffect(() => {
    if (!currentMatch) return;
    const { clockSec: c, paused: p } = computeClockFromEvents(currentMatch.events ?? []);
    setClockSec(c);
    setPaused(p);
  }, [lastEvtId, currentMatch?.id]);

  // Local timer tick
  useEffect(() => {
    if (paused || !currentMatch || currentMatch.status !== "LIVE") return;
    const interval = setInterval(() => setClockSec((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [paused, currentMatch?.id, currentMatch?.status]);

  // SSE listener
  useEffect(() => {
    const es = new EventSource(`/api/sse?tournamentId=${tournamentId}`);
    es.addEventListener("match", (event) => {
      const payload = JSON.parse((event as MessageEvent).data);

      if (payload?.type === "new_matches" && Array.isArray(payload.matches)) {
        setMatches((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const newOnes = (payload.matches as OverlayMatch[])
            .filter((m) => !existingIds.has(m.id))
            .map((m) => ({ ...m, events: [] as MatchEvent[] }));
          return newOnes.length > 0 ? [...prev, ...newOnes] : prev;
        });
        return;
      }

      if (payload?.data) {
        const updatedMatch = payload.data.match ?? payload.data;
        const newEvent: MatchEvent | undefined = payload.data.event;

        if (updatedMatch.id) {
          setMatches((prev) =>
            prev.map((m) => {
              if (m.id !== updatedMatch.id) return m;
              const updatedEvents = newEvent
                ? [...m.events.filter((e) => e.id !== newEvent.id), newEvent]
                : m.events;
              return { ...m, ...updatedMatch, events: updatedEvents };
            })
          );
        }
      }
    });
    return () => es.close();
  }, [tournamentId]);

  // Swap sides: count SWAP_SIDES events — odd = swapped
  const sidesSwapped = currentMatch
    ? (currentMatch.events ?? []).filter((e) => e.type === "SWAP_SIDES").length % 2 === 1
    : false;

  const displayTeamA = sidesSwapped ? currentMatch?.teamB : currentMatch?.teamA;
  const displayTeamB = sidesSwapped ? currentMatch?.teamA : currentMatch?.teamB;
  const displayScoreA = sidesSwapped ? currentMatch?.scoreB : currentMatch?.scoreA;
  const displayScoreB = sidesSwapped ? currentMatch?.scoreA : currentMatch?.scoreB;

  // Recent events for this match
  const recentEvents = currentMatch
    ? [...(currentMatch.events ?? [])]
        .filter((e) => ["GOAL", "GOLDEN_GOAL", "PENALTY"].includes(e.type))
        .slice(-3)
        .reverse()
    : [];

  const gameDurSec = gameDurationMin * 60;
  const displaySec = Math.max(0, gameDurSec - clockSec);
  const isOvertime = clockSec >= gameDurSec;
  const isLive = currentMatch?.status === "LIVE";

  const isDark = theme === "dark";

  return (
    <>
      {/* Hide header, footer, and page padding for clean overlay */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            header, footer, .site-footer { display: none !important; }
            main.page { padding: 0 !important; margin: 0 !important; min-height: auto !important; }
            body { background: transparent !important; overflow: hidden !important; margin: 0 !important; }
            html { background: transparent !important; }
          `,
        }}
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start",
          paddingTop: "24px",
          minHeight: "100vh",
          fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
          background: "transparent",
        }}
      >
          {!currentMatch ? (
            <div
              style={{
                padding: "16px 32px",
                borderRadius: 12,
                background: isDark ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.9)",
                color: isDark ? "#fff" : "#111",
                fontSize: 18,
                fontWeight: 600,
              }}
            >
              Aucun match sur {courtName}
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 0,
                minWidth: 520,
                borderRadius: 12,
                overflow: "hidden",
                boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
              }}
            >
              {/* Header bar */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "6px 16px",
                  background: isDark ? "#1a1a2e" : "#e2e8f0",
                  color: isDark ? "#94a3b8" : "#64748b",
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                }}
              >
                <span>{courtName}</span>
                <span>{tournamentName}</span>
              </div>

              {/* Main scoreboard */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 0,
                  background: isDark ? "rgba(15,15,30,0.95)" : "rgba(255,255,255,0.95)",
                }}
              >
                {/* Team A */}
                <div
                  style={{
                    flex: 1,
                    padding: "20px 24px",
                    textAlign: "center",
                    color: isDark ? "#fff" : "#111",
                  }}
                >
                  <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.2 }}>
                    {displayTeamA?.name ?? "TBD"}
                  </div>
                </div>

                {/* Score */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "16px 20px",
                  }}
                >
                  <span
                    style={{
                      fontSize: 56,
                      fontWeight: 900,
                      color: isDark ? "#fff" : "#111",
                      fontVariantNumeric: "tabular-nums",
                      minWidth: 48,
                      textAlign: "center",
                    }}
                  >
                    {isLive ? displayScoreA : "-"}
                  </span>
                  <span
                    style={{
                      fontSize: 32,
                      fontWeight: 300,
                      color: isDark ? "#475569" : "#cbd5e1",
                    }}
                  >
                    :
                  </span>
                  <span
                    style={{
                      fontSize: 56,
                      fontWeight: 900,
                      color: isDark ? "#fff" : "#111",
                      fontVariantNumeric: "tabular-nums",
                      minWidth: 48,
                      textAlign: "center",
                    }}
                  >
                    {isLive ? displayScoreB : "-"}
                  </span>
                </div>

                {/* Team B */}
                <div
                  style={{
                    flex: 1,
                    padding: "20px 24px",
                    textAlign: "center",
                    color: isDark ? "#fff" : "#111",
                  }}
                >
                  <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.2 }}>
                    {displayTeamB?.name ?? "TBD"}
                  </div>
                </div>
              </div>

              {/* Timer bar */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: 12,
                  padding: "8px 16px",
                  background: isDark
                    ? isOvertime
                      ? "#7f1d1d"
                      : "#0f172a"
                    : isOvertime
                    ? "#fecaca"
                    : "#f1f5f9",
                }}
              >
                {isLive && (
                  <span
                    style={{
                      display: "inline-block",
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "#ef4444",
                      animation: "pulse-dot 1.5s ease-in-out infinite",
                    }}
                  />
                )}
                <span
                  style={{
                    fontSize: 28,
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                    color: isOvertime
                      ? "#ef4444"
                      : displaySec < 60
                      ? "#ef4444"
                      : displaySec < 120
                      ? "#f59e0b"
                      : isDark
                      ? "#22d3ee"
                      : "#0891b2",
                  }}
                >
                  {!isLive
                    ? "A venir"
                    : isOvertime
                    ? `+${fmtClock(clockSec - gameDurSec)}`
                    : fmtClock(displaySec)}
                </span>
                {currentMatch.goldenGoal && (
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#eab308" }}>BUT EN OR</span>
                )}
              </div>

              {/* Recent events */}
              {recentEvents.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    gap: 16,
                    padding: "6px 16px",
                    background: isDark ? "rgba(15,15,30,0.9)" : "rgba(241,245,249,0.9)",
                    fontSize: 13,
                    color: isDark ? "#94a3b8" : "#64748b",
                  }}
                >
                  {recentEvents.map((e) => {
                    const p = e.payload as Record<string, unknown>;
                    const icon = e.type === "GOAL" ? "\u26BD" : e.type === "GOLDEN_GOAL" ? "\uD83E\uDD47" : "\u26A0\uFE0F";
                    const playerName = String(p.playerName ?? "");
                    return (
                      <span key={e.id}>
                        {icon} {fmtClock(e.matchClockSec)}
                        {playerName ? ` ${playerName}` : ""}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes pulse-dot {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.3; }
            }
          `,
        }}
      />
    </>
  );
}
