"use client";

import { useEffect, useMemo, useState } from "react";
import { Match, MatchEvent, Team } from "@prisma/client";
import { useTranslations } from "next-intl";
import { formatTime } from "@/lib/utils";
import { MatchEditPanel, type MatchForEdit } from "./MatchEditPanel";

export type MatchWithTeams = Match & {
  teamA?: Team | null;
  teamB?: Team | null;
  events?: MatchEvent[];
  referee?: { id: string; name: string } | null;
  coReferee?: { id: string; name: string } | null;
};

const PHASE_LABEL: Record<string, string> = {
  POOL: "Poule", SWISS: "Swiss", CROSS_POOL: "Cross-pool", BRACKET: "Tableau",
  GRAZ_RR: "RR", GRAZ_REGROUP: "Regroup", GRAZ_SE: "SE",
  MTP_POOL_A: "Pool A", MTP_POOL_B: "Pool B", MTP_BARRAGE: "Barrage", MTP_DE: "DE",
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
  pools,
  isOrganizer,
  poolRounds = null,
  testMode = false,
}: {
  tournamentId: string;
  initialMatches: MatchWithTeams[];
  teams: Team[];
  pools?: { id: string; name: string }[];
  isOrganizer?: boolean;
  poolRounds?: number | null;
  testMode?: boolean;
}) {
  const t = useTranslations("tournament");
  const [matches, setMatches] = useState<MatchWithTeams[]>(initialMatches);
  const [filterTeamId, setFilterTeamId] = useState("");
  const [filterDay, setFilterDay] = useState("ALL");
  const [filterPhase, setFilterPhase] = useState("ALL");
  const [editMatch, setEditMatch] = useState<MatchForEdit | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingRound, setLoadingRound] = useState<string | null>(null);

  const STATUS_LABEL: Record<string, string> = {
    SCHEDULED: t("status_scheduled"),
    LIVE: t("status_live_icon"),
    FINISHED: t("status_finished_icon"),
  };

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
    teams.find((tm) => tm.id === id)?.name ?? "TBD";

  const openEdit = (match: MatchWithTeams) => {
    if (selectedId === match.id) {
      setSelectedId(null);
      setEditMatch(null);
      return;
    }
    setSelectedId(match.id);
    setEditMatch({
      id: match.id,
      teamAId: match.teamAId,
      teamBId: match.teamBId,
      teamAName: teamName(match.teamAId),
      teamBName: teamName(match.teamBId),
      scoreA: match.scoreA,
      scoreB: match.scoreB,
      status: match.status,
      phase: match.phase,
      roundIndex: match.roundIndex,
      courtName: match.courtName,
      refereePlayerId: match.refereePlayerId,
      coRefereePlayerId: match.coRefereePlayerId,
    });
  };

  const closePanel = () => {
    setSelectedId(null);
    setEditMatch(null);
  };

  const handleSaved = (updated: { id: string; scoreA: number; scoreB: number; status: string; teamAId?: string | null; teamBId?: string | null }) => {
    setMatches((prev) =>
      prev.map((m) => {
        if (m.id !== updated.id) return m;
        const patched: MatchWithTeams = { ...m, scoreA: updated.scoreA, scoreB: updated.scoreB, status: updated.status as Match["status"] };
        if (updated.teamAId !== undefined) {
          patched.teamAId = updated.teamAId;
          patched.teamA = teams.find((tm) => tm.id === updated.teamAId) ?? null;
        }
        if (updated.teamBId !== undefined) {
          patched.teamBId = updated.teamBId;
          patched.teamB = teams.find((tm) => tm.id === updated.teamBId) ?? null;
        }
        return patched;
      })
    );
    closePanel();
  };

  const generateRoundScores = async (groupKey: string, groupMatches: MatchWithTeams[]) => {
    const toGenerate = groupMatches.filter((m) => m.status !== "FINISHED");
    if (toGenerate.length === 0) return;
    setLoadingRound(groupKey);
    for (const match of toGenerate) {
      let sA = Math.floor(Math.random() * 6);
      let sB = Math.floor(Math.random() * 6);
      while (sA === sB) sB = Math.floor(Math.random() * 6);
      await fetch(`/api/matches/${match.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scoreA: sA, scoreB: sB, status: "FINISHED" }),
      });
      setMatches((prev) =>
        prev.map((m) =>
          m.id === match.id ? { ...m, scoreA: sA, scoreB: sB, status: "FINISHED" as Match["status"] } : m
        )
      );
    }
    setLoadingRound(null);
  };

  const filtered = useMemo(() => {
    return matches.filter((match) => {
      if (filterTeamId && match.teamAId !== filterTeamId && match.teamBId !== filterTeamId) return false;
      if (filterDay !== "ALL" && match.dayIndex !== filterDay) return false;
      if (filterPhase !== "ALL" && match.phase !== filterPhase) return false;
      return true;
    });
  }, [matches, filterTeamId, filterDay, filterPhase]);

  // Group matches by phase+round (for POOL: also by poolSessionIndex), sorted: active rounds first, then scheduled, then finished
  const roundGroups = useMemo(() => {
    const groups = new Map<string, { phase: string; roundIndex: number; poolSessionIndex?: number; bracketSide?: string | null; poolId?: string | null; matches: MatchWithTeams[] }>();

    // Sort all filtered by startAt
    const sorted = [...filtered].sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
    );

    for (const match of sorted) {
      // For POOL matches, separate by poolSessionIndex (A, B, etc.)
      const sessionSuffix = match.phase === "POOL" && match.poolSessionIndex !== null ? `-S${match.poolSessionIndex}` : "";
      // For BRACKET matches, separate by bracketSide (W/L/G for standard DE/SE, B/BG/BL for Bottom 8 in SWISS_SPLIT_SE)
      const bracketSuffix = match.phase === "BRACKET" && match.bracketSide ? `-${match.bracketSide}` : "";
      // For GRAZ_RR matches, separate by pool (poolId) so Pool A and Pool B are distinct groups
      const grazPoolSuffix = match.phase === "GRAZ_RR" && match.poolId ? `-P${match.poolId}` : "";
      // For GRAZ_REGROUP matches, separate by pool (Top / Mid1 / Mid2 / Bottom)
      const grazRegroupSuffix = match.phase === "GRAZ_REGROUP" && match.poolId ? `-P${match.poolId}` : "";
      const key = `${match.phase}-R${match.roundIndex}${sessionSuffix}${bracketSuffix}${grazPoolSuffix}${grazRegroupSuffix}`;
      if (!groups.has(key)) {
        groups.set(key, { phase: match.phase, roundIndex: match.roundIndex, poolSessionIndex: match.poolSessionIndex ?? undefined, bracketSide: match.bracketSide ?? undefined, poolId: match.poolId ?? null, matches: [] });
      }
      groups.get(key)!.matches.push(match);
    }

    // Sort groups: active rounds first, then scheduled, then finished (at the bottom)
    const entries = [...groups.values()];
    entries.sort((a, b) => {
      const aActive = isRoundActive(a.matches);
      const bActive = isRoundActive(b.matches);
      const aFinished = isRoundFinished(a.matches);
      const bFinished = isRoundFinished(b.matches);

      // Active rounds first
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;
      // Scheduled rounds second (not finished, not active)
      if (!aFinished && bFinished) return -1;
      if (aFinished && !bFinished) return 1;
      // Finished rounds last (most recently played first)
      if (aFinished && bFinished) {
        const aLatest = Math.max(...a.matches.map(m => new Date(m.startAt).getTime()));
        const bLatest = Math.max(...b.matches.map(m => new Date(m.startAt).getTime()));
        return bLatest - aLatest;
      }
      // Both scheduled: by round index ascending
      return a.roundIndex - b.roundIndex;
    });

    return entries;
  }, [filtered]);

  // Global match ordering for numbering (based on ALL matches, not filtered)
  // Sort by: phase order (POOL→SWISS→BRACKET), then roundIndex, then startAt, then court
  const globalOrder = useMemo(() => {
    // Global match number = chronological order by startAt per court
    // Each court has its own sequence: court 1 → 1,2,3... court 2 → 1,2,3...
    // If only 1 court, it's the true global sequence across all phases
    const byCourt = new Map<string, MatchWithTeams[]>();
    for (const m of matches) {
      const list = byCourt.get(m.courtName) ?? [];
      list.push(m);
      byCourt.set(m.courtName, list);
    }
    const map = new Map<string, number>();
    for (const courtMatches of byCourt.values()) {
      const sorted = [...courtMatches].sort(
        (a, b) =>
          new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
          || (a.positionInRound ?? 0) - (b.positionInRound ?? 0)
      );
      sorted.forEach((m, i) => map.set(m.id, i + 1));
    }
    return map;
  }, [matches]);

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
          {(match.referee || match.coReferee) && (
            <div className="match-card__referees">
              {match.referee && <span title="Referee">🏁 {match.referee.name}</span>}
              {match.coReferee && <span title="Co-referee">📱 {match.coReferee.name}</span>}
            </div>
          )}
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
            {t("filter_team")}
            <select value={filterTeamId} onChange={(e) => setFilterTeamId(e.target.value)}>
              <option value="">Toutes</option>
              {teams.filter((tm) => (tm as any).selected !== false).map((team) => (
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
          {t("click_match")}
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

        const sessionLabel = group.phase === "POOL" && group.poolSessionIndex !== undefined
          ? ` · Pool ${String.fromCharCode(65 + group.poolSessionIndex)}`
          : "";

        // For GRAZ_RR: show pool name (Pool A / Pool B)
        const grazPoolLabel = group.phase === "GRAZ_RR" && group.poolId
          ? ` · ${pools?.find((p) => p.id === group.poolId)?.name ?? "Pool"}`
          : group.phase === "GRAZ_REGROUP" && group.poolId
          ? ` · ${pools?.find((p) => p.id === group.poolId)?.name?.replace("Regroup-", "") ?? "Groupe"}`
          : "";

        // For BRACKET phase, show which bracket + match type based on bracketSide
        const bracketSide = group.matches[0]?.bracketSide;
        let bracketLabel = "";
        if (group.phase === "BRACKET" && bracketSide) {
          // Detect SWISS_SPLIT_SE by presence of B/BG/BL sides
          const isSplitSE = filtered.some((m) => m.phase === "BRACKET" && (m.bracketSide === "B" || m.bracketSide === "BG" || m.bracketSide === "BL"));
          if (isSplitSE) {
            // Top 10 / Bottom 8 labels for SWISS_SPLIT_SE
            if (bracketSide === "W") bracketLabel = " · Top 10";
            else if (bracketSide === "G") bracketLabel = " · Top 10 · Finale";
            else if (bracketSide === "L") bracketLabel = " · Top 10 · Petite finale";
            else if (bracketSide === "B") bracketLabel = " · Bottom 8";
            else if (bracketSide === "BG") bracketLabel = " · Bottom 8 · Finale";
            else if (bracketSide === "BL") bracketLabel = " · Bottom 8 · Manche des perdants";
          } else {
            // Standard DE or cross-pool DE
            if (bracketSide === "W") bracketLabel = "";
            else if (bracketSide === "L") bracketLabel = " · Repêchage";
            else if (bracketSide === "G") bracketLabel = " · Finale";
          }
        }

        const isTruncated = poolRounds !== null && group.phase === "POOL" && group.roundIndex > poolRounds;
        const groupKey = `${group.phase}-R${group.roundIndex}${sessionLabel.replace(/\s/g, "")}${bracketSide ?? ""}`;

        return (
          <div
            key={groupKey}
            className={`schedule-round${finished ? " schedule-round--finished" : ""}${active ? " schedule-round--active" : ""}${isTruncated ? " schedule-round--truncated" : ""}`}
          >
            <div className="schedule-round__header">
              <span className="schedule-round__label">
                {PHASE_LABEL[group.phase] ?? group.phase}{bracketLabel}{(bracketSide !== "G" && bracketSide !== "L" && bracketSide !== "BG" && bracketSide !== "BL") ? ` · Round ${group.roundIndex}` : ""}{sessionLabel}{grazPoolLabel}
              </span>
              {finished && <span className="schedule-round__badge schedule-round__badge--done">{t("status_completed")}</span>}
              {active && <span className="schedule-round__badge schedule-round__badge--live">{t("status_live")}</span>}
              {!finished && !active && <span className="schedule-round__badge schedule-round__badge--scheduled">{t("status_upcoming")}</span>}
              {isOrganizer && testMode && !finished && (
                <button
                  type="button"
                  title="Générer des scores aléatoires"
                  disabled={loadingRound === groupKey}
                  onClick={() => generateRoundScores(groupKey, group.matches)}
                  style={{
                    marginLeft: "auto",
                    background: "none",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontSize: 14,
                    padding: "2px 8px",
                    opacity: loadingRound === groupKey ? 0.5 : 1,
                  }}
                >
                  {loadingRound === groupKey ? "⏳" : "🎲"}
                </button>
              )}
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
        <div className="empty-state"><p>{t("schedule_no_filter_matches")}</p></div>
      )}

      <MatchEditPanel
        match={editMatch}
        onClose={closePanel}
        onSaved={handleSaved}
        isOrganizer={isOrganizer}
        teams={teams.map((tm) => ({ id: tm.id, name: tm.name }))}
      />
    </div>
  );
}
