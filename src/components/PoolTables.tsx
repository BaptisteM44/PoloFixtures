"use client";

import { useEffect, useState } from "react";
import { Pool, PoolTeam, Match, Team } from "@prisma/client";
import { computeStandings } from "@/lib/standings";

type PoolWithTeams = Pool & { teams: (PoolTeam & { team: Team })[] };

type MatchWithTeams = Match & { teamA?: Team | null; teamB?: Team | null };

export function PoolTables({
  pools,
  matches: initialMatches,
  tournamentId
}: {
  pools: PoolWithTeams[];
  matches: MatchWithTeams[];
  tournamentId: string;
}) {
  const [matches, setMatches] = useState<MatchWithTeams[]>(initialMatches);

  useEffect(() => {
    const es = new EventSource(`/api/sse?tournamentId=${tournamentId}`);
    es.addEventListener("match", (event) => {
      const payload = JSON.parse((event as MessageEvent).data);
      if (payload?.data?.match) {
        setMatches((prev) => prev.map((m) => (m.id === payload.data.match.id ? { ...m, ...payload.data.match } : m)));
      }
    });
    return () => es.close();
  }, [tournamentId]);
  return (
    <div className="pool-tables">
      {pools.map((pool) => {
        const poolTeamIds = pool.teams.map((pt) => pt.teamId);
        const poolTeams = pool.teams.map((pt) => pt.team);
        const poolMatches = matches.filter((m) => m.poolId === pool.id);
        const standings = computeStandings(poolTeams, poolMatches as Match[]);

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
                    </tr>
                  ))}
              </tbody>
            </table>
            <div className="pool-matches">
              {poolMatches.map((match) => (
                <div key={match.id} className="pool-match">
                  <span>{match.teamA?.name ?? "TBD"} vs {match.teamB?.name ?? "TBD"}</span>
                  <strong>{match.scoreA} - {match.scoreB}</strong>
                  <span className="meta">{match.status}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
