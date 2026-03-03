"use client";

import { useEffect, useMemo, useState } from "react";
import { Match, Team } from "@prisma/client";
import { formatTime } from "@/lib/utils";
import { MatchEditPanel, type MatchForEdit } from "./MatchEditPanel";

export type MatchWithTeams = Match & { teamA?: Team | null; teamB?: Team | null };

const PHASE_LABEL: Record<string, string> = {
  POOL: "Poule", SWISS: "Swiss", BRACKET: "Tableau",
};

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Planifié", LIVE: "🔴 En cours", FINISHED: "✓ Terminé",
};

function positionLabel(match: MatchWithTeams, courtMatches: MatchWithTeams[]) {
  if (match.status === "FINISHED") return "Terminé";
  if (match.status === "LIVE") return "Sur court";
  const scheduled = courtMatches.filter((m) => m.status === "SCHEDULED");
  const idx = scheduled.findIndex((m) => m.id === match.id);
  if (idx === 0) return "Suivant";
  if (idx === 1) return "In the hole";
  return "En attente";
}

/** Check if a round is fully finished */
function isRoundFinished(matches: MatchWithTeams[]) {
  return matches.length > 0 && matches.every((m) => m.status === "FINISHED");
}

/** Check if a round has any active (LIVE) match */
function isRoundActive(matches: MatchWithTeams[]) {
  return matches.some((m) => m.status === "LIVE");
}

export function ScheduleBoard({
  tournamentId,
  initialMatches,
  teams,
}: {
  tournamentId: string;
  initialMatches: MatchWithTeams[];
  teams: Team[];
}) {
  const [matches, setMatches] = useState<MatchWithTeams[]>(initialMatches);
  const [filterTeamId, setFilterTeamId] = useState("");
  const [filterDay, setFilterDay] = useState("ALL");
  const [filterPhase, setFilterPhase] = useState("ALL");
  const [editMatch, setEditMatch] = useState<MatchForEdit | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const es = new EventSource(`/api/sse?tournamentId=${tournamentId}`);
    es.addEventListener("match", (event) => {
      const payload = JSON.parse((event as MessageEvent).data);

      // Handle new matches (e.g. auto-generated Swiss round)
      if (payload?.type === "new_matches" && Array.isArray(payload.matches)) {
        setMatches((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const newOnes = (payload.matches as MatchWithTeams[]).filter((m) => !existingIds.has(m.id));
          return newOnes.length > 0 ? [...prev, ...newOnes] : prev;
        });
        return;
      }

      // Handle match updates — payload.data can be the match directly (PUT route)
      // or { event, match } (events route from RefereePanel)
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

  const teamName = (id?: string | null) =>
    teams.find((t) => t.id === id)?.name ?? "TBD";

  const openEdit = (match: MatchWithTeams) => {
    if (selectedId === match.id) {
      setSelectedId(null);
      setEditMatch(null);
      return;
    }
    setSelectedId(match.id);
    setEditMatch({
      id: match.id,
      teamAName: teamName(match.teamAId),
      teamBName: teamName(match.teamBId),
      scoreA: match.scoreA,
      scoreB: match.scoreB,
      status: match.status,
      phase: match.phase,
      roundIndex: match.roundIndex,
      courtName: match.courtName,
    });
  };

  const closePanel = () => {
    setSelectedId(null);
    setEditMatch(null);
  };

  const handleSaved = (updated: { id: string; scoreA: number; scoreB: number; status: string }) => {
    setMatches((prev) =>
      prev.map((m) =>
        m.id === updated.id
          ? { ...m, scoreA: updated.scoreA, scoreB: updated.scoreB, status: updated.status as Match["status"] }
          : m
      )
    );
    closePanel();
  };

  const filtered = useMemo(() => {
    return matches.filter((match) => {
      if (filterTeamId && match.teamAId !== filterTeamId && match.teamBId !== filterTeamId) return false;
      if (filterDay !== "ALL" && match.dayIndex !== filterDay) return false;
      if (filterPhase !== "ALL" && match.phase !== filterPhase) return false;
      return true;
    });
  }, [matches, filterTeamId, filterDay, filterPhase]);

  // Group matches by phase+round, sorted: active rounds first, then scheduled, then finished
  const roundGroups = useMemo(() => {
    const groups = new Map<string, { phase: string; roundIndex: number; matches: MatchWithTeams[] }>();

    // Sort all filtered by startAt
    const sorted = [...filtered].sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
    );

    for (const match of sorted) {
      const key = `${match.phase}-R${match.roundIndex}`;
      if (!groups.has(key)) {
        groups.set(key, { phase: match.phase, roundIndex: match.roundIndex, matches: [] });
      }
      groups.get(key)!.matches.push(match);
    }

    // Sort groups: active first, then scheduled, then finished
    const entries = [...groups.values()];
    entries.sort((a, b) => {
      const aActive = isRoundActive(a.matches);
      const bActive = isRoundActive(b.matches);
      const aFinished = isRoundFinished(a.matches);
      const bFinished = isRoundFinished(b.matches);

      // Active rounds first
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;
      // Then scheduled (not finished, not active)
      if (!aFinished && bFinished) return -1;
      if (aFinished && !bFinished) return 1;
      // Within same category, sort by round index
      return a.roundIndex - b.roundIndex;
    });

    return entries;
  }, [filtered]);

  // Global match ordering for numbering
  const globalOrder = useMemo(() => {
    const sorted = [...filtered].sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
    );
    const map = new Map<string, number>();
    sorted.forEach((m, i) => map.set(m.id, i + 1));
    return map;
  }, [filtered]);

  const phases = [...new Set(matches.map((m) => m.phase))];

  // For multi-court: group matches by court within a round
  const byCourtInRound = (roundMatches: MatchWithTeams[]) => {
    const map = new Map<string, MatchWithTeams[]>();
    for (const match of roundMatches) {
      const list = map.get(match.courtName) ?? [];
      list.push(match);
      map.set(match.courtName, list);
    }
    return map;
  };

  const renderMatchCard = (match: MatchWithTeams, courtMatches: MatchWithTeams[]) => (
    <div key={match.id}>
      <button
        className={`match-card match-card--${match.status.toLowerCase()}${selectedId === match.id ? " match-card--selected" : ""}`}
        onClick={() => openEdit(match)}
        type="button"
      >
        <div className="match-card__corner match-card__corner--tl">
          <span className="match-card__number">{globalOrder.get(match.id)}</span>
          <span className="pill">{positionLabel(match, courtMatches)}</span>
        </div>
        <div className="match-card__corner match-card__corner--tr">
          <span>{formatTime(match.startAt)}</span>
        </div>

        <div className="match-card__center">
          <div className={`match-card__team${match.status === "FINISHED" && match.scoreA > match.scoreB ? " match-winner" : ""}`}>
            {teamName(match.teamAId)}
          </div>
          <div className="match-card__score">
            <span>{match.scoreA}</span>
            <span style={{ opacity: 0.4, fontSize: 14 }}>–</span>
            <span>{match.scoreB}</span>
          </div>
          <div className={`match-card__team${match.status === "FINISHED" && match.scoreB > match.scoreA ? " match-winner" : ""}`}>
            {teamName(match.teamBId)}
          </div>
        </div>

        <div className="match-card__corner match-card__corner--bl">
          <span className="pill">{PHASE_LABEL[match.phase] ?? match.phase} R{match.roundIndex}</span>
        </div>
        <div className={`match-card__corner match-card__corner--br match-card__status--${match.status.toLowerCase()}`}>
          <span>{STATUS_LABEL[match.status] ?? match.status}</span>
        </div>
      </button>
    </div>
  );

  return (
    <div className="schedule-board" style={{ paddingBottom: editMatch ? 220 : 0 }}>
      <div className="panel">
        <div className="form-grid">
          <label>
            Équipe
            <select value={filterTeamId} onChange={(e) => setFilterTeamId(e.target.value)}>
              <option value="">Toutes</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
            </select>
          </label>
          <label>
            Jour
            <select value={filterDay} onChange={(e) => setFilterDay(e.target.value)}>
              <option value="ALL">Tous</option>
              <option value="SAT">Samedi</option>
              <option value="SUN">Dimanche</option>
            </select>
          </label>
          <label>
            Phase
            <select value={filterPhase} onChange={(e) => setFilterPhase(e.target.value)}>
              <option value="ALL">Toutes</option>
              {phases.map((p) => (
                <option key={p} value={p}>{PHASE_LABEL[p] ?? p}</option>
              ))}
            </select>
          </label>
        </div>
        <p style={{ margin: "12px 0 0", fontSize: 13, color: "var(--text-muted)" }}>
          Cliquez sur un match pour saisir le score.
        </p>
      </div>

      {roundGroups.map((group) => {
        const finished = isRoundFinished(group.matches);
        const active = isRoundActive(group.matches);
        const courts = byCourtInRound(group.matches);
        const courtCount = courts.size;
        const allCourtMatches = [...group.matches].sort(
          (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
        );

        return (
          <div
            key={`${group.phase}-R${group.roundIndex}`}
            className={`schedule-round${finished ? " schedule-round--finished" : ""}${active ? " schedule-round--active" : ""}`}
          >
            <div className="schedule-round__header">
              <span className="schedule-round__label">
                {PHASE_LABEL[group.phase] ?? group.phase} · Round {group.roundIndex}
              </span>
              {finished && <span className="schedule-round__badge schedule-round__badge--done">Terminé</span>}
              {active && <span className="schedule-round__badge schedule-round__badge--live">En cours</span>}
              {!finished && !active && <span className="schedule-round__badge schedule-round__badge--scheduled">À venir</span>}
            </div>

            {courtCount > 1 ? (
              <div
                className="schedule-courts--multi"
                style={{ "--court-count": courtCount } as React.CSSProperties}
              >
                {[...courts.entries()].map(([court, courtMatches]) => (
                  <div key={court} className="schedule-court">
                    <h4>{court}</h4>
                    <div className="match-cards">
                      {courtMatches.map((match) => renderMatchCard(match, courtMatches))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="schedule-courts--single">
                <div className="match-cards">
                  {allCourtMatches.map((match) => renderMatchCard(match, allCourtMatches))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {filtered.length === 0 && (
        <div className="empty-state"><p>Aucun match pour ces filtres.</p></div>
      )}

      <MatchEditPanel
        match={editMatch}
        onClose={closePanel}
        onSaved={handleSaved}
      />
    </div>
  );
}
