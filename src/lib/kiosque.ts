/**
 * Kiosque format — 16 teams, 2 days
 *
 * Phase 1 — Swiss 5-6 rounds in 2 pools (8 teams each)
 *   Pool A + Pool B played on Day 1
 *
 * Phase 2 — Regroup from overall standings (pools merged):
 *   Top 4  → 2 Swiss rounds (no rematches from J1)
 *   Bottom 12 → 3 Swiss rounds (no rematches from J1)
 *
 * Phase 3 — SE × 8 from overall standings after regroup
 */

import { addMinutes } from "date-fns";
import { MatchDay, MatchPhase, MatchStatus, Team } from "@prisma/client";
import type { StandingRow } from "./standings";
import { generateSwissRound } from "./bracket";

// ─── Types ───────────────────────────────────────────────────────────────────

export type KiosqueMatch = {
  phase: MatchPhase;
  poolName?: string | null;
  bracketSide?: "W" | "L" | "G" | null;
  roundIndex: number;
  positionInRound?: number;
  courtName: string;
  startAt: Date;
  dayIndex: MatchDay;
  status: MatchStatus;
  teamAId: string | null;
  teamBId: string | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export function buildPlayedPairs(
  matches: Array<{ teamAId: string | null; teamBId: string | null }>
): Set<string> {
  const pairs = new Set<string>();
  for (const m of matches) {
    if (m.teamAId && m.teamBId) pairs.add(pairKey(m.teamAId, m.teamBId));
  }
  return pairs;
}

/**
 * Split 16 teams into 2 pools of 8 using snake draft by seed.
 */
export function generateKiosquePools(teams: Team[]): Array<{ name: string; teams: Team[] }> {
  const sorted = [...teams].sort((a, b) => a.seed - b.seed);
  const poolA: Team[] = [];
  const poolB: Team[] = [];

  sorted.forEach((team, idx) => {
    const round = Math.floor(idx / 2);
    const pos = idx % 2;
    const target = round % 2 === 0 ? (pos === 0 ? poolA : poolB) : (pos === 0 ? poolB : poolA);
    target.push(team);
  });

  return [
    { name: "Pool A", teams: poolA },
    { name: "Pool B", teams: poolB },
  ];
}

// ─── Phase 2: Regroup (Top 4 + Bottom 12) ────────────────────────────────────

/**
 * Generate Swiss rounds for a regroup group, avoiding rematches from J1.
 * @param groupTeams   Teams in this group (with seed for standings)
 * @param groupName    "Top 4" or "Bottom 12"
 * @param numRounds    2 for Top 4, 3 for Bottom 12
 * @param playedPairs  Pairs already played in J1 pools
 * @param existingGroupMatches  Matches already played within this group (previous regroup rounds)
 * @param roundOffset  Starting roundIndex (e.g. 1 for first regroup round)
 * @param standings    Current overall standings (for pairing order)
 * @param courtNames
 * @param startAt
 * @param gameDurationMin
 * @param phase
 */
export function generateKiosqueRegroupRound(
  groupTeams: Team[],
  groupName: string,
  roundOffset: number,
  playedPairs: Set<string>,
  standings: StandingRow[],
  courtNames: string[],
  startAt: Date,
  gameDurationMin: number,
  phase: MatchPhase
): KiosqueMatch[] {
  const rawMatches = generateSwissRound(
    groupTeams,
    standings,
    // Pass played pairs as existing matches so Swiss avoids them
    Array.from(playedPairs).map((key) => {
      const [a, b] = key.split(":");
      return { teamAId: a, teamBId: b };
    }),
    roundOffset,
    courtNames,
    startAt,
    gameDurationMin,
    "SUN"
  );

  return rawMatches.map((m, i) => ({
    phase,
    poolName: groupName,
    bracketSide: null,
    roundIndex: roundOffset,
    positionInRound: i,
    courtName: m.courtName,
    startAt: m.startAt,
    dayIndex: "SUN" as MatchDay,
    status: "SCHEDULED" as MatchStatus,
    teamAId: m.teamAId ?? null,
    teamBId: m.teamBId ?? null,
  }));
}

// ─── Phase 3: SE × 8 ─────────────────────────────────────────────────────────

/**
 * Generate SE bracket for 8 teams (standard seeding).
 * Seeds: 1v8, 4v5 in one half; 2v7, 3v6 in other half.
 * QF → SF → Final + 3rd place
 */
export function generateKiosqueSE(
  seedings: string[], // [seed1, seed2, ..., seed8] team IDs
  courtNames: string[],
  startAt: Date,
  gameDurationMin: number
): KiosqueMatch[] {
  const slotMin = gameDurationMin + 5;
  const roundBreak = gameDurationMin + 15;
  const courts = courtNames.length;

  // Standard bracket seeding for 8: 1v8, 5v4, 3v6, 7v2
  const qfPairs: [number, number][] = [
    [0, 7], // seed1 vs seed8
    [4, 3], // seed5 vs seed4
    [2, 5], // seed3 vs seed6
    [6, 1], // seed7 vs seed2
  ];

  const matches: KiosqueMatch[] = [];

  // QF round — spread across courts
  qfPairs.forEach(([a, b], i) => {
    const courtIdx = i % courts;
    const courtStart = new Date(startAt.getTime() + Math.floor(i / courts) * slotMin * 60000);
    matches.push({
      phase: "KIOSQUE_SE",
      bracketSide: "W",
      roundIndex: 1,
      positionInRound: i,
      courtName: courtNames[courtIdx],
      startAt: courtStart,
      dayIndex: "SUN",
      status: "SCHEDULED",
      teamAId: seedings[a] ?? null,
      teamBId: seedings[b] ?? null,
    });
  });

  const sfStart = addMinutes(startAt, roundBreak);
  // SF round
  matches.push({
    phase: "KIOSQUE_SE", bracketSide: "W", roundIndex: 2, positionInRound: 0,
    courtName: courtNames[0], startAt: sfStart,
    dayIndex: "SUN", status: "SCHEDULED", teamAId: null, teamBId: null,
  });
  matches.push({
    phase: "KIOSQUE_SE", bracketSide: "W", roundIndex: 2, positionInRound: 1,
    courtName: courtNames[courts > 1 ? 1 : 0], startAt: sfStart,
    dayIndex: "SUN", status: "SCHEDULED", teamAId: null, teamBId: null,
  });

  const finalStart = addMinutes(startAt, 2 * roundBreak);
  // 3rd place
  matches.push({
    phase: "KIOSQUE_SE", bracketSide: "L", roundIndex: 3, positionInRound: 0,
    courtName: courtNames[0], startAt: finalStart,
    dayIndex: "SUN", status: "SCHEDULED", teamAId: null, teamBId: null,
  });
  // Final
  matches.push({
    phase: "KIOSQUE_SE", bracketSide: "G", roundIndex: 3, positionInRound: 1,
    courtName: courtNames[courts > 1 ? 1 : 0], startAt: finalStart,
    dayIndex: "SUN", status: "SCHEDULED", teamAId: null, teamBId: null,
  });

  return matches;
}
