"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useWakeLock } from "@/lib/useWakeLock";

// ─── Types ────────────────────────────────────────────────────────────────────

type PlayerInfo = { id: string; name: string };
type TeamInfo = { id: string; name: string; color: string | null; players: PlayerInfo[] };
type MatchEvent = { id: string; type: string; matchClockSec: number; payload: Record<string, unknown>; createdAt?: string };
type MatchInfo = {
  id: string; phase: string; roundIndex: number; courtName: string;
  dayIndex: string; startAt: string; status: string;
  teamAId: string | null; teamBId: string | null;
  teamAName: string | null; teamBName: string | null;
  scoreA: number; scoreB: number; events: MatchEvent[];
};
type TournamentData = {
  id: string; slug?: string | null; name: string; gameDurationMin: number;
  teams: TeamInfo[]; matches: MatchInfo[];
};

type GoalModal = { teamId: string; teamName: string; delta: number } | null;
type PenaltyModal = { teamId: string; teamName: string; players: PlayerInfo[] } | null;
type TimeoutModal = { teamId: string; teamName: string; type: "normal" | "mechanical" } | null;
type GoldenGoalModal = { teamId: string; teamName: string } | null;

const PHASE_LABEL: Record<string, string> = { POOL: "Poule", SWISS: "Swiss", BRACKET: "Tableau" };
const DAY_LABEL: Record<string, string> = { SAT: "Sam", SUN: "Dim" };

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Reconstruit l'état du chrono depuis les events START/PAUSE.
 * Utilise createdAt pour calculer le temps réel écoulé depuis le dernier START.
 */
function computeClockFromEvents(events: MatchEvent[]): { clockSec: number; running: boolean } {
  let clockSec = 0;
  let lastStartSec = 0;
  let lastStartReal = 0;
  let running = false;

  for (const e of events) {
    if (e.type === "START") {
      lastStartSec = e.matchClockSec;
      // createdAt n'est pas dans le type local MatchEvent — on utilise l'heure courante
      // comme fallback si pas disponible (les events locaux nouvellement créés n'ont pas createdAt)
      lastStartReal = e.createdAt ? new Date(e.createdAt).getTime() : Date.now();
      running = true;
    } else if (e.type === "PAUSE" || e.type === "END") {
      clockSec = e.matchClockSec;
      running = false;
      lastStartReal = 0;
    }
  }

  if (running && lastStartReal > 0) {
    const elapsed = Math.floor((Date.now() - lastStartReal) / 1000);
    clockSec = lastStartSec + elapsed;
  }

  return { clockSec, running };
}

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
  const [matchMap, setMatchMap] = useState<Map<string, MatchInfo>>(() => new Map(tournament.matches.map((m) => [m.id, m])));

  // Matches triés depuis matchMap (réactif aux mises à jour SSE)
  const sortedMatches = useMemo(() => {
    const order: Record<string, number> = { LIVE: 0, SCHEDULED: 1, FINISHED: 2 };
    return [...matchMap.values()].sort(
      (a, b) => (order[a.status] ?? 1) - (order[b.status] ?? 1) || a.startAt.localeCompare(b.startAt)
    );
  }, [matchMap]);
  const [selectedMatchId, setSelectedMatchId] = useState<string>(() => sortedMatches.find((m) => m.status === "LIVE" || m.status === "SCHEDULED")?.id ?? sortedMatches[0]?.id ?? "");
  const [clockSec, setClockSec] = useState(0);
  const [running, setRunning] = useState(false);
  const [buzzerPlayed, setBuzzerPlayed] = useState(false);
  const [muted, setMuted] = useState(false);
  const [matchEnded, setMatchEnded] = useState(false);

  // Édition / correction d'un match terminé
  const [editMode, setEditMode] = useState(false);
  const [editScoreA, setEditScoreA] = useState(0);
  const [editScoreB, setEditScoreB] = useState(0);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const openEdit = () => {
    const m = matchMap.get(selectedMatchId);
    if (!m) return;
    setEditScoreA(m.scoreA);
    setEditScoreB(m.scoreB);
    setEditError(null);
    setEditMode(true);
  };

  const saveEdit = async (reopen = false) => {
    setEditSaving(true); setEditError(null);
    const newStatus = reopen ? "LIVE" : "FINISHED";
    const res = await fetch(`/api/matches/${selectedMatchId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scoreA: editScoreA, scoreB: editScoreB, status: newStatus }),
    });
    if (!res.ok) { setEditError("Erreur lors de la sauvegarde"); setEditSaving(false); return; }
    const updated = await res.json();
    setMatchMap((prev) => {
      const cur = prev.get(selectedMatchId);
      if (!cur) return prev;
      const next = new Map(prev);
      next.set(selectedMatchId, { ...cur, ...updated });
      return next;
    });
    if (reopen) { setMatchEnded(false); setRunning(false); setBuzzerPlayed(false); }
    setEditMode(false);
    setEditSaving(false);
  };

  // Modals
  const [goalModal, setGoalModal] = useState<GoalModal>(null);
  const [penaltyModal, setPenaltyModal] = useState<PenaltyModal>(null);
  const [timeoutModal, setTimeoutModal] = useState<TimeoutModal>(null);
  const [goldenGoalModal, setGoldenGoalModal] = useState<GoldenGoalModal>(null);
  const [timeoutTimer, setTimeoutTimer] = useState<{ sec: number; label: string } | null>(null);

  const lastMatchId = useRef<string>("");

  // SSE — met à jour matchMap quand un match avancé (ou mis à jour par un autre panel) arrive
  useEffect(() => {
    const es = new EventSource(`/api/sse?tournamentId=${tournament.id}`);
    es.addEventListener("match", (evt) => {
      const payload = JSON.parse((evt as MessageEvent).data);
      const updatedMatch: Partial<MatchInfo> | undefined =
        payload?.data?.match ?? (payload?.data?.id ? payload.data : undefined);
      if (updatedMatch?.id) {
        setMatchMap((prev) => {
          const cur = prev.get(updatedMatch.id!);
          const next = new Map(prev);
          if (cur) {
            // Match existant : merge
            next.set(updatedMatch.id!, { ...cur, ...updatedMatch });
          } else {
            // Nouveau match (rare) — on l'ajoute si on a assez d'infos
            next.set(updatedMatch.id!, updatedMatch as MatchInfo);
          }
          return next;
        });
      }
    });
    return () => es.close();
  }, [tournament.id]);

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
    // Reconstruire le chrono depuis les events (persistance après reload)
    const { clockSec: restoredClock, running: restoredRunning } = computeClockFromEvents(m.events);
    setClockSec(restoredClock);
    setRunning(m.status === "LIVE" ? restoredRunning : false);
    setBuzzerPlayed(false);
    setMatchEnded(m.status === "FINISHED");
    setActionError(null);
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
    setActionError(null);
    const res = await fetch(`/api/matches/${selectedMatchId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, matchClockSec: clockSec, ...extra }),
    });
    if (!res.ok) {
      let message = "Action arbitrage refusée";
      try {
        const errorData = await res.json() as { error?: string | { formErrors?: string[] } };
        if (typeof errorData?.error === "string") {
          message = errorData.error;
        } else if (errorData?.error && "formErrors" in errorData.error && errorData.error.formErrors?.length) {
          message = errorData.error.formErrors[0] ?? message;
        }
      } catch {}
      setActionError(message);
      return;
    }
    const data = await res.json() as { event?: MatchEvent; match?: Partial<MatchInfo> };
    setMatchMap((prev) => {
      const cur = prev.get(selectedMatchId);
      if (!cur) return prev;
      const next = new Map(prev);
      // For score-changing events (GOAL, GOLDEN_GOAL, END), use server scores
      // For other events (START, PAUSE, TIMEOUT, PENALTY), keep local scores to avoid overwriting optimistic updates
      const scoreEvents = ["GOAL", "GOLDEN_GOAL", "END"];
      const mergeMatch = data.match ? (scoreEvents.includes(type)
        ? data.match
        : { ...data.match, scoreA: undefined, scoreB: undefined }
      ) : {};
      next.set(selectedMatchId, {
        ...cur,
        ...mergeMatch,
        scoreA: mergeMatch.scoreA !== undefined ? mergeMatch.scoreA : cur.scoreA,
        scoreB: mergeMatch.scoreB !== undefined ? mergeMatch.scoreB : cur.scoreB,
        events: data.event ? [...cur.events, data.event] : cur.events,
      });
      return next;
    });
    if (data.match?.status === "FINISHED") { setRunning(false); setMatchEnded(true); }
    // Don't restart clock after TIMEOUT or PAUSE events
    if (data.match?.status === "LIVE" && type !== "TIMEOUT" && type !== "PAUSE") setRunning(true);
  }, [selectedMatchId, clockSec]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const onStart = () => { setRunning(true); postEvent("START"); };
  // Pause locale uniquement — le match reste LIVE côté serveur
  const onPause = () => { setRunning(false); postEvent("PAUSE"); };
  const onReset = () => {
    if (!window.confirm("Remettre le chrono à zéro ? Cette action ne peut pas être annulée.")) return;
    setClockSec(0);
    setBuzzerPlayed(false);
  };

  const onGoalConfirmed = (teamId: string, delta: number, playerId: string | null) => {
    // Defer modal close so the DOM node isn't removed while the click event is still bubbling
    // (prevents "removeChild" error)
    setTimeout(() => setGoalModal(null), 0);
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
    setTimeout(() => setPenaltyModal(null), 0);
    postEvent("PENALTY", { teamId, playerId, delta });
  };

  const onTimeoutConfirmed = (teamId: string, type: "normal" | "mechanical") => {
    setTimeout(() => setTimeoutModal(null), 0);
    // Pause locale du chrono (match reste LIVE côté serveur)
    setRunning(false);
    const dur = type === "mechanical" ? 150 : 120;
    setTimeoutTimer({ sec: dur, label: type === "mechanical" ? "Timeout technique (2:30)" : "Timeout équipe (2:00)" });
    postEvent("TIMEOUT", { teamId, timeoutType: type, delta: 1 });
    // Pas d'event PAUSE — le match reste LIVE
  };

  const onEndMatch = () => postEvent("END");

  const onGoldenGoalConfirmed = (teamId: string, playerId: string | null) => {
    setTimeout(() => setGoldenGoalModal(null), 0);
    setMatchMap((prev) => {
      const cur = prev.get(selectedMatchId);
      if (!cur) return prev;
      const next = new Map(prev);
      next.set(selectedMatchId, {
        ...cur,
        scoreA: teamId === cur.teamAId ? cur.scoreA + 1 : cur.scoreA,
        scoreB: teamId === cur.teamBId ? cur.scoreB + 1 : cur.scoreB,
      });
      return next;
    });
    postEvent("GOLDEN_GOAL", { teamId, ...(playerId ? { playerId } : {}) });
  };

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
      if (e.type === "GOAL" || e.type === "GOLDEN_GOAL") {
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
  const cannotEndBracketDraw = !!selectedMatch && selectedMatch.phase === "BRACKET" && selectedMatch.scoreA === selectedMatch.scoreB;

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
            <button className="ghost" style={{ marginTop: 12 }} onClick={() => setTimeout(() => setGoalModal(null), 0)}>Annuler</button>
          </div>
        </div>
      )}
      {/* ── Golden Goal modal ──────────────────────────────────────── */}
      {goldenGoalModal && (
        <div className="ref-modal-backdrop">
          <div className="ref-modal">
            <p className="ref-modal-title">⭐ Buteur golden goal ?</p>
            <p className="ref-modal-sub">{goldenGoalModal.teamName}</p>
            <div className="ref-modal-list">
              {(teamA?.id === goldenGoalModal.teamId ? teamA : teamB)?.players.map((pl) => (
                <button key={pl.id} className="ghost ref-modal-item"
                  onClick={() => onGoldenGoalConfirmed(goldenGoalModal.teamId, pl.id)}>
                  ⭐ {pl.name}
                </button>
              ))}
              <button className="ghost ref-modal-item ref-modal-unknown"
                onClick={() => onGoldenGoalConfirmed(goldenGoalModal.teamId, null)}>
                Sans attribution
              </button>
            </div>
            <button className="ghost" style={{ marginTop: 12 }} onClick={() => setTimeout(() => setGoldenGoalModal(null), 0)}>Annuler</button>
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
            <button className="ghost" style={{ marginTop: 12 }} onClick={() => setTimeout(() => setPenaltyModal(null), 0)}>Annuler</button>
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
            <button className="ghost" style={{ marginTop: 12 }} onClick={() => setTimeout(() => setTimeoutModal(null), 0)}>Annuler</button>
          </div>
        </div>
      )}

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="ref-topbar">
        <Link href={`/tournament/${tournament.slug ?? tournament.id}?tab=schedule`} className="ref-back">
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
            setClockSec(0);
            setRunning(false);
            setBuzzerPlayed(false);
            setMatchEnded(false);
            setSelectedMatchId(e.target.value);
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
                      {clockSec >= gameDurSec && selectedMatch.phase === "BRACKET" ? (
                        <button className="primary ref-bigbtn"
                          disabled={selectedMatch.scoreA !== selectedMatch.scoreB}
                          style={selectedMatch.scoreA === selectedMatch.scoreB ? { background: "var(--yellow)", color: "var(--text)", border: "none" } : undefined}
                          onClick={() => setGoldenGoalModal({ teamId: tid, teamName: team.name })}>
                          ⭐ Golden Goal
                        </button>
                      ) : (
                        <button className="primary ref-bigbtn"
                          onClick={() => setGoalModal({ teamId: tid, teamName: team.name, delta: 1 })}>
                          +1 But
                        </button>
                      )}
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
          ) : null}


          {matchEnded && (editMode ? (
            /* ── Édition du score ────────────────────────────────────── */
            <div className="ref-result">
              <p className="ref-result-label">Corriger le score</p>
              <div className="ref-result-score" style={{ gap: 16 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{selectedMatch.teamAName ?? "Team A"}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button className="ghost ref-smBtn" onClick={() => setEditScoreA((s) => Math.max(0, s - 1))}>−</button>
                    <span className="ref-result-num" style={{ minWidth: 32, textAlign: "center" }}>{editScoreA}</span>
                    <button className="ghost ref-smBtn" onClick={() => setEditScoreA((s) => s + 1)}>+</button>
                  </div>
                </div>
                <span style={{ opacity: 0.4, fontSize: 20 }}>—</span>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{selectedMatch.teamBName ?? "Team B"}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button className="ghost ref-smBtn" onClick={() => setEditScoreB((s) => Math.max(0, s - 1))}>−</button>
                    <span className="ref-result-num" style={{ minWidth: 32, textAlign: "center" }}>{editScoreB}</span>
                    <button className="ghost ref-smBtn" onClick={() => setEditScoreB((s) => s + 1)}>+</button>
                  </div>
                </div>
              </div>
              {editError && <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{editError}</p>}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                <button className="primary" onClick={() => saveEdit(false)} disabled={editSaving}>
                  {editSaving ? "…" : "✓ Sauvegarder"}
                </button>
                <button className="ghost" style={{ color: "var(--danger)" }}
                  onClick={() => { if (window.confirm("Rouvrir ce match ? Le chrono repartira de zéro.")) saveEdit(true); }}
                  disabled={editSaving}>
                  ↩ Rouvrir le match
                </button>
                <button className="ghost" onClick={() => setEditMode(false)} disabled={editSaving}>Annuler</button>
              </div>
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
              <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                {nextScheduled && (
                  <button className="primary ref-nextmatch-btn"
                    onClick={() => {
                      lastMatchId.current = "";
                      setClockSec(0);
                      setRunning(false);
                      setBuzzerPlayed(false);
                      setMatchEnded(false);
                      setSelectedMatchId(nextScheduled.id);
                    }}>
                    Prochain match →
                  </button>
                )}
                <button className="ghost" style={{ fontSize: 13 }} onClick={openEdit}>
                  ✏️ Corriger
                </button>
              </div>
            </div>
          ))}

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
              <button className="danger ref-endbtn" onClick={onEndMatch} disabled={cannotEndBracketDraw}>
                🏁 Terminer le match
              </button>
              {cannotEndBracketDraw && (
                <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 8, textAlign: "center" }}>
                  Un match de bracket ne peut pas se terminer sur une égalité. Utilise Golden Goal pour désigner un vainqueur.
                </p>
              )}
              {actionError && (
                <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 8, textAlign: "center" }}>
                  {actionError}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
