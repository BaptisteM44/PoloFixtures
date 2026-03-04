"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useWakeLock } from "@/lib/useWakeLock";

// ─── Types ────────────────────────────────────────────────────────────────────

type PlayerInfo = { id: string; name: string };
type TeamInfo = { id: string; name: string; color: string | null; players: PlayerInfo[] };
type MatchEvent = { id: string; type: string; matchClockSec: number; payload: Record<string, unknown> };
type MatchInfo = {
  id: string; phase: string; roundIndex: number; courtName: string;
  dayIndex: string; startAt: string; status: string;
  teamAId: string | null; teamBId: string | null;
  teamAName: string | null; teamBName: string | null;
  scoreA: number; scoreB: number; events: MatchEvent[];
};
type TournamentData = {
  id: string; name: string; gameDurationMin: number;
  teams: TeamInfo[]; matches: MatchInfo[];
};

type GoalModal = { teamId: string; teamName: string; delta: number } | null;
type PenaltyModal = { teamId: string; teamName: string; players: PlayerInfo[] } | null;
type TimeoutModal = { teamId: string; teamName: string; type: "normal" | "mechanical" } | null;

const PHASE_LABEL: Record<string, string> = { POOL: "Poule", SWISS: "Swiss", BRACKET: "Tableau" };
const DAY_LABEL: Record<string, string> = { SAT: "Sam", SUN: "Dim" };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtClock(sec: number) {
  const s = Math.max(0, sec);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function matchLabel(m: MatchInfo) {
  const a = m.teamAName ?? "TBD"; const b = m.teamBName ?? "TBD";
  return `${DAY_LABEL[m.dayIndex] ?? m.dayIndex} · ${m.courtName} · ${PHASE_LABEL[m.phase] ?? m.phase} R${m.roundIndex + 1} — ${a} vs ${b}`;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TournamentRefereePanel({
  tournament, canManageRefs,
}: { tournament: TournamentData; canManageRefs: boolean }) {
  // Matches triés : LIVE en premier, puis SCHEDULED, puis FINISHED
  const sortedMatches = useMemo(() => {
    const order: Record<string, number> = { LIVE: 0, SCHEDULED: 1, FINISHED: 2 };
    return [...tournament.matches].sort(
      (a, b) => (order[a.status] ?? 1) - (order[b.status] ?? 1) || a.startAt.localeCompare(b.startAt)
    );
  }, [tournament.matches]);

  const [matchMap, setMatchMap] = useState<Map<string, MatchInfo>>(() => new Map(tournament.matches.map((m) => [m.id, m])));
  const [selectedMatchId, setSelectedMatchId] = useState<string>(() => sortedMatches.find((m) => m.status === "LIVE" || m.status === "SCHEDULED")?.id ?? sortedMatches[0]?.id ?? "");
  const [clockSec, setClockSec] = useState(0);
  const [running, setRunning] = useState(false);
  const [buzzerPlayed, setBuzzerPlayed] = useState(false);
  const [muted, setMuted] = useState(false);
  const [matchEnded, setMatchEnded] = useState(false);

  // Modals
  const [goalModal, setGoalModal] = useState<GoalModal>(null);
  const [penaltyModal, setPenaltyModal] = useState<PenaltyModal>(null);
  const [timeoutModal, setTimeoutModal] = useState<TimeoutModal>(null);
  const [timeoutTimer, setTimeoutTimer] = useState<{ sec: number; label: string } | null>(null);

  const lastMatchId = useRef<string>("");

  // Garder l'écran allumé tant que running
  useWakeLock(running || !!timeoutTimer);

  const selectedMatch = matchMap.get(selectedMatchId) ?? null;
  const gameDurSec = tournament.gameDurationMin * 60;
  const displaySec = Math.max(0, gameDurSec - clockSec);

  // Sync état à chaque changement de match sélectionné
  useEffect(() => {
    if (!selectedMatchId || lastMatchId.current === selectedMatchId) return;
    lastMatchId.current = selectedMatchId;
    const m = matchMap.get(selectedMatchId);
    if (!m) return;
    const lastEvt = m.events[m.events.length - 1];
    setClockSec(lastEvt?.matchClockSec ?? 0);
    setRunning(m.status === "LIVE");
    setBuzzerPlayed(false);
    setMatchEnded(m.status === "FINISHED");
  }, [selectedMatchId, matchMap]);

  // Timer principal
  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => setClockSec((prev) => prev + 1), 1000);
    return () => clearInterval(interval);
  }, [running]);

  // Timer timeout (overlay)
  useEffect(() => {
    if (!timeoutTimer) return;
    if (timeoutTimer.sec <= 0) { setTimeoutTimer(null); return; }
    const interval = setInterval(() => setTimeoutTimer((prev) => prev ? { ...prev, sec: prev.sec - 1 } : null), 1000);
    return () => clearInterval(interval);
  }, [timeoutTimer]);

  // Buzzer fin de match
  useEffect(() => {
    if (!running || muted || buzzerPlayed) return;
    if (clockSec >= gameDurSec) {
      setBuzzerPlayed(true);
      setRunning(false);
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "square"; osc.frequency.value = 880; gain.gain.value = 0.5;
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(); osc.stop(ctx.currentTime + 0.6);
      } catch {}
    }
  }, [clockSec, gameDurSec, running, muted, buzzerPlayed]);

  // ── API helper ────────────────────────────────────────────────────────────
  const postEvent = useCallback(async (type: string, extra: Record<string, unknown> = {}) => {
    if (!selectedMatchId) return;
    const res = await fetch(`/api/matches/${selectedMatchId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, matchClockSec: clockSec, ...extra }),
    });
    if (!res.ok) return;
    const data = await res.json() as { event?: MatchEvent; match?: Partial<MatchInfo> };
    setMatchMap((prev) => {
      const cur = prev.get(selectedMatchId);
      if (!cur) return prev;
      const next = new Map(prev);
      next.set(selectedMatchId, {
        ...cur,
        ...(data.match ?? {}),
        events: data.event ? [...cur.events, data.event] : cur.events,
      });
      return next;
    });
    if (data.match?.status === "FINISHED") { setRunning(false); setMatchEnded(true); }
    if (data.match?.status === "LIVE") setRunning(true);
  }, [selectedMatchId, clockSec]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const onStart = () => { setRunning(true); postEvent("START"); };
  const onPause = () => { setRunning(false); postEvent("PAUSE"); };
  const onReset = () => { setClockSec(0); setBuzzerPlayed(false); };

  const onGoalConfirmed = (teamId: string, delta: number, playerId: string | null) => {
    setGoalModal(null);
    setMatchMap((prev) => {
      const cur = prev.get(selectedMatchId);
      if (!cur) return prev;
      const next = new Map(prev);
      next.set(selectedMatchId, {
        ...cur,
        scoreA: teamId === cur.teamAId ? Math.max(0, cur.scoreA + delta) : cur.scoreA,
        scoreB: teamId === cur.teamBId ? Math.max(0, cur.scoreB + delta) : cur.scoreB,
      });
      return next;
    });
    postEvent("GOAL", { teamId, delta, ...(playerId ? { playerId } : {}) });
  };

  const onPenaltyConfirmed = (teamId: string, playerId: string, delta: number) => {
    setPenaltyModal(null);
    postEvent("PENALTY", { teamId, playerId, delta });
  };

  const onTimeoutConfirmed = (teamId: string, type: "normal" | "mechanical") => {
    setTimeoutModal(null);
    setRunning(false);
    const dur = type === "mechanical" ? 150 : 120;
    setTimeoutTimer({ sec: dur, label: type === "mechanical" ? "Timeout technique (2:30)" : "Timeout équipe (2:00)" });
    postEvent("TIMEOUT", { teamId, timeoutType: type, delta: 1 });
  };

  const onEndMatch = () => postEvent("END");

  // ── Computed stats ────────────────────────────────────────────────────────
  const { penaltyCounts, timeoutNormal, timeoutMech, goalsByPlayer } = useMemo(() => {
    const penalties = new Map<string, number>();
    const toNormal: Record<string, number> = {};
    const toMech: Record<string, number> = {};
    const goals = new Map<string, number>();

    selectedMatch?.events.forEach((e) => {
      const p = e.payload;
      if (e.type === "PENALTY" && p.playerId) {
        penalties.set(String(p.playerId), (penalties.get(String(p.playerId)) ?? 0) + (Number(p.delta) || 1));
      }
      if (e.type === "TIMEOUT" && p.teamId) {
        const tid = String(p.teamId);
        const delta = Number(p.delta) || 1;
        if (p.timeoutType === "normal") toNormal[tid] = (toNormal[tid] ?? 0) + delta;
        else if (p.timeoutType === "mechanical") toMech[tid] = (toMech[tid] ?? 0) + delta;
      }
      if (e.type === "GOAL" && p.playerId) {
        goals.set(String(p.playerId), (goals.get(String(p.playerId)) ?? 0) + (Number(p.delta) || 1));
      }
    });
    return { penaltyCounts: penalties, timeoutNormal: toNormal, timeoutMech: toMech, goalsByPlayer: goals };
  }, [selectedMatch]);

  const nextScheduled = useMemo(() =>
    sortedMatches.find((m) => m.status === "SCHEDULED" && m.id !== selectedMatchId),
    [sortedMatches, selectedMatchId]
  );

  const teamA = tournament.teams.find((t) => t.id === selectedMatch?.teamAId);
  const teamB = tournament.teams.find((t) => t.id === selectedMatch?.teamBId);
  const clockColor = displaySec <= 60 ? "var(--red)" : displaySec <= 120 ? "#f59e0b" : "var(--teal)";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="ref-page">
      {/* ── Timeout overlay ──────────────────────────────────────────────── */}
      {timeoutTimer && (
        <div className="ref-timeout-overlay">
          <p className="ref-timeout-label">{timeoutTimer.label}</p>
          <div className="ref-timeout-clock">{fmtClock(timeoutTimer.sec)}</div>
          <button className="primary" onClick={() => { setTimeoutTimer(null); setRunning(true); }}>
            Reprendre →
          </button>
        </div>
      )}

      {/* ── Goal modal ───────────────────────────────────────────────────── */}
      {goalModal && (
        <div className="ref-modal-backdrop">
          <div className="ref-modal">
            <p className="ref-modal-title">{goalModal.delta > 0 ? "📣 Buteur ?" : "Annuler quel but ?"}</p>
            <p className="ref-modal-sub">{goalModal.teamName}</p>
            {goalModal.delta > 0 && (
              <div className="ref-modal-list">
                {(teamA?.id === goalModal.teamId ? teamA : teamB)?.players.map((pl) => (
                  <button key={pl.id} className="ghost ref-modal-item"
                    onClick={() => onGoalConfirmed(goalModal.teamId, goalModal.delta, pl.id)}>
                    ⚽ {pl.name}
                    {goalsByPlayer.get(pl.id) ? <span className="ref-badge">{goalsByPlayer.get(pl.id)}</span> : null}
                  </button>
                ))}
                <button className="ghost ref-modal-item ref-modal-unknown"
                  onClick={() => onGoalConfirmed(goalModal.teamId, goalModal.delta, null)}>
                  Sans attribution
                </button>
              </div>
            )}
            {goalModal.delta < 0 && (
              <div className="ref-modal-list">
                {(teamA?.id === goalModal.teamId ? teamA : teamB)?.players.filter((pl) => (goalsByPlayer.get(pl.id) ?? 0) > 0).map((pl) => (
                  <button key={pl.id} className="ghost ref-modal-item"
                    onClick={() => onGoalConfirmed(goalModal.teamId, goalModal.delta, pl.id)}>
                    ↩ {pl.name} (−1 but)
                  </button>
                ))}
                <button className="ghost ref-modal-item ref-modal-unknown"
                  onClick={() => onGoalConfirmed(goalModal.teamId, goalModal.delta, null)}>
                  But anonyme
                </button>
              </div>
            )}
            <button className="ghost" style={{ marginTop: 12 }} onClick={() => setGoalModal(null)}>Annuler</button>
          </div>
        </div>
      )}

      {/* ── Penalty modal ────────────────────────────────────────────────── */}
      {penaltyModal && (
        <div className="ref-modal-backdrop">
          <div className="ref-modal">
            <p className="ref-modal-title">🟨 Pénalité pour ?</p>
            <p className="ref-modal-sub">{penaltyModal.teamName}</p>
            <div className="ref-modal-list">
              {penaltyModal.players.map((pl) => (
                <button key={pl.id} className="ghost ref-modal-item"
                  onClick={() => onPenaltyConfirmed(penaltyModal.teamId, pl.id, 1)}>
                  {pl.name}
                  {(penaltyCounts.get(pl.id) ?? 0) > 0 && (
                    <span className="ref-badge ref-badge--red">{penaltyCounts.get(pl.id)}</span>
                  )}
                </button>
              ))}
            </div>
            <button className="ghost" style={{ marginTop: 12 }} onClick={() => setPenaltyModal(null)}>Annuler</button>
          </div>
        </div>
      )}

      {/* ── Timeout modal ────────────────────────────────────────────────── */}
      {timeoutModal && (
        <div className="ref-modal-backdrop">
          <div className="ref-modal">
            <p className="ref-modal-title">⏱ Type de timeout</p>
            <p className="ref-modal-sub">{timeoutModal.teamName}</p>
            <div className="ref-modal-list">
              <button className="ghost ref-modal-item"
                onClick={() => onTimeoutConfirmed(timeoutModal.teamId, "normal")}>
                🟢 Timeout équipe (2:00)
                <span className="ref-badge">{timeoutNormal[timeoutModal.teamId] ?? 0}/2</span>
              </button>
              <button className="ghost ref-modal-item"
                onClick={() => onTimeoutConfirmed(timeoutModal.teamId, "mechanical")}>
                🔧 Timeout technique (2:30)
                <span className="ref-badge">{timeoutMech[timeoutModal.teamId] ?? 0}</span>
              </button>
            </div>
            <button className="ghost" style={{ marginTop: 12 }} onClick={() => setTimeoutModal(null)}>Annuler</button>
          </div>
        </div>
      )}

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="ref-topbar">
        <Link href={`/tournament/${tournament.id}`} className="ref-back">
          ← Tournoi
        </Link>
        <span className="ref-tourney-name">{tournament.name}</span>
        <button className="ghost" style={{ fontSize: 12, padding: "4px 10px" }}
          onClick={() => setMuted((v) => !v)} title={muted ? "Activer buzzer" : "Couper buzzer"}>
          {muted ? "🔇" : "🔔"}
        </button>
      </div>

      {/* ── Match selector ───────────────────────────────────────────────── */}
      <div className="ref-match-selector">
        <select
          value={selectedMatchId}
          onChange={(e) => {
            lastMatchId.current = "";
            setSelectedMatchId(e.target.value);
            setMatchEnded(false);
          }}
          className="ref-select"
        >
          {sortedMatches.map((m) => (
            <option key={m.id} value={m.id}>
              {m.status === "LIVE" ? "🔴 " : m.status === "FINISHED" ? "✅ " : "⏳ "}
              {matchLabel(m)}
            </option>
          ))}
        </select>
        {selectedMatch && (
          <p className="ref-match-meta">
            {PHASE_LABEL[selectedMatch.phase] ?? selectedMatch.phase}
            {" · "}{selectedMatch.courtName}
            {" · "}{selectedMatch.status === "LIVE" ? "🟢 En cours" : selectedMatch.status === "FINISHED" ? "✅ Terminé" : "⏳ Planifié"}
          </p>
        )}
      </div>

      {selectedMatch && (
        <>
          {/* ── Clock ──────────────────────────────────────────────────── */}
          <div className="ref-clock-section">
            <div className="ref-clock" style={{ color: clockColor }}>{fmtClock(displaySec)}</div>
            {clockSec > 0 && displaySec === 0 && (
              <div className="ref-overtime">⚠️ Temps supplémentaire</div>
            )}
            <div className="ref-clock-controls">
              {!running && !matchEnded && (
                <button className="primary ref-btn-lg" onClick={onStart}>▶ Start</button>
              )}
              {running && (
                <button className="ghost ref-btn-lg" onClick={onPause}>⏸ Pause</button>
              )}
              <button className="ghost ref-btn-sm" onClick={onReset} disabled={running}>↺ Reset</button>
            </div>
          </div>

          {/* ── Scores ─────────────────────────────────────────────────── */}
          {!matchEnded ? (
            <div className="ref-score-grid">
              {[
                { team: teamA, score: selectedMatch.scoreA, side: "A" as const },
                { team: teamB, score: selectedMatch.scoreB, side: "B" as const },
              ].map(({ team, score, side }) => {
                if (!team) return (
                  <div key={side} className="ref-team-panel ref-team--tbd">
                    <span className="ref-team-name">TBD</span>
                  </div>
                );
                const tid = team.id;
                const toCount = timeoutNormal[tid] ?? 0;
                const toMax = 2;
                return (
                  <div key={tid} className="ref-team-panel" style={{ borderTopColor: team.color ?? undefined }}>
                    <span className="ref-team-name">{team.name}</span>
                    <div className="ref-score-display">{score}</div>

                    {/* Buts */}
                    <div className="ref-score-btns">
                      <button className="primary ref-bigbtn"
                        onClick={() => setGoalModal({ teamId: tid, teamName: team.name, delta: 1 })}>
                        ⚽ +1 But
                      </button>
                      <button className="ghost ref-smallbtn"
                        onClick={() => setGoalModal({ teamId: tid, teamName: team.name, delta: -1 })}>
                        −1
                      </button>
                    </div>

                    {/* Pénalité */}
                    <button className="ghost ref-penaltybtn"
                      onClick={() => setPenaltyModal({ teamId: tid, teamName: team.name, players: team.players })}>
                      🟨 Pénalité
                    </button>

                    {/* Timeout */}
                    <button
                      className="ghost ref-timeoutbtn"
                      disabled={toCount >= toMax}
                      onClick={() => setTimeoutModal({ teamId: tid, teamName: team.name, type: "normal" })}
                    >
                      ⏱ Timeout ({toCount}/{toMax})
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ── Résultat final ──────────────────────────────────────── */
            <div className="ref-result">
              <p className="ref-result-label">Match terminé</p>
              <div className="ref-result-score">
                <span>{selectedMatch.teamAName ?? "Team A"}</span>
                <span className="ref-result-num">{selectedMatch.scoreA} — {selectedMatch.scoreB}</span>
                <span>{selectedMatch.teamBName ?? "Team B"}</span>
              </div>
              {selectedMatch.scoreA > selectedMatch.scoreB
                ? <p className="ref-result-winner">🏆 {selectedMatch.teamAName}</p>
                : selectedMatch.scoreB > selectedMatch.scoreA
                  ? <p className="ref-result-winner">🏆 {selectedMatch.teamBName}</p>
                  : <p className="ref-result-winner">Égalité</p>
              }
              {nextScheduled && (
                <button className="primary ref-nextmatch-btn"
                  onClick={() => {
                    lastMatchId.current = "";
                    setSelectedMatchId(nextScheduled.id);
                    setMatchEnded(false);
                  }}>
                  Prochain match →
                </button>
              )}
            </div>
          )}

          {/* ── Pénalités détail ───────────────────────────────────────── */}
          <details className="ref-section">
            <summary className="ref-section-title">🟨 Pénalités détail</summary>
            <div className="ref-penalties-grid">
              {[teamA, teamB].map((team) => team ? (
                <div key={team.id}>
                  <p className="ref-sub-label">{team.name}</p>
                  {team.players.map((pl) => (
                    <div key={pl.id} className="ref-penalty-row">
                      <span>{pl.name}</span>
                      <div className="ref-penalty-controls">
                        <button className="ghost ref-smBtn"
                          onClick={() => onPenaltyConfirmed(team.id, pl.id, -1)}>−</button>
                        <span className="ref-penalty-val"
                          style={{ color: (penaltyCounts.get(pl.id) ?? 0) > 0 ? "var(--red)" : undefined }}>
                          {penaltyCounts.get(pl.id) ?? 0}
                        </span>
                        <button className="ghost ref-smBtn"
                          onClick={() => onPenaltyConfirmed(team.id, pl.id, 1)}>+</button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null)}
            </div>
          </details>

          {/* ── Log événements ─────────────────────────────────────────── */}
          <details className="ref-section">
            <summary className="ref-section-title">📋 Log événements</summary>
            <div className="ref-event-log">
              {selectedMatch.events.length === 0
                ? <p className="ref-empty">Aucun événement.</p>
                : [...selectedMatch.events].reverse().slice(0, 10).map((evt) => {
                    const pl = evt.payload.playerId
                      ? [...(teamA?.players ?? []), ...(teamB?.players ?? [])].find((p) => p.id === String(evt.payload.playerId))
                      : null;
                    return (
                      <div key={evt.id} className="ref-event-row">
                        <span className="ref-event-type">{evt.type}</span>
                        {pl && <span className="ref-event-player">{pl.name}</span>}
                        <span className="ref-event-clock">{fmtClock(evt.matchClockSec)}</span>
                      </div>
                    );
                  })
              }
            </div>
          </details>

          {/* ── Fin du match ───────────────────────────────────────────── */}
          {!matchEnded && (
            <div className="ref-end-section">
              <button className="danger ref-endbtn" onClick={onEndMatch}>
                🏁 Terminer le match
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
