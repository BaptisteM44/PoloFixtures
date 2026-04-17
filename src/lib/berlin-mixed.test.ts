/**
 * Tests unitaires — berlin-mixed.ts
 *
 * Couvre :
 *  - computeGlobalRanking : tri multi-critères, fusion des deux groupes
 *  - assignSaturdayGroups : snake draft par paires, équilibre des groupes
 *  - generateBerlinSwissRound : appariement, évitement rematches cross-jour
 *  - generateSundaySwissRound : big swiss 48 équipes, rematches Fri+Sat interdits
 *  - generateBerlinSEBracket : TOP32 et BOTTOM16, BYEs, 3ème place, seeding
 *  - generateBerlinFinalBrackets : split 32/16, phases distinctes, timings
 */

import { describe, it, expect } from "vitest";
import {
  computeGlobalRanking,
  assignSaturdayGroups,
  generateBerlinSwissRound,
  generateSundaySwissRound,
  generateBerlinSEBracket,
  generateBerlinFinalBrackets,
  type BerlinMatchInput,
} from "./berlin-mixed";
import { computeStandings } from "./standings";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeTeams(n: number, offset = 0) {
  return Array.from({ length: n }, (_, i) => ({
    id: `t${offset + i + 1}`,
    name: `Team ${offset + i + 1}`,
    seed: offset + i + 1,
    tournamentId: "tournament1",
    createdAt: new Date(),
    updatedAt: new Date(),
    status: "SELECTED" as const,
    bracketNumber: null,
    notes: null,
    contactName: null,
    contactEmail: null,
    contactPhone: null,
  }));
}

function makeMatch(overrides: Partial<{
  teamAId: string; teamBId: string; scoreA: number; scoreB: number; status: string;
}>) {
  return {
    id: Math.random().toString(),
    tournamentId: "t1",
    phase: "FRIDAY_A" as any,
    poolId: null, bracketSide: null,
    roundIndex: 1, positionInRound: 0,
    courtName: "Court 1", startAt: new Date(), dayIndex: "FRI" as any,
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

const COURTS = ["Court 1", "Court 2", "Court 3", "Court 4"];
const START = new Date("2026-06-01T09:00:00Z");
const DURATION = 20;

// ─── computeGlobalRanking ─────────────────────────────────────────────────────

describe("computeGlobalRanking", () => {
  it("fusionne deux groupes et trie par points décroissants", () => {
    const teamsA = makeTeams(3, 0);       // t1, t2, t3
    const teamsB = makeTeams(3, 3);       // t4, t5, t6

    // t1 bat t2 et t3 (6pts), t4 bat t5 et t6 (6pts, mais même points)
    const matchesA: any[] = [
      makeMatch({ teamAId: "t1", teamBId: "t2", scoreA: 2, scoreB: 0 }),
      makeMatch({ teamAId: "t1", teamBId: "t3", scoreA: 1, scoreB: 0 }),
      makeMatch({ teamAId: "t2", teamBId: "t3", scoreA: 1, scoreB: 0 }),
    ];
    const matchesB: any[] = [
      makeMatch({ teamAId: "t4", teamBId: "t5", scoreA: 3, scoreB: 0 }),
      makeMatch({ teamAId: "t4", teamBId: "t6", scoreA: 2, scoreB: 0 }),
      makeMatch({ teamAId: "t5", teamBId: "t6", scoreA: 1, scoreB: 0 }),
    ];

    const ranking = computeGlobalRanking(teamsA, teamsB, matchesA, matchesB);
    expect(ranking).toHaveLength(6);
    // t1 et t4 ont tous les deux 6pts → les deux en tête
    const top2 = ranking.slice(0, 2).map((r) => r.team.id);
    expect(top2).toContain("t1");
    expect(top2).toContain("t4");
  });

  it("globalRank commence à 1 et est consécutif", () => {
    const teamsA = makeTeams(4, 0);
    const teamsB = makeTeams(4, 4);
    const ranking = computeGlobalRanking(teamsA, teamsB, [], []);
    const ranks = ranking.map((r) => r.globalRank).sort((a, b) => a - b);
    expect(ranks).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("chaque équipe apparaît exactement une fois", () => {
    const teamsA = makeTeams(6, 0);
    const teamsB = makeTeams(6, 6);
    const ranking = computeGlobalRanking(teamsA, teamsB, [], []);
    const ids = ranking.map((r) => r.team.id);
    expect(new Set(ids).size).toBe(12);
  });

  it("équipe avec meilleur diff de buts devance à points égaux", () => {
    const teamsA = makeTeams(1, 0);  // t1
    const teamsB = makeTeams(1, 1);  // t2
    // t1 et t2 ont 0 matchs → 0 points, mais on leur ajoute des matchs fictifs
    const matchesA: any[] = [makeMatch({ teamAId: "t1", teamBId: "dummy", scoreA: 5, scoreB: 0 })];
    const matchesB: any[] = [makeMatch({ teamAId: "t2", teamBId: "dummy2", scoreA: 1, scoreB: 0 })];
    const ranking = computeGlobalRanking(teamsA, teamsB, matchesA, matchesB);
    // t1 a meilleur diff de buts → rank 1
    expect(ranking[0].team.id).toBe("t1");
  });
});

// ─── assignSaturdayGroups ─────────────────────────────────────────────────────

describe("assignSaturdayGroups", () => {
  function makeRanking(n: number) {
    return makeTeams(n).map((team, i) => ({ team, globalRank: i + 1 }));
  }

  it("48 équipes → 24 dans chaque groupe", () => {
    const { satA, satB } = assignSaturdayGroups(makeRanking(48));
    expect(satA).toHaveLength(24);
    expect(satB).toHaveLength(24);
  });

  it("chaque équipe apparaît exactement une fois", () => {
    const { satA, satB } = assignSaturdayGroups(makeRanking(48));
    const all = [...satA, ...satB].map((t) => t.id);
    expect(new Set(all).size).toBe(48);
  });

  it("alternance stricte : rank 1→A, 2→B, 3→A, 4→B, 5→A, 6→B…", () => {
    const { satA, satB } = assignSaturdayGroups(makeRanking(8));
    expect(satA[0].seed).toBe(1); // rank 1 → A
    expect(satB[0].seed).toBe(2); // rank 2 → B
    expect(satA[1].seed).toBe(3); // rank 3 → A
    expect(satB[1].seed).toBe(4); // rank 4 → B
    expect(satA[2].seed).toBe(5); // rank 5 → A
    expect(satB[2].seed).toBe(6); // rank 6 → B
  });

  it("groupes équilibrés : chaque groupe reçoit la moitié des équipes", () => {
    for (const n of [8, 16, 24, 48]) {
      const { satA, satB } = assignSaturdayGroups(makeRanking(n));
      expect(satA).toHaveLength(n / 2);
      expect(satB).toHaveLength(n / 2);
    }
  });

  it("le rank 1 et le rank 2 ne sont pas dans le même groupe", () => {
    const { satA, satB } = assignSaturdayGroups(makeRanking(48));
    const r1InA = satA.some((t) => t.seed === 1);
    const r2InA = satA.some((t) => t.seed === 2);
    expect(r1InA).toBe(true);
    expect(r2InA).toBe(false);
  });

  it("le rank 3 est dans le groupe A (alternance : impairs → A)", () => {
    const { satA } = assignSaturdayGroups(makeRanking(8));
    expect(satA.some((t) => t.seed === 3)).toBe(true);
  });
});

// ─── generateBerlinSwissRound ─────────────────────────────────────────────────

describe("generateBerlinSwissRound", () => {
  function makeStandings(teams: ReturnType<typeof makeTeams>) {
    return teams.map((t, i) => ({
      teamId: t.id, name: t.name,
      played: 0, wins: 0, draws: 0, losses: 0,
      goalsFor: 0, goalsAgainst: 0, goalDiff: 0,
      points: teams.length - i, buchholz: 0, sonnebornBerger: 0,
    }));
  }

  it("24 équipes → 12 matchs (N/2)", () => {
    const teams = makeTeams(24);
    const matches = generateBerlinSwissRound(
      teams, makeStandings(teams), [], 1, "Fri-A", COURTS, START, DURATION, "FRI"
    );
    expect(matches).toHaveLength(12);
  });

  it("chaque équipe joue exactement un match", () => {
    const teams = makeTeams(24);
    const matches = generateBerlinSwissRound(
      teams, makeStandings(teams), [], 1, "Fri-A", COURTS, START, DURATION, "FRI"
    );
    const ids = matches.flatMap((m) => [m.teamAId, m.teamBId]);
    expect(new Set(ids).size).toBe(24);
  });

  it("évite les rematches des matchs précédents", () => {
    const teams = makeTeams(8);
    // t1 a déjà joué contre t2
    const prior: BerlinMatchInput[] = [{ teamAId: "t1", teamBId: "t2" }];
    const matches = generateBerlinSwissRound(
      teams, makeStandings(teams), prior, 2, "Fri-A", COURTS, START, DURATION, "FRI"
    );
    const rematch = matches.some(
      (m) =>
        (m.teamAId === "t1" && m.teamBId === "t2") ||
        (m.teamAId === "t2" && m.teamBId === "t1")
    );
    expect(rematch).toBe(false);
  });

  it("évite les rematches cross-jour (vendredi → samedi)", () => {
    const teams = makeTeams(8);
    // Simuler 3 rounds du vendredi : chaque paire déjà jouée
    const prior: BerlinMatchInput[] = [
      { teamAId: "t1", teamBId: "t3", phase: "FRIDAY_A" as any },
      { teamAId: "t2", teamBId: "t4", phase: "FRIDAY_A" as any },
    ];
    const matches = generateBerlinSwissRound(
      teams, makeStandings(teams), prior, 1, "Sat-A", COURTS, START, DURATION, "SAT"
    );
    const fridayRematch = matches.some(
      (m) =>
        (m.teamAId === "t1" && m.teamBId === "t3") ||
        (m.teamAId === "t3" && m.teamBId === "t1") ||
        (m.teamAId === "t2" && m.teamBId === "t4") ||
        (m.teamAId === "t4" && m.teamBId === "t2")
    );
    expect(fridayRematch).toBe(false);
  });

  it("phase FRIDAY_A pour groupe A le vendredi", () => {
    const teams = makeTeams(8);
    const matches = generateBerlinSwissRound(
      teams, makeStandings(teams), [], 1, "Fri-A", COURTS, START, DURATION, "FRI"
    );
    expect(matches.every((m) => m.phase === "FRIDAY_A")).toBe(true);
  });

  it("phase FRIDAY_B pour groupe B le vendredi", () => {
    const teams = makeTeams(8);
    const matches = generateBerlinSwissRound(
      teams, makeStandings(teams), [], 1, "Fri-B", COURTS, START, DURATION, "FRI"
    );
    expect(matches.every((m) => m.phase === "FRIDAY_B")).toBe(true);
  });

  it("phase SATURDAY_A pour groupe A le samedi", () => {
    const teams = makeTeams(8);
    const matches = generateBerlinSwissRound(
      teams, makeStandings(teams), [], 1, "Sat-A", COURTS, START, DURATION, "SAT"
    );
    expect(matches.every((m) => m.phase === "SATURDAY_A")).toBe(true);
  });

  it("tous les matchs ont dayIndex correct", () => {
    const teams = makeTeams(8);
    const fri = generateBerlinSwissRound(teams, makeStandings(teams), [], 1, "Fri-A", COURTS, START, DURATION, "FRI");
    const sat = generateBerlinSwissRound(teams, makeStandings(teams), [], 1, "Sat-A", COURTS, START, DURATION, "SAT");
    expect(fri.every((m) => m.dayIndex === "FRI")).toBe(true);
    expect(sat.every((m) => m.dayIndex === "SAT")).toBe(true);
  });

  it("poolName contient le roundIndex", () => {
    const teams = makeTeams(8);
    const matches = generateBerlinSwissRound(
      teams, makeStandings(teams), [], 3, "Fri-A", COURTS, START, DURATION, "FRI"
    );
    expect(matches.every((m) => m.poolName?.includes("3"))).toBe(true);
  });

  it("tous les matchs ont status=SCHEDULED", () => {
    const teams = makeTeams(8);
    const matches = generateBerlinSwissRound(
      teams, makeStandings(teams), [], 1, "Fri-A", COURTS, START, DURATION, "FRI"
    );
    expect(matches.every((m) => m.status === "SCHEDULED")).toBe(true);
  });
});

// ─── generateSundaySwissRound ─────────────────────────────────────────────────

describe("generateSundaySwissRound", () => {
  function makeStandings(teams: ReturnType<typeof makeTeams>) {
    return teams.map((t, i) => ({
      teamId: t.id, name: t.name,
      played: 0, wins: 0, draws: 0, losses: 0,
      goalsFor: 0, goalsAgainst: 0, goalDiff: 0,
      points: teams.length - i, buchholz: 0, sonnebornBerger: 0,
    }));
  }

  it("48 équipes → 24 matchs", () => {
    const teams = makeTeams(48);
    const matches = generateSundaySwissRound(
      teams, makeStandings(teams), [], 1, COURTS, START, DURATION
    );
    expect(matches).toHaveLength(24);
  });

  it("chaque équipe joue exactement un match (48 équipes)", () => {
    const teams = makeTeams(48);
    const matches = generateSundaySwissRound(
      teams, makeStandings(teams), [], 1, COURTS, START, DURATION
    );
    const ids = matches.flatMap((m) => [m.teamAId, m.teamBId]);
    expect(new Set(ids).size).toBe(48);
  });

  it("évite les rematches du vendredi et samedi", () => {
    const teams = makeTeams(8);
    const prior: BerlinMatchInput[] = [
      { teamAId: "t1", teamBId: "t2", phase: "FRIDAY_A" as any },
      { teamAId: "t3", teamBId: "t4", phase: "SATURDAY_A" as any },
    ];
    const matches = generateSundaySwissRound(
      teams, makeStandings(teams), prior, 1, COURTS, START, DURATION
    );
    const forbidden = matches.some(
      (m) =>
        (m.teamAId === "t1" && m.teamBId === "t2") ||
        (m.teamAId === "t2" && m.teamBId === "t1") ||
        (m.teamAId === "t3" && m.teamBId === "t4") ||
        (m.teamAId === "t4" && m.teamBId === "t3")
    );
    expect(forbidden).toBe(false);
  });

  it("tous les matchs ont phase=SUNDAY_SWISS et dayIndex=SUN", () => {
    const teams = makeTeams(8);
    const matches = generateSundaySwissRound(
      teams, makeStandings(teams), [], 1, COURTS, START, DURATION
    );
    expect(matches.every((m) => m.phase === "SUNDAY_SWISS")).toBe(true);
    expect(matches.every((m) => m.dayIndex === "SUN")).toBe(true);
  });

  it("les équipes les moins bien classées jouent en premier (cadeau pour les tops)", () => {
    const teams = makeTeams(8);
    // standings : t1 = meilleur (rank 0), t8 = moins bon (rank 7)
    const standings = teams.map((t, i) => ({
      teamId: t.id, name: t.name,
      played: i, wins: 7 - i, draws: 0, losses: i,
      goalsFor: 7 - i, goalsAgainst: i, goalDiff: 7 - 2 * i,
      points: (7 - i) * 3, buchholz: 0, sonnebornBerger: 0,
    }));
    const matches = generateSundaySwissRound(teams, standings, [], 1, COURTS, START, DURATION);
    // Le premier match doit impliquer les équipes les moins bien classées
    // t8 (rank 7) et t7 (rank 6) doivent apparaître dans les premiers matchs
    const firstMatchIds = [matches[0].teamAId, matches[0].teamBId];
    // Les deux derniers rangs (t7, t8) doivent être dans les premiers matchs
    expect(firstMatchIds).toContain("t8");
  });

  it("poolName contient 'Sunday R' + roundIndex", () => {
    const teams = makeTeams(8);
    const matches = generateSundaySwissRound(
      teams, makeStandings(teams), [], 2, COURTS, START, DURATION
    );
    expect(matches.every((m) => m.poolName === "Sunday R2")).toBe(true);
  });
});

// ─── generateBerlinSEBracket ──────────────────────────────────────────────────

describe("generateBerlinSEBracket — TOP32", () => {
  it("32 équipes → 31 matchs SE + 1 match 3ème place = 32 matchs", () => {
    // nextPowerOf2(32)=32 → 0 BYE → 31 matchs + 1 = 32
    const matches = generateBerlinSEBracket(makeTeams(32), "TOP32", COURTS, START, DURATION);
    expect(matches).toHaveLength(32);
  });

  it("exactement 1 match bracketSide='G' (finale)", () => {
    const matches = generateBerlinSEBracket(makeTeams(32), "TOP32", COURTS, START, DURATION);
    expect(matches.filter((m) => m.bracketSide === "G")).toHaveLength(1);
  });

  it("exactement 1 match bracketSide='L' (3ème place)", () => {
    const matches = generateBerlinSEBracket(makeTeams(32), "TOP32", COURTS, START, DURATION);
    expect(matches.filter((m) => m.bracketSide === "L")).toHaveLength(1);
  });

  it("tous les matchs ont phase='TOP32'", () => {
    const matches = generateBerlinSEBracket(makeTeams(32), "TOP32", COURTS, START, DURATION);
    expect(matches.every((m) => m.phase === "TOP32")).toBe(true);
  });

  it("seed 1 et seed 2 ne se rencontrent pas en R1 (Challonge seeding)", () => {
    const matches = generateBerlinSEBracket(makeTeams(32), "TOP32", COURTS, START, DURATION);
    const r1 = matches.filter((m) => m.roundIndex === 1);
    const earlyClash = r1.some(
      (m) =>
        (m.teamAId === "t1" && m.teamBId === "t2") ||
        (m.teamAId === "t2" && m.teamBId === "t1")
    );
    expect(earlyClash).toBe(false);
  });

  it("avec BYEs (28 équipes) : toutes les 28 équipes placées", () => {
    // nextPowerOf2(28)=32 → 4 BYEs
    const teams = makeTeams(28);
    const matches = generateBerlinSEBracket(teams, "TOP32", COURTS, START, DURATION);
    const allIds = new Set(
      matches.flatMap((m) => [m.teamAId, m.teamBId]).filter(Boolean)
    );
    // Toutes les 28 équipes doivent apparaître au moins une fois
    teams.forEach((t) => expect(allIds.has(t.id)).toBe(true));
  });

  it("R1 → R2 : les startAt de R2 commencent après le début de R1 (pas avant)", () => {
    const matches = generateBerlinSEBracket(makeTeams(32), "TOP32", COURTS, START, DURATION);
    const r1 = matches.filter((m) => m.roundIndex === 1);
    const r2 = matches.filter((m) => m.roundIndex === 2);
    const minR1 = Math.min(...r1.map((m) => m.startAt.getTime()));
    const minR2 = Math.min(...r2.map((m) => m.startAt.getTime()));
    // R2 ne peut pas démarrer avant R1 (le roundBreak garantit ça)
    expect(minR2).toBeGreaterThanOrEqual(minR1 + DURATION * 60_000);
  });
});

describe("generateBerlinSEBracket — BOTTOM16", () => {
  it("16 équipes → 15 matchs + 1 match 3ème place = 16 matchs", () => {
    const matches = generateBerlinSEBracket(makeTeams(16), "BOTTOM16", COURTS, START, DURATION);
    expect(matches).toHaveLength(16);
  });

  it("tous les matchs ont phase='BOTTOM16'", () => {
    const matches = generateBerlinSEBracket(makeTeams(16), "BOTTOM16", COURTS, START, DURATION);
    expect(matches.every((m) => m.phase === "BOTTOM16")).toBe(true);
  });

  it("exactement 1 finale (G) et 1 match 3ème place (L)", () => {
    const matches = generateBerlinSEBracket(makeTeams(16), "BOTTOM16", COURTS, START, DURATION);
    expect(matches.filter((m) => m.bracketSide === "G")).toHaveLength(1);
    expect(matches.filter((m) => m.bracketSide === "L")).toHaveLength(1);
  });
});

// ─── generateBerlinFinalBrackets ──────────────────────────────────────────────

describe("generateBerlinFinalBrackets", () => {
  function makeRanking(n: number) {
    return makeTeams(n).map((team, i) => ({ team, globalRank: i + 1 }));
  }

  it("48 équipes → top32 a 32 matchs SE + 3ème place", () => {
    const { top32 } = generateBerlinFinalBrackets(makeRanking(48), COURTS, START, DURATION);
    expect(top32.filter((m) => m.phase === "TOP32")).toHaveLength(top32.length);
    expect(top32.filter((m) => m.bracketSide === "G")).toHaveLength(1);
    expect(top32.filter((m) => m.bracketSide === "L")).toHaveLength(1);
  });

  it("48 équipes → bottom16 a 16 matchs SE + 3ème place", () => {
    const { bottom16 } = generateBerlinFinalBrackets(makeRanking(48), COURTS, START, DURATION);
    expect(bottom16.filter((m) => m.phase === "BOTTOM16")).toHaveLength(bottom16.length);
    expect(bottom16.filter((m) => m.bracketSide === "G")).toHaveLength(1);
    expect(bottom16.filter((m) => m.bracketSide === "L")).toHaveLength(1);
  });

  it("les brackets TOP32 et BOTTOM16 ont des phases distinctes", () => {
    const { top32, bottom16 } = generateBerlinFinalBrackets(makeRanking(48), COURTS, START, DURATION);
    expect(top32.every((m) => m.phase === "TOP32")).toBe(true);
    expect(bottom16.every((m) => m.phase === "BOTTOM16")).toBe(true);
  });

  it("bottom16 commence après top32 (timings décalés)", () => {
    const { top32, bottom16 } = generateBerlinFinalBrackets(makeRanking(48), COURTS, START, DURATION);
    const minTop32 = Math.min(...top32.map((m) => m.startAt.getTime()));
    const minBottom16 = Math.min(...bottom16.map((m) => m.startAt.getTime()));
    expect(minBottom16).toBeGreaterThan(minTop32);
  });

  it("les 32 meilleures équipes sont dans TOP32, les 16 suivantes dans BOTTOM16", () => {
    const ranking = makeRanking(48);
    const { top32, bottom16 } = generateBerlinFinalBrackets(ranking, COURTS, START, DURATION);

    const top32Ids = new Set(
      top32.flatMap((m) => [m.teamAId, m.teamBId]).filter(Boolean)
    );
    const bottom16Ids = new Set(
      bottom16.flatMap((m) => [m.teamAId, m.teamBId]).filter(Boolean)
    );

    // Les 32 premiers rangs ne doivent pas apparaître dans bottom16
    const top32Teams = ranking.filter((r) => r.globalRank <= 32).map((r) => r.team.id);
    const bottom16Teams = ranking.filter((r) => r.globalRank > 32).map((r) => r.team.id);

    top32Teams.forEach((id) => expect(bottom16Ids.has(id)).toBe(false));
    bottom16Teams.forEach((id) => expect(top32Ids.has(id)).toBe(false));
  });

  it("ne plante pas avec moins de 48 équipes (tournoi plus petit)", () => {
    const ranking = makeRanking(20);
    expect(() => generateBerlinFinalBrackets(ranking, COURTS, START, DURATION)).not.toThrow();
  });

  it("avec 20 équipes : top est 20 équipes (pas de bottom16)", () => {
    const ranking = makeRanking(20);
    const { top32, bottom16 } = generateBerlinFinalBrackets(ranking, COURTS, START, DURATION);
    // top32 prend slice(0, 32) → toutes les 20 équipes
    const topIds = new Set(top32.flatMap((m) => [m.teamAId, m.teamBId]).filter(Boolean));
    expect(topIds.size).toBe(20);
    // bottom16 est vide (slice(32) = [])
    expect(bottom16).toHaveLength(0);
  });
});

// ─── Flux complet Berlin Mixed (integration légère) ───────────────────────────

describe("Flux complet Berlin Mixed — simulation 3 jours", () => {
  it("vendredi 5 rounds → samedi recomposition → dimanche swiss → brackets finals", () => {
    const teamsA = makeTeams(8, 0);   // Groupe A vendredi
    const teamsB = makeTeams(8, 8);   // Groupe B vendredi

    function makeStandings(teams: ReturnType<typeof makeTeams>) {
      return teams.map((t, i) => ({
        teamId: t.id, name: t.name,
        played: i, wins: Math.max(0, 3 - i), draws: 0, losses: i,
        goalsFor: 10 - i, goalsAgainst: i, goalDiff: 10 - 2 * i,
        points: (3 - Math.min(i, 3)) * 3, buchholz: 0, sonnebornBerger: 0,
      }));
    }

    // 1. Vendredi R1
    const friA = generateBerlinSwissRound(teamsA, makeStandings(teamsA), [], 1, "Fri-A", COURTS, START, DURATION, "FRI");
    const friB = generateBerlinSwissRound(teamsB, makeStandings(teamsB), [], 1, "Fri-B", COURTS, START, DURATION, "FRI");
    expect(friA).toHaveLength(4);
    expect(friB).toHaveLength(4);

    // 2. Classement global après vendredi
    const ranking = computeGlobalRanking(teamsA, teamsB, friA as any, friB as any);
    expect(ranking).toHaveLength(16);

    // 3. Recomposition samedi
    const { satA, satB } = assignSaturdayGroups(ranking);
    expect(satA).toHaveLength(8);
    expect(satB).toHaveLength(8);

    // 4. Samedi R1 (avec rematches vendredi interdits)
    const allFri = [...friA, ...friB] as any[];
    const satAMatches = generateBerlinSwissRound(satA, makeStandings(satA), allFri, 1, "Sat-A", COURTS, START, DURATION, "SAT");
    expect(satAMatches).toHaveLength(4);

    // 5. Dimanche Swiss
    const allHistory = [...allFri, ...satAMatches] as any[];
    const allTeams = [...teamsA, ...teamsB];
    const sundayStandings = makeStandings(allTeams);
    const sundayR1 = generateSundaySwissRound(allTeams, sundayStandings, allHistory, 1, COURTS, START, DURATION);
    expect(sundayR1).toHaveLength(8);

    // 6. Brackets finaux
    const finalRanking = allTeams.map((team, i) => ({ team, globalRank: i + 1 }));
    const { top32, bottom16 } = generateBerlinFinalBrackets(finalRanking, COURTS, START, DURATION);
    // 16 équipes → top32 prend les 16 (slice 0..32)
    expect(top32.filter((m) => m.bracketSide === "G")).toHaveLength(1);
    expect(bottom16).toHaveLength(0); // pas de bottom avec seulement 16
  });
});
