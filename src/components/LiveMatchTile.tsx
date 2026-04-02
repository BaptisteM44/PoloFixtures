"use client";

import { useEffect, useRef, useState } from "react";
import { type MatchEvent } from "@prisma/client";
import { useTranslations } from "next-intl";
import { type MatchWithTeams } from "./ScheduleBoard";
import { formatTime } from "@/lib/utils";

const PHASE_LABEL: Record<string, string> = {
  POOL: "Poule",
  SWISS: "Swiss",
  BRACKET: "Tableau",
};

type EnrichedMatch = MatchWithTeams & { events: MatchEvent[] };

function fmtClock(sec: number) {
  const s = Math.max(0, sec);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Reconstruit l'état du chrono depuis les events START/PAUSE.
 * Retourne { clockSec, paused } en tenant compte du temps réel écoulé.
 */
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
    } else if (e.type === "PAUSE") {
      clockSec = e.matchClockSec;
      paused = true;
    } else if (e.type === "END") {
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

/** Calcule le résumé des events pour affichage rapide */
function buildMatchStats(match: EnrichedMatch) {
  const goalsByTeam: Record<string, { count: number; scorers: string[] }> = {};
  const penaltiesByTeam: Record<string, { count: number; players: string[] }> = {};

  for (const e of match.events ?? []) {
    const p = e.payload as Record<string, unknown>;
    const teamId = String(p.teamId ?? "");
    const playerId = String(p.playerId ?? "");
    const delta = Number(p.delta ?? 1);

    if ((e.type === "GOAL" || e.type === "GOLDEN_GOAL") && teamId) {
      if (!goalsByTeam[teamId]) goalsByTeam[teamId] = { count: 0, scorers: [] };
      goalsByTeam[teamId].count += delta;
      if (playerId && playerId !== "undefined") goalsByTeam[teamId].scorers.push(playerId);
    }
    if (e.type === "PENALTY" && teamId) {
      if (!penaltiesByTeam[teamId]) penaltiesByTeam[teamId] = { count: 0, players: [] };
      penaltiesByTeam[teamId].count += delta;
      if (playerId && playerId !== "undefined") penaltiesByTeam[teamId].players.push(playerId);
    }
  }

  // Derniers events pertinents (hors START/PAUSE/TIME_ADJUST)
  const notable = [...(match.events ?? [])]
    .filter((e) => ["GOAL", "GOLDEN_GOAL", "PENALTY", "TIMEOUT"].includes(e.type))
    .slice(-5)
    .reverse();

  return { goalsByTeam, penaltiesByTeam, notable };
}

function eventIcon(type: string) {
  if (type === "GOAL") return "⚽";
  if (type === "GOLDEN_GOAL") return "🥇";
  if (type === "PENALTY") return "⚠️";
  if (type === "TIMEOUT") return "⏸";
  return "•";
}

/** Carte LIVE enrichie avec chrono + events */
function LiveCard({
  match,
  gameDurationMin,
  teamNames,
}: {
  match: EnrichedMatch;
  gameDurationMin: number;
  teamNames: Record<string, string>;
}) {
  const gameDurSec = gameDurationMin * 60;

  // Seed depuis reconstruction des events (tient compte de l'heure réelle)
  const getInitialClock = () => computeClockFromEvents(match.events ?? []);
  const [clockSec, setClockSec] = useState(() => getInitialClock().clockSec);
  const [paused, setPaused] = useState(() => getInitialClock().paused);

  // Recalculer quand les events changent (nouvel event SSE : START, PAUSE, GOAL…)
  const lastEvtId = match.events?.[match.events.length - 1]?.id;
  useEffect(() => {
    const { clockSec: c, paused: p } = computeClockFromEvents(match.events ?? []);
    setClockSec(c);
    setPaused(p);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEvtId, match.id]);

  // Timer local — tourne uniquement si non pausé et LIVE
  useEffect(() => {
    if (paused || match.status !== "LIVE") return;
    const interval = setInterval(() => setClockSec((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [paused, match.status, match.id]);

  const displaySec = Math.max(0, gameDurSec - clockSec);
  const isOvertime = clockSec >= gameDurSec;

  const clockColor = isOvertime
    ? "var(--danger)"
    : displaySec < 60
    ? "var(--danger)"
    : displaySec < 120
    ? "#f59e0b"
    : "var(--teal)";

  const { notable, penaltiesByTeam } = buildMatchStats(match);

  const teamAId = match.teamAId ?? "";
  const teamBId = match.teamBId ?? "";
  const penA = penaltiesByTeam[teamAId]?.count ?? 0;
  const penB = penaltiesByTeam[teamBId]?.count ?? 0;

  return (
    <div className="match-card match-card--live match-card--detailed">
      {/* Header */}
      <div className="match-card__header">
        <span className="pill">{match.courtName}</span>
        <span className="match-card__clock" style={{ color: clockColor, fontVariantNumeric: "tabular-nums" }}>
          {isOvertime ? `+${fmtClock(clockSec - gameDurSec)}` : fmtClock(displaySec)}
        </span>
        <span className="match-card__status--live">🔴 Live</span>
      </div>

      {/* Score principal */}
      <div className="match-card__center">
        <div className={`match-card__team${match.winnerTeamId === teamAId ? " match-winner" : ""}`}>
          {match.teamA?.name ?? "TBD"}
          {penA > 0 && <span className="match-card__pen">⚠️{penA}</span>}
        </div>
        <div className="match-card__score">
          <span>{match.scoreA}</span>
          <span style={{ opacity: 0.4, fontSize: 14 }}>–</span>
          <span>{match.scoreB}</span>
        </div>
        <div className={`match-card__team${match.winnerTeamId === teamBId ? " match-winner" : ""}`}>
          {match.teamB?.name ?? "TBD"}
          {penB > 0 && <span className="match-card__pen">⚠️{penB}</span>}
        </div>
      </div>

      {/* Events récents */}
      {notable.length > 0 && (
        <div className="match-card__events">
          {notable.map((e) => {
            const ep = e.payload as Record<string, unknown>;
            const teamId = String(ep.teamId ?? "");
            const teamName = teamNames[teamId] ?? teamId;
            const playerName = String(ep.playerName ?? ep.playerId ?? "");
            return (
              <div key={e.id} className="match-card__event-row">
                <span className="match-card__event-time">{fmtClock(e.matchClockSec)}</span>
                <span>{eventIcon(e.type as string)}</span>
                <span className="match-card__event-team">{teamName}</span>
                {playerName && playerName !== "undefined" && (
                  <span className="match-card__event-player">{playerName}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <div className="match-card__footer">
        <span className="pill">{PHASE_LABEL[match.phase] ?? match.phase} R{match.roundIndex + 1}</span>
        {match.goldenGoal && <span style={{ fontSize: 11, fontWeight: 700, color: "var(--yellow)" }}>🥇 But en or</span>}
      </div>
    </div>
  );
}

export function LiveMatchTile({
  tournamentId,
  initialMatches,
  gameDurationMin = 12,
  isLive = false,
}: {
  tournamentId: string;
  initialMatches: MatchWithTeams[];
  gameDurationMin?: number;
  isLive?: boolean;
}) {
  const t = useTranslations("tournament");
  const [matches, setMatches] = useState<EnrichedMatch[]>(
    initialMatches.map((m) => ({ ...m, events: (m.events ?? []) as MatchEvent[] }))
  );

  const STATUS_LABEL: Record<string, string> = {
    SCHEDULED: t("status_scheduled"),
    LIVE: t("status_live_icon"),
    FINISHED: t("status_finished_icon"),
  };

  // Noms des équipes pour les events
  const teamNames: Record<string, string> = {};
  matches.forEach((m) => {
    if (m.teamAId && m.teamA?.name) teamNames[m.teamAId] = m.teamA.name;
    if (m.teamBId && m.teamB?.name) teamNames[m.teamBId] = m.teamB.name;
  });

  // SSE listener
  useEffect(() => {
    if (!isLive) return;
    const es = new EventSource(`/api/sse?tournamentId=${tournamentId}`);
    es.addEventListener("match", (event) => {
      const payload = JSON.parse((event as MessageEvent).data);

      if (payload?.type === "new_matches" && Array.isArray(payload.matches)) {
        setMatches((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const newOnes = (payload.matches as MatchWithTeams[])
            .filter((m) => !existingIds.has(m.id))
            .map((m) => ({ ...m, events: [] as MatchEvent[] }));
          return newOnes.length > 0 ? [...prev, ...newOnes] : prev;
        });
        return;
      }

      if (payload?.data) {
        const updatedMatch: Partial<MatchWithTeams> = payload.data.match ?? payload.data;
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
  }, [tournamentId, isLive]);

  const liveMatches = matches.filter((m) => m.status === "LIVE");
  const upcomingMatches = matches
    .filter((m) => m.status === "SCHEDULED")
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

  const slotsLeft = Math.max(0, 3 - liveMatches.length);
  const upcomingToShow = upcomingMatches.slice(0, slotsLeft);

  if (liveMatches.length === 0 && upcomingToShow.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 80 }}>
        <p className="meta" style={{ margin: 0, textAlign: "center" }}>
          Aucun match en cours ou à venir
        </p>
      </div>
    );
  }

  return (
    <div className="live-match-tile">
      <h3 style={{ marginBottom: 12 }}>
        {liveMatches.length > 0 ? t("live_and_upcoming") : t("next_matches")}
      </h3>
      <div className="live-match-tile__list">
        {/* Cartes LIVE enrichies */}
        {liveMatches.map((match) => (
          <LiveCard
            key={match.id}
            match={match}
            gameDurationMin={gameDurationMin}
            teamNames={teamNames}
          />
        ))}

        {/* Cartes scheduled classiques */}
        {upcomingToShow.map((match) => (
          <div key={match.id} className="match-card match-card--scheduled">
            <div className="match-card__corner match-card__corner--tl">
              <span className="pill">{match.courtName}</span>
            </div>
            <div className="match-card__corner match-card__corner--tr">
              <span>{formatTime(match.startAt)}</span>
            </div>
            <div className="match-card__center">
              <div className="match-card__team">{match.teamA?.name ?? "TBD"}</div>
              <div className="match-card__score">
                <span style={{ opacity: 0.4, fontSize: 14 }}>vs</span>
              </div>
              <div className="match-card__team">{match.teamB?.name ?? "TBD"}</div>
            </div>
            <div className="match-card__corner match-card__corner--bl">
              <span className="pill">{PHASE_LABEL[match.phase] ?? match.phase} R{match.roundIndex + 1}</span>
            </div>
            <div className="match-card__corner match-card__corner--br">
              <span>{STATUS_LABEL[match.status]}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
