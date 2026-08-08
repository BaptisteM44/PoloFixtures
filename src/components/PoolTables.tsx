"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Pool, PoolTeam, Match, Team } from "@prisma/client";
import { computeStandings } from "@/lib/standings";

type PoolWithTeams = Pool & { teams: (PoolTeam & { team: Team })[] };

type MatchWithTeams = Match & { teamA?: Team | null; teamB?: Team | null };

type TeamWithPlayers = Team & { players: { player: { id: string; name: string } }[] };

export function PoolTables({
  pools,
  matches: initialMatches,
  tournamentId,
  scoringSystem,
  isLive = false,
  poolRounds = null,
  teamsWithPlayers = [],
  combinedOnly = false,
  combinedLive = false,
  inheritedMatchesByPool,
}: {
  pools: PoolWithTeams[];
  matches: MatchWithTeams[];
  tournamentId: string;
  scoringSystem?: string | null;
  isLive?: boolean;
  poolRounds?: number | null;
  teamsWithPlayers?: TeamWithPlayers[];
  /** N'affiche que le classement combiné (masque les tableaux par groupe) — onglet "Général" du pipeline. */
  combinedOnly?: boolean;
  /** Affiche le combiné même si tous les matchs ne sont pas terminés — classement live du pipeline. */
  combinedLive?: boolean;
  /**
   * Pipeline avec report de points (inheritFrom/carryPoints) : matchs des
   * étapes PRÉCÉDENTES à inclure dans le classement de chaque pool
   * (poolId → matchs). Sinon le classement d'une étape héritière ignore les
   * points reportés du RR/Swiss précédent.
   */
  inheritedMatchesByPool?: Record<string, MatchWithTeams[]>;
}) {
  const t = useTranslations("pool_tables");
  const [matches, setMatches] = useState<MatchWithTeams[]>(initialMatches);
  const [popoverTeamId, setPopoverTeamId] = useState<string | null>(null);
  const [popoverAnchor, setPopoverAnchor] = useState<{ x: number; y: number } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!popoverTeamId) return;
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverTeamId(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [popoverTeamId]);

  const teamPlayersMap = new Map(teamsWithPlayers.map((t) => [t.id, t.players.map((tp) => tp.player.name)]));
  const activeMatches = poolRounds !== null ? matches.filter((m) => m.roundIndex <= poolRounds) : matches;

  // Réhydrate les matchs hérités (report de points inheritFrom/carryPoints,
  // dont les matchs de cross-pool) depuis l'état SSE à jour : la prop
  // `inheritedMatchesByPool` est figée au render serveur, donc un match hérité
  // JOUÉ en direct (ex: un match de cross-pool) n'y apparaîtrait qu'après un
  // reload. On remappe par id sur `matches` (qui contient TOUS les matchs du
  // tournoi et reçoit les mises à jour SSE) pour que le score live soit compté.
  const liveById = new Map(matches.map((m) => [m.id, m]));
  const rehydratedInheritedByPool: Record<string, MatchWithTeams[]> | undefined =
    inheritedMatchesByPool
      ? Object.fromEntries(
          Object.entries(inheritedMatchesByPool).map(([poolId, ms]) => [
            poolId,
            ms.map((m) => liveById.get(m.id) ?? m),
          ])
        )
      : undefined;

  useEffect(() => {
    if (!isLive) return;
    const es = new EventSource(`/api/sse?tournamentId=${tournamentId}`);
    es.addEventListener("match", (event) => {
      const payload = JSON.parse((event as MessageEvent).data);
      if (payload?.data?.match) {
        setMatches((prev) => prev.map((m) => (m.id === payload.data.match.id ? { ...m, ...payload.data.match } : m)));
      }
    });
    return () => es.close();
  }, [tournamentId, isLive]);
  // Combined standings across all pools — shown when all pool matches are finished
  const allPoolMatches = activeMatches.filter((m) => pools.some((p) => p.id === m.poolId));
  const crossPoolMatches = activeMatches.filter((m) => (m as any).phase === "CROSS_POOL");
  const barrageMatches = activeMatches.filter((m) => (m as any).phase === "MTP_BARRAGE");
  const allPoolTeams = pools.flatMap((p) => p.teams.map((pt) => pt.team));
  const allFinished = allPoolMatches.length > 0 && allPoolMatches.every((m) => m.status === "FINISHED");
  const showCombined = pools.length >= 2 && (allFinished || combinedLive);
  // Matchs hérités (report de points pipeline) de toutes les pools affichées,
  // dédoublonnés par id — pour que le classement "Général" cumule aussi.
  const allInheritedMatches = (() => {
    if (!rehydratedInheritedByPool) return [] as MatchWithTeams[];
    const seen = new Set<string>();
    const out: MatchWithTeams[] = [];
    for (const p of pools) {
      for (const m of rehydratedInheritedByPool[p.id] ?? []) {
        if (!seen.has(m.id)) { seen.add(m.id); out.push(m); }
      }
    }
    return out;
  })();
  const combinedMatchesForStandings = [...allPoolMatches, ...crossPoolMatches, ...allInheritedMatches] as Match[];
  const combinedStandings = showCombined ? computeStandings(allPoolTeams, combinedMatchesForStandings, scoringSystem) : [];

  // Mini-table for seeds 13-20 (barrage teams): pools + cross + barrage
  // Only shown when barrage matches exist
  const showBarrageStandings = barrageMatches.length > 0;
  const barrageTeamIds = showBarrageStandings
    ? new Set([
        ...barrageMatches.map((m: any) => m.teamAId).filter(Boolean),
        ...barrageMatches.map((m: any) => m.teamBId).filter(Boolean),
      ] as string[])
    : new Set<string>();
  // For barrage standings, compute over all 20 teams so inter-group Swiss matches are counted,
  // then filter the display to only the 8 barrage teams
  const barrageStandingsFull = showBarrageStandings
    ? computeStandings(allPoolTeams, [...allPoolMatches, ...crossPoolMatches, ...barrageMatches] as Match[], scoringSystem)
    : [];
  const barrageStandings = barrageStandingsFull.filter((row) => barrageTeamIds.has(row.teamId));

  const TeamCell = ({ teamId, name }: { teamId: string; name: string }) => {
    const players = teamPlayersMap.get(teamId);
    if (!players || players.length === 0) return <>{name}</>;
    return (
      <span
        style={{ cursor: "pointer", textDecoration: "underline dotted", textUnderlineOffset: 3 }}
        onClick={(e) => {
          e.stopPropagation();
          if (popoverTeamId === teamId) { setPopoverTeamId(null); return; }
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setPopoverAnchor({ x: rect.left, y: rect.bottom + 6 });
          setPopoverTeamId(teamId);
        }}
      >
        {name}
      </span>
    );
  };

  const popoverPlayers = popoverTeamId ? (teamPlayersMap.get(popoverTeamId) ?? []) : [];

  return (
    <div className="pool-tables">
      {popoverTeamId && popoverAnchor && (
        <div
          ref={popoverRef}
          style={{
            position: "fixed",
            top: popoverAnchor.y,
            left: popoverAnchor.x,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "10px 14px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
            zIndex: 1000,
            minWidth: 140,
            fontSize: 13,
          }}
        >
          {popoverPlayers.map((name) => (
            <div key={name} style={{ padding: "3px 0", color: "var(--text)" }}>{name}</div>
          ))}
        </div>
      )}
      {showCombined && (
        <div className="pool-card">
          <h4>{t("overall_standings")}</h4>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Team</th>
                <th>W</th>
                <th>D</th>
                <th>L</th>
                <th>GF</th>
                <th>GA</th>
                <th>Diff</th>
                <th>Pts</th>
                <th title="Buchholz (force adversaires)">Buch.</th>
              </tr>
            </thead>
            <tbody>
              {combinedStandings.map((row, i) => (
                <tr key={row.teamId}>
                  <td style={{ fontWeight: 700, color: "var(--text-muted)", width: 28 }}>{i + 1}</td>
                  <td><TeamCell teamId={row.teamId} name={row.name} /></td>
                  <td>{row.wins}</td>
                  <td>{row.draws}</td>
                  <td>{row.losses}</td>
                  <td>{row.goalsFor}</td>
                  <td>{row.goalsAgainst}</td>
                  <td style={{ color: row.goalDiff > 0 ? "var(--teal)" : row.goalDiff < 0 ? "var(--danger)" : undefined }}>
                    {row.goalDiff > 0 ? `+${row.goalDiff}` : row.goalDiff}
                  </td>
                  <td style={{ fontWeight: 700 }}>{row.points}</td>
                  <td>{row.buchholz}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showBarrageStandings && (
        <div className="pool-card">
          <h4>{t("barrage_standings" as any)}</h4>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Team</th>
                <th>W</th>
                <th>D</th>
                <th>L</th>
                <th>GF</th>
                <th>GA</th>
                <th>Diff</th>
                <th>Pts</th>
                <th title="Buchholz (force adversaires)">Buch.</th>
              </tr>
            </thead>
            <tbody>
              {barrageStandings.map((row, i) => (
                <tr key={row.teamId}>
                  <td style={{ fontWeight: 700, color: "var(--text-muted)", width: 28 }}>{i + 1}</td>
                  <td><TeamCell teamId={row.teamId} name={row.name} /></td>
                  <td>{row.wins}</td>
                  <td>{row.draws}</td>
                  <td>{row.losses}</td>
                  <td>{row.goalsFor}</td>
                  <td>{row.goalsAgainst}</td>
                  <td style={{ color: row.goalDiff > 0 ? "var(--teal)" : row.goalDiff < 0 ? "var(--danger)" : undefined }}>
                    {row.goalDiff > 0 ? `+${row.goalDiff}` : row.goalDiff}
                  </td>
                  <td style={{ fontWeight: 700 }}>{row.points}</td>
                  <td>{row.buchholz}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!combinedOnly && pools.map((pool) => {
        const poolTeamIds = pool.teams.map((pt) => pt.teamId);
        const poolTeams = pool.teams.map((pt) => pt.team);
        const isRegroupPool = pool.name.startsWith("Regroup-");
        const poolMatches = activeMatches.filter((m) => m.poolId === pool.id);
        // For Regroup pools, include recycled intra-pool RR matches (both teams in group)
        const recycledRR = isRegroupPool
          ? activeMatches.filter(
              (m) =>
                (m as any).phase === "GRAZ_RR" &&
                m.teamAId && m.teamBId &&
                poolTeamIds.includes(m.teamAId) &&
                poolTeamIds.includes(m.teamBId)
            )
          : [];
        const inherited = rehydratedInheritedByPool?.[pool.id] ?? [];
        const standingsMatches = [...poolMatches, ...recycledRR, ...inherited];
        const standings = computeStandings(poolTeams, standingsMatches as Match[], scoringSystem);

        const isGraz = poolMatches.some((m) => (m as any).phase === "GRAZ_RR");
        const isRegroup = isRegroupPool && poolMatches.some((m) => (m as any).phase === "GRAZ_REGROUP");
        const day1Matches = isGraz ? poolMatches.filter((m) => (m as any).dayIndex === "SAT") : poolMatches;
        const day2Matches = isGraz ? poolMatches.filter((m) => (m as any).dayIndex === "SUN") : [];

        const MatchList = ({ ms }: { ms: MatchWithTeams[] }) => (
          <div className="pool-matches">
            {ms.map((match) => (
              <div key={match.id} className="pool-match">
                <span>{match.teamA?.name ?? "TBD"} vs {match.teamB?.name ?? "TBD"}</span>
                <strong>{match.scoreA} - {match.scoreB}</strong>
                <span className="meta">{match.status}</span>
              </div>
            ))}
          </div>
        );

        return (
          <div key={pool.id} className="pool-card">
            <h4>{pool.name}</h4>
            <table>
              <thead>
                <tr>
                  <th>Team</th>
                  <th>W</th>
                  <th>D</th>
                  <th>L</th>
                  <th>GF</th>
                  <th>GA</th>
                  <th>Pts</th>
                  <th title="Buchholz (force adversaires)">Buch.</th>
                </tr>
              </thead>
              <tbody>
                {standings
                  .filter((row) => poolTeamIds.includes(row.teamId))
                  .map((row) => (
                    <tr key={row.teamId}>
                      <td><TeamCell teamId={row.teamId} name={row.name} /></td>
                      <td>{row.wins}</td>
                      <td>{row.draws}</td>
                      <td>{row.losses}</td>
                      <td>{row.goalsFor}</td>
                      <td>{row.goalsAgainst}</td>
                      <td>{row.points}</td>
                      <td>{row.buchholz}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {isGraz && day1Matches.length > 0 && (
              <>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", margin: "12px 0 6px" }}>
                  {t("rounds_1_5")}
                </p>
                <MatchList ms={day1Matches} />
              </>
            )}
            {isGraz && day2Matches.length > 0 && (
              <>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", margin: "12px 0 6px" }}>
                  {t("rounds_6_7")}
                </p>
                <MatchList ms={day2Matches} />
              </>
            )}
            {isRegroup && recycledRR.length > 0 && (
              <>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", margin: "12px 0 6px" }}>
                  {t("recycled_score")}
                </p>
                <MatchList ms={recycledRR as MatchWithTeams[]} />
              </>
            )}
            {isRegroup && (
              <>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", margin: "12px 0 6px" }}>
                  {t("new_matches")}
                </p>
                <MatchList ms={poolMatches} />
              </>
            )}
            {!isGraz && !isRegroup && <MatchList ms={day1Matches} />}
          </div>
        );
      })}
    </div>
  );
}
