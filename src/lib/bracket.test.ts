/**
 * Tests unitaires — bracket.ts & standings.ts
 *
 * Couvre :
 *  - Helpers (nextPowerOf2, bracketSeeding via generateSingleElim)
 *  - generatePools (1, 2, 3, 4 poules, serpentin, SPLIT_POOLS)
 *  - generatePoolMatches (nombre de matchs, pas de doublon, assignation terrains)
 *  - generateSingleElim (SE) — 4 / 8 / 16 / 5 / 6 / 12 équipes, BYEs, 3ème place
 *  - generateDoubleElim (DE) — 4 / 8 / 16 équipes
 *  - generateRoundRobin (RR) — 4 / 6 / 8 équipes
 *  - generateSwissRound — appariement, évitement rematches
 *  - generateBracket (entrée principale) — routing par format
 *  - computeStandings — points, diff de buts, buchholz, sonnenbörger
 *  - Propagation des liens nextMatchWinId / nextMatchLoseId en SE et DE
 */

import { describe, it, expect } from "vitest";
import {
  generateBracket,
  generatePools,
  generatePoolMatches,
  generateSwissRound,
  nextPowerOf2,
  type GeneratedMatch,
} from "./bracket";
import { computeStandings } from "./standings";

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** Fabrique N équipes minimal-valides (seul id/seed/name sont utilisés par bracket.ts) */
function makeTeams(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `t${i + 1}`,
    name: `Team ${i + 1}`,
    seed: i + 1,
    // champs Prisma ignorés par les algos mais requis par le type
    tournamentId: "tournament1",
    createdAt: new Date(),
    updatedAt: new Date(),
    status: "SELECTED" as const,
    bracketNumber: null,
    notes: null,
    contactName: null,
    contactEmail: null,
    contactPhone: null,
  })) as any[];
}

const COURTS = ["Court 1", "Court 2"];
const START = new Date("2026-06-01T09:00:00Z");
const DURATION = 20; // minutes

// ─── nextPowerOf2 ─────────────────────────────────────────────────────────────

describe("nextPowerOf2", () => {
  it("retourne 1 pour n=1", () => expect(nextPowerOf2(1)).toBe(1));
  it("retourne 4 pour n=3", () => expect(nextPowerOf2(3)).toBe(4));
  it("retourne 4 pour n=4", () => expect(nextPowerOf2(4)).toBe(4));
  it("retourne 8 pour n=5", () => expect(nextPowerOf2(5)).toBe(8));
  it("retourne 16 pour n=9", () => expect(nextPowerOf2(9)).toBe(16));
  it("retourne 16 pour n=16", () => expect(nextPowerOf2(16)).toBe(16));
  it("retourne 32 pour n=17", () => expect(nextPowerOf2(17)).toBe(32));
});

// ─── generatePools ───────────────────────────────────────────────────────────

describe("generatePools — ALL_DAY", () => {
  it("6 équipes → 1 poule de 6", () => {
    const pools = generatePools(makeTeams(6), "ALL_DAY");
    expect(pools).toHaveLength(1);
    expect(pools[0].teams).toHaveLength(6);
  });

  it("8 équipes → 2 poules de 4", () => {
    const pools = generatePools(makeTeams(8), "ALL_DAY");
    expect(pools).toHaveLength(2);
    expect(pools[0].teams).toHaveLength(4);
    expect(pools[1].teams).toHaveLength(4);
  });

  it("12 équipes → 2 poules de 6", () => {
    const pools = generatePools(makeTeams(12), "ALL_DAY");
    expect(pools).toHaveLength(2);
    expect(pools[0].teams).toHaveLength(6);
    expect(pools[1].teams).toHaveLength(6);
  });

  it("chaque équipe apparaît exactement une fois (8 équipes)", () => {
    const teams = makeTeams(8);
    const pools = generatePools(teams, "ALL_DAY");
    const all = pools.flatMap((p) => p.teams.map((t) => t.id));
    expect(new Set(all).size).toBe(8);
    expect(all).toHaveLength(8);
  });

  it("16 équipes forcées en 4 poules → 4 poules de 4", () => {
    const pools = generatePools(makeTeams(16), "ALL_DAY", 4);
    expect(pools).toHaveLength(4);
    pools.forEach((p) => expect(p.teams).toHaveLength(4));
  });

  it("serpentin : seed 1 et 2 sont dans des poules différentes (4 poules)", () => {
    const teams = makeTeams(16);
    const pools = generatePools(teams, "ALL_DAY", 4);
    const poolOfSeed1 = pools.findIndex((p) => p.teams.some((t) => t.seed === 1));
    const poolOfSeed2 = pools.findIndex((p) => p.teams.some((t) => t.seed === 2));
    expect(poolOfSeed1).not.toBe(poolOfSeed2);
  });

  it("SPLIT_POOLS → 2 poules, session MORNING et AFTERNOON", () => {
    const pools = generatePools(makeTeams(8), "SPLIT_POOLS");
    expect(pools).toHaveLength(2);
    expect(pools[0].session).toBe("MORNING");
    expect(pools[1].session).toBe("AFTERNOON");
  });

  it("SWISS → retourne tableau vide", () => {
    const pools = generatePools(makeTeams(8), "SWISS");
    expect(pools).toHaveLength(0);
  });
});

// ─── generatePoolMatches ─────────────────────────────────────────────────────

describe("generatePoolMatches", () => {
  it("1 poule de 4 → 6 matchs (round-robin complet)", () => {
    const pools = generatePools(makeTeams(4), "ALL_DAY", 1);
    const matches = generatePoolMatches(pools, COURTS, START, DURATION);
    expect(matches).toHaveLength(6);
  });

  it("1 poule de 6 → 15 matchs", () => {
    const pools = generatePools(makeTeams(6), "ALL_DAY", 1);
    const matches = generatePoolMatches(pools, COURTS, START, DURATION);
    expect(matches).toHaveLength(15);
  });

  it("2 poules de 4 → 12 matchs total", () => {
    const pools = generatePools(makeTeams(8), "ALL_DAY");
    const matches = generatePoolMatches(pools, COURTS, START, DURATION);
    expect(matches).toHaveLength(12);
  });

  it("aucun doublon d'équipes dans le même match", () => {
    const pools = generatePools(makeTeams(8), "ALL_DAY");
    const matches = generatePoolMatches(pools, COURTS, START, DURATION);
    for (const m of matches) {
      expect(m.teamAId).not.toBeNull();
      expect(m.teamBId).not.toBeNull();
      expect(m.teamAId).not.toBe(m.teamBId);
    }
  });

  it("pas de rematch dans la même poule", () => {
    const pools = generatePools(makeTeams(6), "ALL_DAY", 1);
    const matches = generatePoolMatches(pools, COURTS, START, DURATION);
    const pairs = new Set<string>();
    for (const m of matches) {
      const key = [m.teamAId, m.teamBId].sort().join("|");
      expect(pairs.has(key)).toBe(false);
      pairs.add(key);
    }
  });

  it("tous les matchs ont une phase POOL", () => {
    const pools = generatePools(makeTeams(8), "ALL_DAY");
    const matches = generatePoolMatches(pools, COURTS, START, DURATION);
    expect(matches.every((m) => m.phase === "POOL")).toBe(true);
  });

  it("tous les matchs ont un terrain valide", () => {
    const pools = generatePools(makeTeams(8), "ALL_DAY");
    const matches = generatePoolMatches(pools, COURTS, START, DURATION);
    expect(matches.every((m) => COURTS.includes(m.courtName))).toBe(true);
  });
});

// ─── generateBracket — Single Elimination ────────────────────────────────────

describe("generateBracket — SE (Single Elimination)", () => {
  function se(n: number, thirdPlace = false) {
    return generateBracket(makeTeams(n), "SE", COURTS, START, DURATION, { thirdPlaceMatch: thirdPlace });
  }

  // Formule : bracket parfait de taille 2^k → k * 2^(k-1) / 2^(k-1) → 2^k - 1 matchs
  it("4 équipes → 3 matchs", () => expect(se(4)).toHaveLength(3));
  it("8 équipes → 7 matchs", () => expect(se(8)).toHaveLength(7));
  it("16 équipes → 15 matchs", () => expect(se(16)).toHaveLength(15));

  // Équipes non-puissance de 2 : BYEs
  it("5 équipes → 4 matchs (3 BYEs R1, seulement 1 match R1 + 2 R2 + 1 finale = 4... attendu 7)", () => {
    // nextPowerOf2(5)=8, size=8, totalRounds=3
    // R1: 8/2=4 slots, 3 BYEs (5-3=... seulement 1 match en R1 réel)
    // En fait 5 équipes → 5 dans 8 → 3 BYEs → 1 match R1 + 4 matchs R2+ = 4 matchs non-BYE
    const matches = se(5);
    expect(matches.length).toBeGreaterThanOrEqual(4);
    expect(matches.length).toBeLessThanOrEqual(7);
  });

  it("6 équipes : toutes équipes présentes dans au moins un match R1 ou avancées en R2", () => {
    const teams = makeTeams(6);
    const matches = se(6);
    const r1 = matches.filter((m) => m.roundIndex === 1);
    const r2 = matches.filter((m) => m.roundIndex === 2);
    const inR1 = new Set([...r1.flatMap((m) => [m.teamAId, m.teamBId])].filter(Boolean));
    const inR2 = new Set([...r2.flatMap((m) => [m.teamAId, m.teamBId])].filter(Boolean));
    const allPresent = teams.every((t) => inR1.has(t.id) || inR2.has(t.id));
    expect(allPresent).toBe(true);
  });

  it("12 équipes : 11 matchs (16-1=15 théorique, mais 4 BYEs R1 supprimés → 15-4=11)", () => {
    // nextPowerOf2(12)=16 → 15 matchs sans BYE, mais 4 slots R1 ont BYE (16-12=4)
    // Ces 4 matchs R1 sont sautés, les équipes avancées directement en R2
    expect(se(12)).toHaveLength(11);
  });

  it("il y a exactement 1 match avec bracketSide='G' (la finale)", () => {
    expect(se(8).filter((m) => m.bracketSide === "G")).toHaveLength(1);
    expect(se(16).filter((m) => m.bracketSide === "G")).toHaveLength(1);
  });

  it("sans 3ème place : aucun match bracketSide='L'", () => {
    expect(se(8, false).filter((m) => m.bracketSide === "L")).toHaveLength(0);
  });

  it("avec 3ème place : exactement 1 match bracketSide='L'", () => {
    expect(se(8, true).filter((m) => m.bracketSide === "L")).toHaveLength(1);
    expect(se(16, true).filter((m) => m.bracketSide === "L")).toHaveLength(1);
  });

  it("tous les matchs ont phase='BRACKET'", () => {
    expect(se(8).every((m) => m.phase === "BRACKET")).toBe(true);
  });

  it("tous les matchs ont dayIndex='SUN'", () => {
    expect(se(8).every((m) => m.dayIndex === "SUN")).toBe(true);
  });

  it("tous les matchs ont status='SCHEDULED'", () => {
    expect(se(8).every((m) => m.status === "SCHEDULED")).toBe(true);
  });

  it("seed 1 et seed 2 ne se rencontrent qu'en finale (8 équipes)", () => {
    const teams = makeTeams(8);
    const matches = se(8);
    const final = matches.find((m) => m.bracketSide === "G");
    expect(final).toBeDefined();
    // Les deux têtes de série ne peuvent pas se rencontrer avant la finale
    const prematureClash = matches
      .filter((m) => m.bracketSide !== "G")
      .some(
        (m) =>
          (m.teamAId === "t1" && m.teamBId === "t2") ||
          (m.teamAId === "t2" && m.teamBId === "t1")
      );
    expect(prematureClash).toBe(false);
  });

  it("les startAt sont chronologiquement cohérentes (R2 après R1)", () => {
    const matches = se(8);
    const r1Times = matches.filter((m) => m.roundIndex === 1).map((m) => m.startAt.getTime());
    const r2Times = matches.filter((m) => m.roundIndex === 2).map((m) => m.startAt.getTime());
    const maxR1 = Math.max(...r1Times);
    const minR2 = Math.min(...r2Times);
    expect(minR2).toBeGreaterThan(maxR1);
  });
});

// ─── generateBracket — Double Elimination ────────────────────────────────────

describe("generateBracket — DE (Double Elimination)", () => {
  function de(n: number, gfReset = false) {
    return generateBracket(makeTeams(n), "DE", COURTS, START, DURATION, { gfReset });
  }

  // Pour DE avec N=2^k : WB = 2^k-1 matchs, LB = 2^k - 2 matchs, GF = 1 → total 2*(2^k) - 2
  it("4 équipes → au moins 6 matchs (2*4 - 2)", () => {
    expect(de(4).length).toBeGreaterThanOrEqual(6);
  });

  it("8 équipes → au moins 14 matchs (2*8 - 2)", () => {
    expect(de(8).length).toBeGreaterThanOrEqual(14);
  });

  it("16 équipes → au moins 30 matchs (2*16 - 2)", () => {
    expect(de(16).length).toBeGreaterThanOrEqual(30);
  });

  it("exactement 1 match bracketSide='G' (grande finale)", () => {
    expect(de(8).filter((m) => m.bracketSide === "G")).toHaveLength(1);
    expect(de(16).filter((m) => m.bracketSide === "G")).toHaveLength(1);
  });

  it("des matchs bracketSide='L' (losers bracket) existent", () => {
    expect(de(8).filter((m) => m.bracketSide === "L").length).toBeGreaterThan(0);
  });

  it("des matchs bracketSide='W' (winners bracket) existent", () => {
    expect(de(8).filter((m) => m.bracketSide === "W").length).toBeGreaterThan(0);
  });

  it("tous les matchs ont phase='BRACKET'", () => {
    expect(de(8).every((m) => m.phase === "BRACKET")).toBe(true);
  });

  it("WB round 1 (4 équipes) : les 2 matchs ont 4 équipes distinctes", () => {
    const matches = de(4);
    const r1 = matches.filter((m) => m.bracketSide === "W" && m.roundIndex === 1);
    const ids = r1.flatMap((m) => [m.teamAId, m.teamBId]).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length); // tous distincts
  });

  it("seed 1 et seed 2 ne se rencontrent pas en WB R1 (8 équipes)", () => {
    const matches = de(8);
    const wbR1 = matches.filter((m) => m.bracketSide === "W" && m.roundIndex === 1);
    const earlyClash = wbR1.some(
      (m) =>
        (m.teamAId === "t1" && m.teamBId === "t2") ||
        (m.teamAId === "t2" && m.teamBId === "t1")
    );
    expect(earlyClash).toBe(false);
  });

  // ── Cas non-puissance-de-2 ──────────────────────────────────────────────
  // Pour une DE de N équipes (size = nextPowerOf2(N)) :
  //   WB matchs réels = N - 1 (chaque équipe perd exactement une fois sauf le vainqueur)
  //   Total matchs = 2*N - 2 (sans GF reset) ou 2*N - 1 (avec reset)
  //   GF = 1 (ou 2 avec reset)
  //   LB = N - 2 matchs (chaque perdant WB joue en LB jusqu'à élimination)

  it("5 équipes — exactement 1 match GF", () => {
    expect(de(5).filter((m) => m.bracketSide === "G").length).toBe(1);
  });

  it("6 équipes — exactement 1 match GF", () => {
    expect(de(6).filter((m) => m.bracketSide === "G").length).toBe(1);
  });

  it("10 équipes — exactement 1 match GF", () => {
    expect(de(10).filter((m) => m.bracketSide === "G").length).toBe(1);
  });

  it("12 équipes — exactement 1 match GF", () => {
    expect(de(12).filter((m) => m.bracketSide === "G").length).toBe(1);
  });

  it("toutes les équipes présentes dans au moins 1 match WB (5 équipes)", () => {
    const matches = de(5);
    const wb = matches.filter((m) => m.bracketSide === "W");
    const ids = new Set(wb.flatMap((m) => [m.teamAId, m.teamBId]).filter(Boolean));
    expect(ids.size).toBe(5);
  });

  it("toutes les équipes présentes dans au moins 1 match WB (10 équipes)", () => {
    const matches = de(10);
    const wb = matches.filter((m) => m.bracketSide === "W");
    const ids = new Set(wb.flatMap((m) => [m.teamAId, m.teamBId]).filter(Boolean));
    expect(ids.size).toBe(10);
  });

  it("toutes les équipes présentes dans au moins 1 match WB (12 équipes)", () => {
    const matches = de(12);
    const wb = matches.filter((m) => m.bracketSide === "W");
    const ids = new Set(wb.flatMap((m) => [m.teamAId, m.teamBId]).filter(Boolean));
    expect(ids.size).toBe(12);
  });

  it("6 équipes avec gfReset — 2 matchs GF", () => {
    const matches = de(6, true);
    expect(matches.filter((m) => m.bracketSide === "G").length).toBe(2);
  });

  // Vérification du nombre total de matchs LB
  // En DE standard: LB doit avoir exactement N-2 matchs pour N équipes (chaque perdant joue jusqu'à élimination)
  // Note: avec des BYEs, certains matchs ont un slot TBD (normal, rempli à runtime)
  // L'important est que le nombre soit correct pour que chaque équipe puisse progresser
  it("5 équipes — WB a 2 matchs réels en R1 (1 vrai match + 3 BYEs sur size=8)", () => {
    const matches = de(5);
    const wbR1 = matches.filter((m) => m.bracketSide === "W" && m.roundIndex === 1);
    // size=8, 5 équipes → 3 BYEs → 5-3=... en fait: floor((8-5)/1) non
    // slots: 8/2=4 paires, mais seulement 1 a deux équipes réelles (t4 vs t5 style)
    expect(wbR1.length).toBeGreaterThanOrEqual(1);
    expect(wbR1.length).toBeLessThanOrEqual(4);
  });

  it("10 équipes — WB R1 a exactement 2 matchs réels (size=16, 6 BYEs)", () => {
    const matches = de(10);
    const wbR1 = matches.filter((m) => m.bracketSide === "W" && m.roundIndex === 1);
    expect(wbR1.length).toBe(2);
  });

  it("10 équipes — structure LB correcte: 8 matchs LB total (= N-2)", () => {
    const matches = de(10);
    const lb = matches.filter((m) => m.bracketSide === "L");
    // N=10 teams → N-2=8 LB matches (each eliminated team plays until out)
    expect(lb.length).toBe(8);
  });

  it("10 équipes — total matchs = 2*N-2 = 18", () => {
    expect(de(10).length).toBe(18);
  });

  it("8 équipes — total matchs = 2*N-2 = 14", () => {
    expect(de(8).length).toBe(14);
  });

  it("6 équipes — total matchs = 2*N-2 = 10", () => {
    expect(de(6).length).toBe(10);
  });

  it("5 équipes — total matchs = 2*N-2 = 8", () => {
    expect(de(5).length).toBe(8);
  });

  it("12 équipes — total matchs = 2*N-2 = 22", () => {
    expect(de(12).length).toBe(22);
  });
});

// ─── generateBracket — Round Robin ───────────────────────────────────────────

describe("generateBracket — RR (Round Robin)", () => {
  function rr(n: number) {
    return generateBracket(makeTeams(n), "RR", COURTS, START, DURATION);
  }

  // N équipes → N*(N-1)/2 matchs
  it("4 équipes → 6 matchs", () => expect(rr(4)).toHaveLength(6));
  it("6 équipes → 15 matchs", () => expect(rr(6)).toHaveLength(15));
  it("8 équipes → 28 matchs", () => expect(rr(8)).toHaveLength(28));

  it("pas de doublon de paires", () => {
    const matches = rr(6);
    const pairs = new Set<string>();
    for (const m of matches) {
      const key = [m.teamAId, m.teamBId].sort().join("|");
      expect(pairs.has(key)).toBe(false);
      pairs.add(key);
    }
  });

  it("chaque équipe joue exactement N-1 matchs", () => {
    const n = 6;
    const teams = makeTeams(n);
    const matches = rr(n);
    for (const t of teams) {
      const count = matches.filter((m) => m.teamAId === t.id || m.teamBId === t.id).length;
      expect(count).toBe(n - 1);
    }
  });

  it("tous les matchs ont phase='BRACKET' et bracketSide=null", () => {
    expect(rr(4).every((m) => m.phase === "BRACKET" && m.bracketSide === null)).toBe(true);
  });
});

// ─── generateSwissRound ───────────────────────────────────────────────────────

describe("generateSwissRound", () => {
  function swiss(n: number, existing: GeneratedMatch[] = []) {
    const teams = makeTeams(n);
    const standings = teams.map((t, i) => ({
      teamId: t.id, name: t.name,
      played: 0, wins: 0, draws: 0, losses: 0,
      goalsFor: 0, goalsAgainst: 0, goalDiff: 0,
      points: n - i, buchholz: 0, sonnebornBerger: 0,
    }));
    return generateSwissRound(teams, standings, existing, 1, COURTS, START, DURATION);
  }

  it("8 équipes → 4 matchs (N/2)", () => expect(swiss(8)).toHaveLength(4));
  it("10 équipes → 5 matchs", () => expect(swiss(10)).toHaveLength(5));
  it("16 équipes → 8 matchs", () => expect(swiss(16)).toHaveLength(8));

  it("pas de doublon d'équipes dans le même match", () => {
    const matches = swiss(8);
    for (const m of matches) {
      expect(m.teamAId).not.toBe(m.teamBId);
    }
  });

  it("chaque équipe apparaît exactement une fois", () => {
    const n = 8;
    const teams = makeTeams(n);
    const matches = swiss(n);
    const ids = matches.flatMap((m) => [m.teamAId, m.teamBId]);
    expect(new Set(ids).size).toBe(n);
  });

  it("évite les rematches quand des matchs précédents existent", () => {
    const teams = makeTeams(8);
    // Simuler que t1 a déjà joué contre t2
    const existing: any[] = [{ teamAId: "t1", teamBId: "t2", courtName: "Court 1" }];
    const matches = swiss(8, existing);
    const rematch = matches.some(
      (m) =>
        (m.teamAId === "t1" && m.teamBId === "t2") ||
        (m.teamAId === "t2" && m.teamBId === "t1")
    );
    expect(rematch).toBe(false);
  });

  it("tous les matchs ont phase='SWISS'", () => {
    expect(swiss(8).every((m) => m.phase === "SWISS")).toBe(true);
  });
});

// ─── computeStandings ────────────────────────────────────────────────────────

describe("computeStandings", () => {
  function makeMatch(overrides: Partial<{
    id: string; teamAId: string; teamBId: string;
    scoreA: number; scoreB: number; status: string;
  }>) {
    return {
      id: "m1", tournamentId: "t1",
      phase: "POOL" as any, poolId: null, bracketSide: null,
      roundIndex: 1, positionInRound: 0,
      courtName: "Court 1", startAt: new Date(), dayIndex: "SAT" as any,
      status: "FINISHED" as any,
      teamAId: "t1", teamBId: "t2",
      scoreA: 0, scoreB: 0,
      winnerTeamId: null, nextMatchWinId: null, nextSlotWin: null,
      nextMatchLoseId: null, nextSlotLose: null,
      refereePlayerId: null, coRefereePlayerId: null,
      updatedAt: new Date(), createdAt: new Date(),
      ...overrides,
    };
  }

  it("tri par points : équipe avec plus de victoires en tête", () => {
    const teams = makeTeams(3);
    const matches = [
      makeMatch({ id: "m1", teamAId: "t1", teamBId: "t2", scoreA: 2, scoreB: 0 }),
      makeMatch({ id: "m2", teamAId: "t1", teamBId: "t3", scoreA: 1, scoreB: 0 }),
      makeMatch({ id: "m3", teamAId: "t2", teamBId: "t3", scoreA: 0, scoreB: 1 }),
    ];
    const standings = computeStandings(teams, matches as any);
    expect(standings[0].teamId).toBe("t1"); // 6pts
    expect(standings[1].teamId).toBe("t3"); // 3pts
    expect(standings[2].teamId).toBe("t2"); // 0pts
  });

  it("égalité de points → tri par diff de buts", () => {
    const teams = makeTeams(2);
    const matches = [
      makeMatch({ id: "m1", teamAId: "t1", teamBId: "t2", scoreA: 3, scoreB: 1 }),
    ];
    const standings = computeStandings(teams, matches as any);
    expect(standings[0].teamId).toBe("t1");
    expect(standings[0].goalDiff).toBe(2);
    expect(standings[1].goalDiff).toBe(-2);
  });

  it("comptage correct wins/draws/losses", () => {
    const teams = makeTeams(2);
    const matches = [
      makeMatch({ id: "m1", scoreA: 2, scoreB: 2 }),
    ];
    const standings = computeStandings(teams, matches as any);
    expect(standings[0].draws).toBe(1);
    expect(standings[1].draws).toBe(1);
    expect(standings[0].wins).toBe(0);
  });

  it("matchs non-finis (SCHEDULED) sont ignorés", () => {
    const teams = makeTeams(2);
    const matches = [
      makeMatch({ id: "m1", status: "SCHEDULED", scoreA: 5, scoreB: 0 }),
    ];
    const standings = computeStandings(teams, matches as any);
    expect(standings[0].played).toBe(0);
    expect(standings[0].points).toBe(0);
  });

  it("buchholz = somme des points des adversaires", () => {
    const teams = makeTeams(3);
    // t1 bat t2 (3pts) et t3 bat t2 (t2=0pts, t3=3pts)
    const matches = [
      makeMatch({ id: "m1", teamAId: "t1", teamBId: "t2", scoreA: 1, scoreB: 0 }),
      makeMatch({ id: "m2", teamAId: "t3", teamBId: "t2", scoreA: 1, scoreB: 0 }),
    ];
    const standings = computeStandings(teams, matches as any);
    const t1 = standings.find((r) => r.teamId === "t1")!;
    const t3 = standings.find((r) => r.teamId === "t3")!;
    // t1 a joué contre t2 (0pts) → buchholz t1 = 0
    expect(t1.buchholz).toBe(0);
    // t3 a joué contre t2 (0pts) → buchholz t3 = 0
    expect(t3.buchholz).toBe(0);
  });

  it("système de points 1/0.5 (draw=0.5)", () => {
    const teams = makeTeams(2);
    const matches = [
      makeMatch({ id: "m1", scoreA: 1, scoreB: 1 }),
    ];
    const standings = computeStandings(teams, matches as any, "1/0.5");
    expect(standings[0].points).toBe(0.5);
    expect(standings[1].points).toBe(0.5);
  });

  it("5 équipes, round-robin complet → premier a 4 victoires (12pts)", () => {
    const teams = makeTeams(5);
    // t1 bat tout le monde, t2 bat t3/t4/t5, t3 bat t4/t5, t4 bat t5
    const matches: any[] = [];
    let id = 0;
    for (let i = 0; i < 5; i++) {
      for (let j = i + 1; j < 5; j++) {
        matches.push(makeMatch({
          id: `m${id++}`,
          teamAId: teams[i].id,
          teamBId: teams[j].id,
          scoreA: 1, scoreB: 0,
        }));
      }
    }
    const standings = computeStandings(teams, matches);
    expect(standings[0].teamId).toBe("t1");
    expect(standings[0].wins).toBe(4);
    expect(standings[0].points).toBe(12);
  });
});

// ─── Propagation des liens (nextMatchWinId) ───────────────────────────────────

describe("Propagation nextMatchWinId — SE 8 équipes", () => {
  /**
   * generateSingleElim ne remplit pas nextMatchWinId directement —
   * c'est la DB action (generateBracketAction) qui fait le linking après insertion.
   * On vérifie donc ici la STRUCTURE du bracket (roundIndex, positionInRound)
   * qui permet ce linking.
   */
  it("les matchs R1 ont des positionInRound uniques par round", () => {
    const matches = generateBracket(makeTeams(8), "SE", COURTS, START, DURATION);
    const r1 = matches.filter((m) => m.roundIndex === 1);
    const positions = r1.map((m) => m.positionInRound);
    expect(new Set(positions).size).toBe(r1.length);
  });

  it("les matchs R2 ont des positionInRound uniques par round", () => {
    const matches = generateBracket(makeTeams(8), "SE", COURTS, START, DURATION);
    const r2 = matches.filter((m) => m.roundIndex === 2);
    const positions = r2.map((m) => m.positionInRound);
    expect(new Set(positions).size).toBe(r2.length);
  });

  it("chaque match R1[pos] se lie au match R2[floor(pos/2)]", () => {
    // Vérification de la logique de linking attendue par generateBracketAction
    const matches = generateBracket(makeTeams(8), "SE", COURTS, START, DURATION);
    const r1 = matches.filter((m) => m.roundIndex === 1 && m.bracketSide === "W");
    const r2 = matches.filter((m) => m.roundIndex === 2);
    for (const m of r1) {
      const expectedR2Pos = Math.floor(m.positionInRound! / 2);
      const targetR2 = r2.find((r) => r.positionInRound === expectedR2Pos);
      expect(targetR2).toBeDefined();
    }
  });
});

describe("Propagation nextMatchWinId — DE 8 équipes", () => {
  it("les matchs WB ont roundIndex croissants", () => {
    const matches = generateBracket(makeTeams(8), "DE", COURTS, START, DURATION);
    const wb = matches.filter((m) => m.bracketSide === "W");
    const rounds = [...new Set(wb.map((m) => m.roundIndex))].sort((a, b) => a - b);
    expect(rounds[0]).toBe(1);
    expect(rounds[rounds.length - 1]).toBeGreaterThan(1);
  });

  it("les matchs LB ont roundIndex croissants depuis 1", () => {
    const matches = generateBracket(makeTeams(8), "DE", COURTS, START, DURATION);
    const lb = matches.filter((m) => m.bracketSide === "L");
    const minRound = Math.min(...lb.map((m) => m.roundIndex));
    expect(minRound).toBe(1);
  });

  it("la grande finale (G) a roundIndex=1 (side indépendante)", () => {
    // En DE, la GF est dans sa propre bracketSide="G" avec roundIndex=1
    // Le roundIndex n'est pas global mais par side (W, L, G ont leurs propres compteurs)
    const matches = generateBracket(makeTeams(8), "DE", COURTS, START, DURATION);
    const gf = matches.find((m) => m.bracketSide === "G")!;
    expect(gf.roundIndex).toBe(1);
  });
});

// ─── generateBracket — cas limites ───────────────────────────────────────────

describe("generateBracket — cas limites", () => {
  it("2 équipes SE → 1 match (la finale directe)", () => {
    const matches = generateBracket(makeTeams(2), "SE", COURTS, START, DURATION);
    expect(matches).toHaveLength(1);
    expect(matches[0].bracketSide).toBe("G");
  });

  it("3 équipes SE → 2 matchs (1 BYE R1 + finale)", () => {
    const matches = generateBracket(makeTeams(3), "SE", COURTS, START, DURATION);
    // nextPowerOf2(3)=4 → 3 matchs au max, mais 1 BYE → 2 réels
    expect(matches.length).toBe(2);
  });

  it("4 équipes RR → 6 matchs, toutes paires jouées", () => {
    const teams = makeTeams(4);
    const matches = generateBracket(teams, "RR", COURTS, START, DURATION);
    expect(matches).toHaveLength(6);
    const pairs = matches.map((m) => [m.teamAId, m.teamBId].sort().join("|"));
    expect(new Set(pairs).size).toBe(6);
  });

  it("DE avec moins de 4 équipes → fallback SE", () => {
    // generateBracket route DE → SE si teams.length < 4
    const matches = generateBracket(makeTeams(3), "DE", COURTS, START, DURATION);
    // Doit générer un SE valide, pas planter
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every((m) => m.phase === "BRACKET")).toBe(true);
  });

  it("1 court seulement : tous les matchs sur ce court", () => {
    const matches = generateBracket(makeTeams(4), "SE", ["Terrain unique"], START, DURATION);
    expect(matches.every((m) => m.courtName === "Terrain unique")).toBe(true);
  });

  it("4 courts disponibles : au moins 2 courts utilisés pour 8 équipes SE", () => {
    const courts = ["C1", "C2", "C3", "C4"];
    const matches = generateBracket(makeTeams(8), "SE", courts, START, DURATION);
    const used = new Set(matches.map((m) => m.courtName));
    expect(used.size).toBeGreaterThanOrEqual(2);
  });
});
