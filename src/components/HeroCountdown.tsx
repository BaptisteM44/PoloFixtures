"use client";

import { useEffect, useState } from "react";

type Props = {
  dateStart: string;
  dateEnd: string;
  registrationEnd: string | null;
  teamCount: number;
  maxTeams: number;
};

function getCountdownLabel(target: Date): string | null {
  const diff = target.getTime() - Date.now();
  if (diff <= 0) return null;
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 0) return `J-${days}`;
  if (hours > 0) return `${hours}h`;
  const mins = Math.floor((diff % 3600000) / 60000);
  return `${mins}min`;
}

export function HeroCountdown({ dateStart, dateEnd, registrationEnd, teamCount, maxTeams }: Props) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const now = Date.now();
  const start = new Date(dateStart).getTime();
  const end = new Date(dateEnd).getTime();
  const regEnd = registrationEnd ? new Date(registrationEnd).getTime() : null;

  const isFinished = now > end;
  const isOngoing = !isFinished && now >= start;

  // Countdown target: registration end first (if in future), otherwise tournament start
  let countdownLabel: string | null = null;
  let countdownContext: string | null = null;

  if (!isFinished && !isOngoing) {
    if (regEnd && regEnd > now) {
      const label = getCountdownLabel(new Date(regEnd));
      if (label) { countdownLabel = label; countdownContext = "fermeture inscriptions"; }
    }
    if (!countdownLabel) {
      const label = getCountdownLabel(new Date(dateStart));
      if (label) { countdownLabel = label; countdownContext = "début du tournoi"; }
    }
  }

  // Team fill gauge
  const filled = Math.min(teamCount, maxTeams);
  const pct = maxTeams > 0 ? Math.round((filled / maxTeams) * 100) : 0;
  const gaugeColor = pct >= 100 ? "var(--pink)" : pct >= 75 ? "var(--yellow)" : "var(--teal)";

  return (
    <div className="hero-extra-row">
      {/* Team fill gauge */}
      <div className="hero-gauge">
        <div className="hero-gauge__label">
          <span>{teamCount} / {maxTeams} équipes</span>
          {pct >= 100 && <span className="hero-gauge__full-badge">COMPLET</span>}
        </div>
        <div className="hero-gauge__track">
          <div
            className="hero-gauge__fill"
            style={{ width: `${pct}%`, background: gaugeColor }}
          />
        </div>
      </div>

      {/* Countdown pill */}
      {countdownLabel && !isOngoing && !isFinished && (
        <div className="hero-countdown">
          <span className="hero-countdown__value">{countdownLabel}</span>
          {countdownContext && <span className="hero-countdown__ctx">{countdownContext}</span>}
        </div>
      )}

      {isOngoing && (
        <div className="hero-countdown hero-countdown--live">
          <span className="hero-countdown__live-dot" />
          <span className="hero-countdown__value">EN COURS</span>
        </div>
      )}

      {isFinished && (
        <div className="hero-countdown hero-countdown--done">
          <span className="hero-countdown__value">TERMINÉ</span>
        </div>
      )}
    </div>
  );
}
