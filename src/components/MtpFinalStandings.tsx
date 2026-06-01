"use client";

import { useTranslations } from "next-intl";
import { computeStandings } from "@/lib/standings";
import type { Team, Match } from "@prisma/client";

type Props = {
  teams: Team[];
  matches: any[];
  scoringSystem: string;
  swissRounds: number;
};

type FinalRow = {
  rank: number;
  team: Team;
  status: "confirmed" | "in_de" | "in_barrage" | "pool_only";
  note?: string;
};

export function MtpFinalStandings({ teams, matches, scoringSystem, swissRounds }: Props) {
  const t = useTranslations("tournament");

  const poolAMatches = matches.filter((m) => m.phase === "MTP_POOL_A");
  const poolBMatches = matches.filter((m) => m.phase === "MTP_POOL_B");
  const barrageMatches = matches.filter((m) => m.phase === "MTP_BARRAGE");
  const deMatches = matches.filter((m) => m.phase === "MTP_DE");

  if (poolAMatches.length === 0 && poolBMatches.length === 0) {
    return (
      <div className="panel" style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>
        {t("mtp_standings_not_ready" as any)}
      </div>
    );
  }

  // Use overall standings (pool + cross-pool) — matches the public "Overall standings" table
  const crossPoolMatches = matches.filter((m) => m.phase === "CROSS_POOL");
  const allStandingsMatches = [...poolAMatches, ...poolBMatches, ...crossPoolMatches] as Match[];
  const combined = computeStandings(teams, allStandingsMatches, scoringSystem);

  const teamMap = new Map(teams.map((t) => [t.id, t]));

  // ── Positions 17-20 from barrage losers ──────────────────────────────────
  // seeds 13-20 from combined standings
  const seeds13to20 = combined.slice(12, 20);

  // For each barrage match, identify winner and loser
  const barrageResults = new Map<string, { winner: string | null; loser: string | null }>();
  for (const m of barrageMatches) {
    if (m.winnerTeamId) {
      const loser = m.teamAId === m.winnerTeamId ? m.teamBId : m.teamAId;
      barrageResults.set(m.id, { winner: m.winnerTeamId, loser });
    } else {
      barrageResults.set(m.id, { winner: null, loser: null });
    }
  }

  const barrageWinnerIds = new Set(
    [...barrageResults.values()].map((r) => r.winner).filter(Boolean) as string[]
  );
  const barrageLoserIds = new Set(
    [...barrageResults.values()].map((r) => r.loser).filter(Boolean) as string[]
  );

  // Losers ranked 17-20 by their seed position in combined (index 12-19)
  const losers17to20: Array<{ team: Team; seedRank: number }> = [];
  for (const s of seeds13to20) {
    if (barrageLoserIds.has(s.teamId)) {
      const team = teamMap.get(s.teamId);
      if (team) losers17to20.push({ team, seedRank: combined.findIndex((c) => c.teamId === s.teamId) });
    }
  }
  losers17to20.sort((a, b) => a.seedRank - b.seedRank);

  // ── Positions 1-16 from DE ────────────────────────────────────────────────
  // Build DE bracket positions from match results
  // We infer positions from losers at each round:
  // WB losers R1 → not applicable (drop to LB)
  // LB R1 losers → 13-16 (4 teams)
  // LB R2 losers → 9-12 (4 teams)
  // LB R3 losers → 7-8 (2 teams)
  // LB R4 losers → 5-6 (2 teams)
  // LB R5 loser → 3-4 (with WB final loser)
  // GF loser → 2nd, GF winner → 1st

  const deFinished = deMatches.filter((m) => m.status === "FINISHED");

  // Collect DE losers by bracketSide+round
  const deLosers: Map<string, string[]> = new Map(); // key = "side_round"
  for (const m of deFinished) {
    if (!m.winnerTeamId) continue;
    const loser = m.teamAId === m.winnerTeamId ? m.teamBId : m.teamAId;
    if (!loser) continue;
    const key = `${m.bracketSide}_${m.roundIndex}`;
    if (!deLosers.has(key)) deLosers.set(key, []);
    deLosers.get(key)!.push(loser);
  }

  // GF winner
  const gfMatch = deMatches.find((m) => m.bracketSide === "G" && m.status === "FINISHED");
  const gfResetMatch = deMatches.find((m) => m.bracketSide === "BG" && m.status === "FINISHED");
  const finalMatch = gfResetMatch ?? gfMatch;
  const rank1Id = finalMatch?.winnerTeamId ?? null;
  const rank2Id = finalMatch ? (finalMatch.teamAId === rank1Id ? finalMatch.teamBId : finalMatch.teamAId) : null;

  // LB final loser → 3rd or 4th (WB final loser gets same bracket, LBF loser = 3rd/4th)
  const lbFinalLosers = deLosers.get("L_5") ?? [];
  const wbFinalLosers = deLosers.get("W_4") ?? [];

  // Rank positions
  const rankMap = new Map<string, number>();

  if (rank1Id) rankMap.set(rank1Id, 1);
  if (rank2Id) rankMap.set(rank2Id, 2);

  // 3rd/4th: WB final loser + LB R5 loser
  const thirdFourth = [...wbFinalLosers, ...lbFinalLosers].filter((id) => id !== rank1Id && id !== rank2Id);
  thirdFourth.forEach((id, i) => rankMap.set(id, 3 + i));

  // 5th/6th: LB R4 losers
  (deLosers.get("L_4") ?? []).forEach((id, i) => rankMap.set(id, 5 + i));

  // 7th/8th: LB R3 losers
  (deLosers.get("L_3") ?? []).forEach((id, i) => rankMap.set(id, 7 + i));

  // 9th-12th: LB R2 losers
  (deLosers.get("L_2") ?? []).forEach((id, i) => rankMap.set(id, 9 + i));

  // 13th-16th: LB R1 losers
  (deLosers.get("L_1") ?? []).forEach((id, i) => rankMap.set(id, 13 + i));

  // 17th-20th: barrage losers by seed
  losers17to20.forEach(({ team }, i) => rankMap.set(team.id, 17 + i));

  // ── Build rows ────────────────────────────────────────────────────────────
  const rows: FinalRow[] = [];

  // 1-16: DE participants (top12 + barrage winners)
  const top12 = combined.slice(0, 12).map((s) => teamMap.get(s.teamId)!).filter(Boolean);
  // Barrage winners inherit best seed of their match (sorted by positionInRound)
  const barrageWinners = barrageMatches
    .filter((m) => m.winnerTeamId && barrageWinnerIds.has(m.winnerTeamId))
    .sort((a, b) => (a as any).positionInRound - (b as any).positionInRound)
    .map((m) => teamMap.get(m.winnerTeamId!)!)
    .filter(Boolean);

  const de16 = [...top12, ...barrageWinners];

  for (const team of de16) {
    const rank = rankMap.get(team.id);
    rows.push({
      rank: rank ?? 0,
      team,
      status: rank ? "confirmed" : "in_de",
    });
  }

  // 17-20: barrage losers
  for (const { team } of losers17to20) {
    const rank = rankMap.get(team.id);
    rows.push({
      rank: rank ?? 0,
      team,
      status: rank ? "confirmed" : "in_barrage",
    });
  }

  // Teams still in barrage (not yet finished)
  const pendingBarrageIds = seeds13to20
    .filter((s) => !barrageWinnerIds.has(s.teamId) && !barrageLoserIds.has(s.teamId))
    .map((s) => s.teamId);
  for (const id of pendingBarrageIds) {
    const team = teamMap.get(id);
    if (team) rows.push({ rank: 0, team, status: "in_barrage" });
  }

  // Sort: confirmed ranks first, then 0s at end
  rows.sort((a, b) => {
    if (a.rank && b.rank) return a.rank - b.rank;
    if (a.rank) return -1;
    if (b.rank) return 1;
    return 0;
  });

  const medalColor = (rank: number) => {
    if (rank === 1) return "#FFD700";
    if (rank === 2) return "#C0C0C0";
    if (rank === 3) return "#CD7F32";
    return undefined;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "0 0 32px" }}>
      <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ background: "var(--bg-muted)", borderBottom: "1px solid var(--border)" }}>
              <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", width: 48 }}>#</th>
              <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>{t("mtp_standings_team" as any)}</th>
              <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>{t("mtp_standings_status" as any)}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.team.id} style={{
                borderBottom: "1px solid var(--border)",
                background: i % 2 === 0 ? undefined : "var(--bg-muted)",
              }}>
                <td style={{ padding: "10px 12px", fontWeight: 700, fontSize: 16, color: medalColor(row.rank) ?? "var(--text-muted)" }}>
                  {row.rank > 0 ? row.rank : "—"}
                </td>
                <td style={{ padding: "10px 12px", fontWeight: 600 }}>
                  {row.team.name}
                </td>
                <td style={{ padding: "10px 12px", fontSize: 12, color: "var(--text-muted)" }}>
                  {row.status === "confirmed" && row.rank > 0 && (
                    <span style={{ color: row.rank <= 3 ? medalColor(row.rank) : row.rank <= 12 ? "var(--teal)" : "var(--text-muted)" }}>
                      {row.rank <= 16
                        ? t("mtp_standings_de" as any)
                        : t("mtp_standings_eliminated" as any)}
                    </span>
                  )}
                  {row.status === "in_de" && <span style={{ color: "var(--teal)" }}>{t("mtp_standings_in_de" as any)}</span>}
                  {row.status === "in_barrage" && <span style={{ color: "var(--warning)" }}>{t("mtp_standings_in_barrage" as any)}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
