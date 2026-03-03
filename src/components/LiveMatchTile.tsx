"use client";

import { useEffect, useState } from "react";
import { type MatchWithTeams } from "./ScheduleBoard";
import { formatTime } from "@/lib/utils";

const PHASE_LABEL: Record<string, string> = {
  POOL: "Poule",
  SWISS: "Swiss",
  BRACKET: "Tableau",
};

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Planifié",
  LIVE: "🔴 En cours",
  FINISHED: "✓ Terminé",
};

export function LiveMatchTile({
  tournamentId,
  initialMatches,
}: {
  tournamentId: string;
  initialMatches: MatchWithTeams[];
}) {
  const [matches, setMatches] = useState<MatchWithTeams[]>(initialMatches);

  // SSE listener — même pattern que ScheduleBoard
  useEffect(() => {
    const es = new EventSource(`/api/sse?tournamentId=${tournamentId}`);
    es.addEventListener("match", (event) => {
      const payload = JSON.parse((event as MessageEvent).data);

      if (payload?.type === "new_matches" && Array.isArray(payload.matches)) {
        setMatches((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const newOnes = (payload.matches as MatchWithTeams[]).filter(
            (m) => !existingIds.has(m.id)
          );
          return newOnes.length > 0 ? [...prev, ...newOnes] : prev;
        });
        return;
      }

      if (payload?.data) {
        const updated: MatchWithTeams = payload.data.match ?? payload.data;
        if (updated.id) {
          setMatches((prev) =>
            prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m))
          );
        }
      }
    });
    return () => es.close();
  }, [tournamentId]);

  // Matchs LIVE en cours
  const liveMatches = matches.filter((m) => m.status === "LIVE");

  // Prochains matchs SCHEDULED triés par heure (on deck / in the hole)
  const upcomingMatches = matches
    .filter((m) => m.status === "SCHEDULED")
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

  // Jusqu'à 3 cartes au total : LIVE en premier, puis on complète avec les suivants
  const slotsLeft = Math.max(0, 3 - liveMatches.length);
  const displayMatches = [...liveMatches, ...upcomingMatches.slice(0, slotsLeft)];

  if (displayMatches.length === 0) {
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
        {liveMatches.length > 0 ? "En cours & à venir" : "Prochains matchs"}
      </h3>
      <div className="live-match-tile__list">
        {displayMatches.map((match) => (
          <div
            key={match.id}
            className={`match-card match-card--${match.status.toLowerCase()}`}
          >
            <div className="match-card__corner match-card__corner--tl">
              <span className="pill">{match.courtName}</span>
            </div>
            <div className="match-card__corner match-card__corner--tr">
              <span>{formatTime(match.startAt)}</span>
            </div>

            <div className="match-card__center">
              <div
                className={`match-card__team${match.status === "FINISHED" && match.scoreA > match.scoreB ? " match-winner" : ""}`}
              >
                {match.teamA?.name ?? "TBD"}
              </div>
              <div className="match-card__score">
                <span>{match.scoreA}</span>
                <span style={{ opacity: 0.4, fontSize: 14 }}>–</span>
                <span>{match.scoreB}</span>
              </div>
              <div
                className={`match-card__team${match.status === "FINISHED" && match.scoreB > match.scoreA ? " match-winner" : ""}`}
              >
                {match.teamB?.name ?? "TBD"}
              </div>
            </div>

            <div className="match-card__corner match-card__corner--bl">
              <span className="pill">
                {PHASE_LABEL[match.phase] ?? match.phase} R{match.roundIndex}
              </span>
            </div>
            <div
              className={`match-card__corner match-card__corner--br match-card__status--${match.status.toLowerCase()}`}
            >
              <span>{STATUS_LABEL[match.status] ?? match.status}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
