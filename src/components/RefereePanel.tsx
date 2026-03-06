"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  const [tournaments, setTournaments] = useState<TournamentPayload[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<string>("");
  const [selectedMatch, setSelectedMatch] = useState<MatchWithTeams | null>(null);
  const [clockSec, setClockSec] = useState(0);
  const [running, setRunning] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.4);
  const [buzzerPlayed, setBuzzerPlayed] = useState(false);

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

  const onScore = (teamId: string, delta: number) => {
    if (!selectedMatch) return;
    const nextA = teamId === selectedMatch.teamAId ? clampScore(selectedMatch.scoreA + delta) : selectedMatch.scoreA;
    const nextB = teamId === selectedMatch.teamBId ? clampScore(selectedMatch.scoreB + delta) : selectedMatch.scoreB;
    setSelectedMatch({ ...selectedMatch, scoreA: nextA, scoreB: nextB });
    postEvent("GOAL", { teamId, delta });
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
        <h2>Referee Console</h2>
        <div className="field-row">
          <label>Tournament</label>
          <select value={selectedTournament} onChange={(e) => setSelectedTournament(e.target.value)}>
            <option value="">Select tournament</option>
            {tournaments.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <div className="field-row">
          <label>Match</label>
          <select
            value={selectedMatch?.id ?? ""}
            onChange={(e) => setSelectedMatch(matches.find((m) => m.id === e.target.value) ?? null)}
          >
            <option value="">Select match</option>
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
            <h3>Timer</h3>
            <div className="clock">{formatClock(clockSec)}</div>
            <div className="button-row">
              <button onClick={onStart}>Start</button>
              <button onClick={onPause} className="ghost">Pause</button>
              <button onClick={onReset} className="ghost">Reset</button>
            </div>
            <div className="button-row">
              <button onClick={() => onAdjust(30)}>+30s</button>
              <button onClick={() => onAdjust(-30)} className="ghost">-30s</button>
            </div>
            <div className="button-row">
              <button className="ghost" onClick={() => setMuted((prev) => !prev)}>
                {muted ? "Unmute Buzzer" : "Mute Buzzer"}
              </button>
              <label className="volume">
                Volume
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
            <h3>Score</h3>
            <div className="scoreboard">
              <div>
                <h4>{selectedMatch.teamA?.name ?? "Team A"}</h4>
                <div className="score">{selectedMatch.scoreA}</div>
                <div className="button-row">
                  <button onClick={() => selectedMatch.teamAId && onScore(selectedMatch.teamAId, 1)}>+1</button>
                  <button className="ghost" onClick={() => selectedMatch.teamAId && onScore(selectedMatch.teamAId, -1)}>-1</button>
                </div>
                <div className="button-row">
                  <button className="ghost" onClick={() => selectedMatch.teamAId && onTimeout(selectedMatch.teamAId, "normal")}>Timeout</button>
                  <button className="ghost" onClick={() => selectedMatch.teamAId && onTimeout(selectedMatch.teamAId, "normal", -1)}>Undo</button>
                  <button className="ghost" onClick={() => selectedMatch.teamAId && onTimeout(selectedMatch.teamAId, "mechanical")}>Mechanical</button>
                  <button className="ghost" onClick={() => selectedMatch.teamAId && onTimeout(selectedMatch.teamAId, "mechanical", -1)}>Undo</button>
                </div>
                <p className="meta">Timeouts: {timeoutCounts.normalA} normal / {timeoutCounts.mechA} mech</p>
              </div>
              <div>
                <h4>{selectedMatch.teamB?.name ?? "Team B"}</h4>
                <div className="score">{selectedMatch.scoreB}</div>
                <div className="button-row">
                  <button onClick={() => selectedMatch.teamBId && onScore(selectedMatch.teamBId, 1)}>+1</button>
                  <button className="ghost" onClick={() => selectedMatch.teamBId && onScore(selectedMatch.teamBId, -1)}>-1</button>
                </div>
                <div className="button-row">
                  <button className="ghost" onClick={() => selectedMatch.teamBId && onTimeout(selectedMatch.teamBId, "normal")}>Timeout</button>
                  <button className="ghost" onClick={() => selectedMatch.teamBId && onTimeout(selectedMatch.teamBId, "normal", -1)}>Undo</button>
                  <button className="ghost" onClick={() => selectedMatch.teamBId && onTimeout(selectedMatch.teamBId, "mechanical")}>Mechanical</button>
                  <button className="ghost" onClick={() => selectedMatch.teamBId && onTimeout(selectedMatch.teamBId, "mechanical", -1)}>Undo</button>
                </div>
                <p className="meta">Timeouts: {timeoutCounts.normalB} normal / {timeoutCounts.mechB} mech</p>
              </div>
            </div>
          </div>

          <div className="panel">
            <h3>Penalties</h3>
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
            <h3>Event Log</h3>
            <div className="event-log">
              {(selectedMatch.events ?? []).slice(-8).reverse().map((event) => (
                <div key={event.id} className="event-row">
                  <span>{event.type}</span>
                  <span className="meta">{formatClock(event.matchClockSec)}</span>
                </div>
              ))}
              {(selectedMatch.events ?? []).length === 0 && <p className="meta">No events yet.</p>}
            </div>
          </div>

          <div className="panel">
            <h3>Finish</h3>
            <p style={{ fontSize: 12, marginBottom: 8 }}>Golden goal (termine le match +1) :</p>
            <div className="button-row">
              <button onClick={() => selectedMatch.teamAId && onGoldenGoal(selectedMatch.teamAId)}>
                ⭐ GG — {selectedMatch.teamA?.name ?? "Team A"}
              </button>
              <button onClick={() => selectedMatch.teamBId && onGoldenGoal(selectedMatch.teamBId)}>
                ⭐ GG — {selectedMatch.teamB?.name ?? "Team B"}
              </button>
            </div>
            <button className="danger" style={{ marginTop: 8 }} onClick={() => postEvent("END")}>End Match</button>
          </div>
        </div>
      )}
    </div>
  );
}
