"use client";

import { useEffect, useState } from "react";
import { Pool, PoolTeam, Match, Team } from "@prisma/client";
import { computeStandings } from "@/lib/standings";

type PoolWithTeams = Pool & { teams: (PoolTeam & { team: Team })[] };

type MatchWithTeams = Match & { teamA?: Team | null; teamB?: Team | null };

export function PoolTables({
  pools,
  matches: initialMatches,
  tournamentId,
  scoringSystem,
  isLive = false,
}: {
  pools: PoolWithTeams[];
  matches: MatchWithTeams[];
  tournamentId: string;
  scoringSystem?: string | null;
  isLive?: boolean;
}) {
  const [matches, setMatches] = useState<MatchWithTeams[]>(initialMatches);

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
  const allPoolMatches = matches.filter((m) => pools.some((p) => p.id === m.poolId));
  const allPoolTeams = pools.flatMap((p) => p.teams.map((pt) => pt.team));
  const allFinished = allPoolMatches.length > 0 && allPoolMatches.every((m) => m.status === "FINISHED");
  const showCombined = pools.length >= 2 && allFinished;
  const combinedStandings = showCombined ? computeStandings(allPoolTeams, allPoolMatches as Match[], scoringSystem) : [];

  return (
    <div className="pool-tables">
      {showCombined && (
        <div className="pool-card">
          <h4>Classement général</h4>
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
                  <td>{row.name}</td>
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
      {pools.map((pool) => {
        const poolTeamIds = pool.teams.map((pt) => pt.teamId);
        const poolTeams = pool.teams.map((pt) => pt.team);
        const poolMatches = matches.filter((m) => m.poolId === pool.id);
        const standings = computeStandings(poolTeams, poolMatches as Match[], scoringSystem);

        const isGraz = poolMatches.some((m) => (m as any).phase === "GRAZ_RR");
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
                      <td>{row.name}</td>
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
                  Rounds 1–5
                </p>
                <MatchList ms={day1Matches} />
              </>
            )}
            {isGraz && day2Matches.length > 0 && (
              <>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", margin: "12px 0 6px" }}>
                  Rounds 6–7
                </p>
                <MatchList ms={day2Matches} />
              </>
            )}
            {!isGraz && <MatchList ms={day1Matches} />}
          </div>
        );
      })}
    </div>
  );
}
