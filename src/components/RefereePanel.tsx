"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Match, MatchEvent, Team, TeamPlayer } from "@prisma/client";
import { clampScore } from "@/lib/utils";

type TeamWithPlayers = Team & { players: (TeamPlayer & { player: { id: string; name: string } })[] };

type MatchWithTeams = Match & { teamA?: TeamWithPlayers | null; teamB?: TeamWithPlayers | null; events?: MatchEvent[] };

type TournamentPayload = {
  id: string;
  name: string;
  gameDurationMin: number;
  matches: MatchWithTeams[];
  teams: TeamWithPlayers[];
};

export function RefereePanel() {
  const t = useTranslations("referee");
  const [tournaments, setTournaments] = useState<TournamentPayload[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<string>("");
  const [selectedMatch, setSelectedMatch] = useState<MatchWithTeams | null>(null);
  const [clockSec, setClockSec] = useState(0);
  const [running, setRunning] = useState(false);
  const [muted, setMuted] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [volume, setVolume] = useState(0.4);
  const [buzzerPlayed, setBuzzerPlayed] = useState(false);
  // null = fermé, teamId = picker ouvert pour cette équipe
  const [scorerPickerTeamId, setScorerPickerTeamId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/tournaments")
      .then((res) => res.json())
      .then((data) => setTournaments(data))
      .catch(() => setTournaments([]));
  }, []);

  useEffect(() => {
    if (!selectedTournament) return;
    fetch(`/api/tournaments/${selectedTournament}`)
      .then((res) => res.json())
      .then((data) => {
        const payload = data as TournamentPayload;
        setTournaments((prev) => prev.map((t) => (t.id === payload.id ? payload : t)));
        setSelectedMatch(payload.matches[0] ?? null);
      });
  }, [selectedTournament]);

  const lastMatchId = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedMatch) return;
    if (lastMatchId.current !== selectedMatch.id) {
      const lastEvent = selectedMatch.events?.[selectedMatch.events.length - 1];
      setClockSec(lastEvent?.matchClockSec ?? 0);
      setRunning(selectedMatch.status === "LIVE");
      setBuzzerPlayed(false);
      lastMatchId.current = selectedMatch.id;
    }
  }, [selectedMatch]);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      setClockSec((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [running]);

  const currentTournament = tournaments.find((t) => t.id === selectedTournament);
  const matches = currentTournament?.matches ?? [];

  useEffect(() => {
    if (!currentTournament || muted) return;
    const limit = currentTournament.gameDurationMin * 60;
    if (clockSec >= limit && !buzzerPlayed) {
      setBuzzerPlayed(true);
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "square";
      oscillator.frequency.value = 880;
      gain.gain.value = volume;
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.4);
    }
  }, [clockSec, currentTournament, muted, volume, buzzerPlayed]);

  const postEvent = async (type: string, payload: Record<string, unknown> = {}) => {
    if (!selectedMatch) return;
    setMatchError(null);
    const response = await fetch(`/api/matches/${selectedMatch.id}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        matchClockSec: clockSec,
        ...payload
      })
    });

    const data = await response.json();
    if (!response.ok) {
      setMatchError(data?.error ?? t("unknown_error"));
      return;
    }
    if (data?.match) {
      setSelectedMatch((prev) => {
        if (!prev) return prev;
        const nextEvents = data.event ? [...(prev.events ?? []), data.event] : prev.events ?? [];
        return { ...prev, ...data.match, events: nextEvents };
      });
      setRunning(data.match.status === "LIVE");
    }
  };

  const onStart = () => {
    setRunning(true);
    postEvent("START");
  };

  const onPause = () => {
    setRunning(false);
    postEvent("PAUSE");
  };

  const onReset = () => {
    setClockSec(0);
    setBuzzerPlayed(false);
  };

  const onAdjust = (delta: number) => {
    setClockSec((prev) => Math.max(0, prev + delta));
    postEvent("TIME_ADJUST", { delta });
  };

  // Dans les 2 dernières minutes, on détermine si le chrono doit se stopper automatiquement
  const isLastTwoMinutes = currentTournament
    ? clockSec >= currentTournament.gameDurationMin * 60 - 120
    : false;

  const onScore = (teamId: string, delta: number, playerId?: string) => {
    if (!selectedMatch) return;
    const nextA = teamId === selectedMatch.teamAId ? clampScore(selectedMatch.scoreA + delta) : selectedMatch.scoreA;
    const nextB = teamId === selectedMatch.teamBId ? clampScore(selectedMatch.scoreB + delta) : selectedMatch.scoreB;
    setSelectedMatch({ ...selectedMatch, scoreA: nextA, scoreB: nextB });
    postEvent("GOAL", { teamId, delta, ...(playerId ? { playerId } : {}) });
    setScorerPickerTeamId(null);
    // Redémarre le chrono après attribution du but (si on était en pause cause dernières 2 min)
    if (isLastTwoMinutes && !running) {
      setRunning(true);
      postEvent("START");
    }
  };

  const openScorerPicker = (teamId: string, delta: number) => {
    if (!selectedMatch) return;
    const team = teamId === selectedMatch.teamAId ? selectedMatch.teamA : selectedMatch.teamB;
    // Si pas de joueurs connus, scorer directement sans picker
    if (!team?.players?.length) {
      // Dernières 2 min : pause auto avant d'enregistrer le but
      if (isLastTwoMinutes && running && delta > 0) { setRunning(false); postEvent("PAUSE"); }
      onScore(teamId, delta);
      return;
    }
    if (delta < 0) { onScore(teamId, delta); return; } // annulation directe
    // Dernières 2 min : pause le chrono en attendant l'attribution du buteur
    if (isLastTwoMinutes && running) { setRunning(false); postEvent("PAUSE"); }
    setScorerPickerTeamId(teamId);
  };

  const onGoldenGoal = (teamId: string) => {
    if (!selectedMatch) return;
    const nextA = teamId === selectedMatch.teamAId ? selectedMatch.scoreA + 1 : selectedMatch.scoreA;
    const nextB = teamId === selectedMatch.teamBId ? selectedMatch.scoreB + 1 : selectedMatch.scoreB;
    setSelectedMatch({ ...selectedMatch, scoreA: nextA, scoreB: nextB });
    postEvent("GOLDEN_GOAL", { teamId });
  };

  const onPenalty = (teamId: string, playerId: string, delta: number) => {
    postEvent("PENALTY", { teamId, playerId, delta });
  };

  const onTimeout = (teamId: string, timeoutType: "normal" | "mechanical", delta = 1) => {
    // Dernières 2 min : pause le chrono quand on prend un timeout
    if (delta > 0 && isLastTwoMinutes && running) {
      setRunning(false);
      postEvent("PAUSE");
    }
    postEvent("TIMEOUT", { teamId, timeoutType, delta });
  };

  const penaltyCounts = useMemo(() => {
    const counts = new Map<string, number>();
    selectedMatch?.events?.forEach((event) => {
      if (event.type !== "PENALTY") return;
      const payload = event.payload as { playerId?: string; delta?: number };
      if (!payload.playerId) return;
      const current = counts.get(payload.playerId) ?? 0;
      counts.set(payload.playerId, current + (payload.delta ?? 1));
    });
    return counts;
  }, [selectedMatch]);

  const timeoutCounts = useMemo(() => {
    const counts = {
      normalA: 0,
      normalB: 0,
      mechA: 0,
      mechB: 0
    };

    selectedMatch?.events?.forEach((event) => {
      if (event.type !== "TIMEOUT") return;
      const payload = event.payload as { teamId?: string; timeoutType?: string; delta?: number };
      if (!payload.teamId || !payload.timeoutType) return;
      const delta = payload.delta ?? 1;
      const isTeamA = payload.teamId === selectedMatch.teamAId;
      if (payload.timeoutType === "normal") {
        if (isTeamA) counts.normalA += delta;
        else counts.normalB += delta;
      }
      if (payload.timeoutType === "mechanical") {
        if (isTeamA) counts.mechA += delta;
        else counts.mechB += delta;
      }
    });

    return counts;
  }, [selectedMatch]);

  const formatClock = (sec: number) => {
    const minutes = Math.floor(sec / 60);
    const seconds = sec % 60;
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  return (
    <div className="referee">
      <div className="panel">
        <h2>{t("console_title")}</h2>
        <div className="field-row">
          <label>{t("select_tournament")}</label>
          <select value={selectedTournament} onChange={(e) => setSelectedTournament(e.target.value)}>
            <option value="">{t("select_tournament_placeholder")}</option>
            {tournaments.map((t2) => (
              <option key={t2.id} value={t2.id}>{t2.name}</option>
            ))}
          </select>
        </div>
        <div className="field-row">
          <label>{t("select_match")}</label>
          <select
            value={selectedMatch?.id ?? ""}
            onChange={(e) => setSelectedMatch(matches.find((m) => m.id === e.target.value) ?? null)}
          >
            <option value="">{t("select_match_placeholder")}</option>
            {matches.map((match) => (
              <option key={match.id} value={match.id}>
                {match.teamA?.name ?? "TBD"} vs {match.teamB?.name ?? "TBD"} ({match.courtName})
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedMatch && (
        <div className="referee-grid">
          <div className="panel">
            <h3>{t("timer_title")}</h3>
            <div className="clock">{formatClock(clockSec)}</div>
            <div className="button-row">
              <button onClick={onStart}>{t("btn_start")}</button>
              <button onClick={onPause} className="ghost">{t("btn_pause")}</button>
              <button onClick={onReset} className="ghost">{t("btn_reset")}</button>
            </div>
            <div className="button-row" style={{ alignItems: "center", gap: 6 }}>
              <button
                onClick={() => onAdjust(10)}
                title="+10s"
                style={{ width: 36, height: 32, borderRadius: 6, padding: 0, fontSize: 11, fontWeight: 700, flexShrink: 0 }}
              >+10s</button>
              <button
                onClick={() => onAdjust(5)}
                title="+5s"
                style={{ width: 32, height: 32, borderRadius: 6, padding: 0, fontSize: 11, fontWeight: 700, flexShrink: 0 }}
              >+5s</button>
              <button
                onClick={() => onAdjust(-5)}
                className="ghost"
                title="-5s"
                style={{ width: 32, height: 32, borderRadius: 6, padding: 0, fontSize: 11, fontWeight: 700, flexShrink: 0 }}
              >-5s</button>
              <button
                onClick={() => onAdjust(-10)}
                className="ghost"
                title="-10s"
                style={{ width: 36, height: 32, borderRadius: 6, padding: 0, fontSize: 11, fontWeight: 700, flexShrink: 0 }}
              >-10s</button>
            </div>
            <div className="button-row">
              <button className="ghost" onClick={() => setMuted((prev) => !prev)}>
                {muted ? t("btn_unmute") : t("btn_mute")}
              </button>
              <label className="volume">
                {t("volume_label")}
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                />
              </label>
            </div>
          </div>

          <div className="panel">
            <h3>{t("score_title")}</h3>
            <div className="scoreboard">
              <div>
                <h4>{selectedMatch.teamA?.name ?? "Team A"}</h4>
                <div className="score">{selectedMatch.scoreA}</div>
                <div className="button-row">
                  <button onClick={() => selectedMatch.teamAId && openScorerPicker(selectedMatch.teamAId, 1)}>+1</button>
                  <button className="ghost" onClick={() => selectedMatch.teamAId && onScore(selectedMatch.teamAId, -1)}>-1</button>
                </div>
                {scorerPickerTeamId === selectedMatch.teamAId && (
                  <div className="scorer-picker">
                    <p className="meta" style={{ marginBottom: 4 }}>Buteur :</p>
                    {selectedMatch.teamA?.players?.map((tp) => (
                      <button key={tp.player.id} className="ghost" style={{ width: "100%", marginBottom: 2, textAlign: "left" }}
                        onClick={() => onScore(selectedMatch.teamAId!, 1, tp.player.id)}>
                        {tp.player.name}
                      </button>
                    ))}
                    <button className="ghost" style={{ width: "100%", marginTop: 4, opacity: 0.6 }}
                      onClick={() => onScore(selectedMatch.teamAId!, 1)}>
                      Sans buteur
                    </button>
                    <button className="ghost danger" style={{ width: "100%", marginTop: 2, opacity: 0.6 }}
                      onClick={() => setScorerPickerTeamId(null)}>
                      Annuler
                    </button>
                  </div>
                )}
                <div className="button-row">
                  <button className="ghost" onClick={() => selectedMatch.teamAId && onTimeout(selectedMatch.teamAId, "normal")}>{t("btn_timeout")}</button>
                  <button className="ghost" onClick={() => selectedMatch.teamAId && onTimeout(selectedMatch.teamAId, "normal", -1)}>{t("btn_undo")}</button>
                  <button className="ghost" onClick={() => selectedMatch.teamAId && onTimeout(selectedMatch.teamAId, "mechanical")}>{t("btn_mechanical")}</button>
                  <button className="ghost" onClick={() => selectedMatch.teamAId && onTimeout(selectedMatch.teamAId, "mechanical", -1)}>{t("btn_undo")}</button>
                </div>
                <p className="meta">{t("timeouts_label", { normal: timeoutCounts.normalA, mech: timeoutCounts.mechA })}</p>
              </div>
              <div>
                <h4>{selectedMatch.teamB?.name ?? "Team B"}</h4>
                <div className="score">{selectedMatch.scoreB}</div>
                <div className="button-row">
                  <button onClick={() => selectedMatch.teamBId && openScorerPicker(selectedMatch.teamBId, 1)}>+1</button>
                  <button className="ghost" onClick={() => selectedMatch.teamBId && onScore(selectedMatch.teamBId, -1)}>-1</button>
                </div>
                {scorerPickerTeamId === selectedMatch.teamBId && (
                  <div className="scorer-picker">
                    <p className="meta" style={{ marginBottom: 4 }}>Buteur :</p>
                    {selectedMatch.teamB?.players?.map((tp) => (
                      <button key={tp.player.id} className="ghost" style={{ width: "100%", marginBottom: 2, textAlign: "left" }}
                        onClick={() => onScore(selectedMatch.teamBId!, 1, tp.player.id)}>
                        {tp.player.name}
                      </button>
                    ))}
                    <button className="ghost" style={{ width: "100%", marginTop: 4, opacity: 0.6 }}
                      onClick={() => onScore(selectedMatch.teamBId!, 1)}>
                      Sans buteur
                    </button>
                    <button className="ghost danger" style={{ width: "100%", marginTop: 2, opacity: 0.6 }}
                      onClick={() => setScorerPickerTeamId(null)}>
                      Annuler
                    </button>
                  </div>
                )}
                <div className="button-row">
                  <button className="ghost" onClick={() => selectedMatch.teamBId && onTimeout(selectedMatch.teamBId, "normal")}>{t("btn_timeout")}</button>
                  <button className="ghost" onClick={() => selectedMatch.teamBId && onTimeout(selectedMatch.teamBId, "normal", -1)}>{t("btn_undo")}</button>
                  <button className="ghost" onClick={() => selectedMatch.teamBId && onTimeout(selectedMatch.teamBId, "mechanical")}>{t("btn_mechanical")}</button>
                  <button className="ghost" onClick={() => selectedMatch.teamBId && onTimeout(selectedMatch.teamBId, "mechanical", -1)}>{t("btn_undo")}</button>
                </div>
                <p className="meta">{t("timeouts_label", { normal: timeoutCounts.normalB, mech: timeoutCounts.mechB })}</p>
              </div>
            </div>
          </div>

          <div className="panel">
            <h3>{t("penalties_title")}</h3>
            <div className="penalty-grid">
              {[selectedMatch.teamA, selectedMatch.teamB].map((team) => (
                <div key={team?.id}>
                  <h4>{team?.name}</h4>
                  {team?.players?.map((tp) => (
                    <div key={tp.player.id} className="penalty-row">
                      <span>{tp.player.name}</span>
                      <div className="penalty-controls">
                        <button onClick={() => team.id && onPenalty(team.id, tp.player.id, 1)}>+</button>
                        <span>{penaltyCounts.get(tp.player.id) ?? 0}</span>
                        <button onClick={() => team.id && onPenalty(team.id, tp.player.id, -1)} className="ghost">-</button>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <h3>{t("event_log_title")}</h3>
            <div className="event-log">
              {(selectedMatch.events ?? []).slice(-8).reverse().map((event) => (
                <div key={event.id} className="event-row">
                  <span>{event.type}</span>
                  <span className="meta">{formatClock(event.matchClockSec)}</span>
                </div>
              ))}
              {(selectedMatch.events ?? []).length === 0 && <p className="meta">{t("event_log_empty")}</p>}
            </div>
          </div>

          <div className="panel">
            <h3>{t("finish_title")}</h3>
            <p style={{ fontSize: 12, marginBottom: 8 }}>{t("golden_goal_label")}</p>
            <div className="button-row">
              <button onClick={() => selectedMatch.teamAId && onGoldenGoal(selectedMatch.teamAId)}>
                {t("btn_gg_team", { name: selectedMatch.teamA?.name ?? "Team A" })}
              </button>
              <button onClick={() => selectedMatch.teamBId && onGoldenGoal(selectedMatch.teamBId)}>
                {t("btn_gg_team", { name: selectedMatch.teamB?.name ?? "Team B" })}
              </button>
            </div>
            <button className="danger" style={{ marginTop: 8 }} onClick={() => postEvent("END")}>{t("btn_end_match")}</button>
            {matchError && (
              <p style={{ color: "var(--pink)", fontSize: 13, marginTop: 8, fontWeight: 600 }}>{matchError}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
