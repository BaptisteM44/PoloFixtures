import { describe, it, expect } from "vitest";
import { assignRefereeTeams, checkRefereeAssignments, rankCandidates, type RefMatch, type RefOptions } from "./referees";

const T0 = Date.parse("2026-10-10T08:00:00Z");
const MIN = 60_000;
const SLOT = 16 * MIN;

const mk = (id: string, at: number, court: string, a: string | null, b: string | null, extra: Partial<RefMatch> = {}): RefMatch => ({
  id, startAt: new Date(T0 + at), courtName: court, teamAId: a, teamBId: b, stageKey: "s1", groupKey: null,
  status: "SCHEDULED", refereeTeamId: null, refereeAuto: false, ...extra,
});

/** Poules round-robin de 4 (groupes A et B) : groupe A sur le terrain 1, B sur le 2. */
function schedule(groups: Record<string, string[]>, stageKey = "s1"): RefMatch[] {
  const out: RefMatch[] = [];
  Object.entries(groups).forEach(([g, [t1, t2, t3, t4]], gi) => {
    const pairs = [[t1, t2], [t3, t4], [t1, t3], [t2, t4], [t1, t4], [t2, t3]];
    pairs.forEach(([a, b], i) => out.push(mk(`${g}${i}`, i * SLOT, `Court ${gi + 1}`, a, b, { stageKey, groupKey: g })));
  });
  return out;
}
const TEAMS = ["a1", "a2", "a3", "a4", "b1", "b2", "b3", "b4"];
const opts = (o: Partial<RefOptions> = {}): RefOptions => ({ rules: { s1: "rotation" }, ...o });
/** L'équipe joue-t-elle un match qui recouvre (12 min de jeu) celui-ci ? */
const overlaps = (ms: RefMatch[], team: string, m: RefMatch) =>
  ms.some((p) => p.id !== m.id && (p.teamAId === team || p.teamBId === team) && Math.abs(p.startAt.getTime() - m.startAt.getTime()) < 14 * MIN);

describe("assignRefereeTeams", () => {
  it("rotation : chaque match a un arbitre qui ne joue pas en même temps, charge équilibrée", () => {
    const ms = schedule({ A: ["a1", "a2", "a3", "a4"], B: ["b1", "b2", "b3", "b4"] });
    const { assignments, conflicts } = assignRefereeTeams({ matches: ms, teamIds: TEAMS, options: opts(), mode: "fill" });
    // Planning dense (4 équipes sur 8 jouent à chaque créneau) : le repos ne
    // peut pas toujours être tenu — signalé, jamais bloquant.
    expect(conflicts.filter((c) => c.reason !== "rest")).toEqual([]);
    expect(assignments.size).toBe(ms.length);
    for (const m of ms) {
      const ref = assignments.get(m.id)!;
      expect([m.teamAId, m.teamBId]).not.toContain(ref);
      expect(overlaps(ms, ref, m)).toBe(false);
    }
    // Une équipe n'arbitre qu'un match à la fois.
    const perSlot = new Map<string, number>();
    for (const m of ms) {
      const k = `${m.startAt.getTime()}|${assignments.get(m.id)}`;
      perSlot.set(k, (perSlot.get(k) ?? 0) + 1);
    }
    expect(Math.max(...perSlot.values())).toBe(1);
    const load = TEAMS.map((t) => [...assignments.values()].filter((x) => x === t).length);
    expect(Math.max(...load) - Math.min(...load)).toBeLessThanOrEqual(1);
  });

  it("INVIOLABLE : terrains décalés (retards) — jamais arbitre pendant un de ses matchs", () => {
    // Terrain 2 en retard de 5 min, puis de plus en plus : les heures ne
    // tombent plus jamais pile ensemble.
    const ms = schedule({ A: ["a1", "a2", "a3", "a4"], B: ["b1", "b2", "b3", "b4"] })
      .map((m, i) => m.courtName === "Court 2" ? { ...m, startAt: new Date(m.startAt.getTime() + (5 + i) * MIN) } : m);
    const { assignments } = assignRefereeTeams({ matches: ms, teamIds: TEAMS, options: opts(), mode: "fill" });
    expect(assignments.size).toBe(ms.length);
    for (const m of ms) expect(overlaps(ms, assignments.get(m.id)!, m)).toBe(false);
  });

  it("même terrain : c'est l'ordre des matchs qui compte, pas l'heure exacte", () => {
    // 1 terrain, matchs qui ont glissé (écarts irréguliers) : x vient de jouer
    // le match précédent → jamais arbitre du suivant, même 40 min plus tard.
    const ms = [
      mk("m1", 0, "C1", "x", "y"),
      mk("m2", 40 * MIN, "C1", "z", "w"),
      mk("m3", 52 * MIN, "C1", "v", "u"),
    ];
    const { assignments } = assignRefereeTeams({ matches: ms, teamIds: ["x", "y", "z", "w", "v", "u", "r"], options: opts(), mode: "fill" });
    expect(["x", "y"]).not.toContain(assignments.get("m2"));
  });

  it("repos (choix de l'orga) : jamais juste après avoir joué ; « avant et après » évite aussi d'enchaîner", () => {
    const ms = schedule({ A: ["a1", "a2", "a3", "a4"], B: ["b1", "b2", "b3", "b4"] })
      .map((m) => {
        const i = Number(m.id.slice(1));
        return { ...m, courtName: "Court 1", startAt: new Date(T0 + (2 * i + (m.groupKey === "B" ? 1 : 0)) * SLOT) };
      });
    const playsAt = (team: string, at: number) => ms.some((m) => m.startAt.getTime() === at && (m.teamAId === team || m.teamBId === team));
    for (const rest of ["after", "both"] as const) {
      const { assignments, conflicts } = assignRefereeTeams({ matches: ms, teamIds: TEAMS, options: opts({ rest }), mode: "fill" });
      expect(conflicts).toEqual([]);
      for (const m of ms) {
        const ref = assignments.get(m.id)!;
        expect(playsAt(ref, m.startAt.getTime() - SLOT)).toBe(false);
        if (rest === "both") expect(playsAt(ref, m.startAt.getTime() + SLOT)).toBe(false);
      }
    }
  });

  it("repos impossible : on désigne quand même mais l'orga est prévenu", () => {
    // 3 équipes, 1 terrain : l'arbitre du 2e match vient forcément de jouer.
    const ms = [mk("m1", 0, "C1", "x", "y"), mk("m2", SLOT, "C1", "x", "z")];
    const { assignments, conflicts } = assignRefereeTeams({ matches: ms, teamIds: ["x", "y", "z"], options: opts(), mode: "fill" });
    expect(assignments.get("m2")).toBe("y");
    expect(conflicts).toContainEqual({ matchId: "m2", reason: "rest" });
  });

  it("phase finale : les éliminées arbitrent en priorité, mais pas la finale si elles sortent de la demie", () => {
    const ms = [
      // Quarts (finis)
      mk("q1", 0, "C1", "t1", "t8", { status: "FINISHED" }), mk("q2", 0, "C2", "t4", "t5", { status: "FINISHED" }),
      mk("q3", SLOT, "C1", "t2", "t7", { status: "FINISHED" }), mk("q4", SLOT, "C2", "t3", "t6", { status: "FINISHED" }),
      // Demies (finies : t4 et t3 éliminées)
      mk("s1", 2 * SLOT, "C1", "t1", "t4", { status: "FINISHED" }), mk("s2", 2 * SLOT, "C2", "t2", "t3", { status: "FINISHED" }),
      // Finale
      mk("f", 3 * SLOT, "C1", "t1", "t2"),
    ];
    const teams = ["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8"];
    const { assignments } = assignRefereeTeams({ matches: ms, teamIds: teams, options: opts(), mode: "fill" });
    const ref = assignments.get("f")!;
    expect(["t5", "t6", "t7", "t8"]).toContain(ref); // éliminée en quart, reposée
  });

  it("une équipe encore en course n'arbitre pas si une éliminée est libre", () => {
    const ms = [
      mk("p1", 0, "C1", "e1", "e2", { status: "FINISHED" }),
      mk("p2", SLOT, "C1", "f1", "f2", { status: "FINISHED" }),
      mk("m", 2 * SLOT, "C1", "x", "y"),
      mk("later", 4 * SLOT, "C1", "z", "w"),
    ];
    const { assignments } = assignRefereeTeams({ matches: ms, teamIds: ["e1", "e2", "x", "y", "z", "w"], options: opts(), mode: "fill" });
    expect(["e1", "e2"]).toContain(assignments.get("m"));
  });

  it("groupes croisés : le groupe B arbitre le groupe A et inversement ; sans groupes = automatique", () => {
    const ms = schedule({ A: ["a1", "a2", "a3", "a4"], B: ["b1", "b2", "b3", "b4"] });
    const shifted = ms.map((m) => m.groupKey === "B" ? { ...m, startAt: new Date(m.startAt.getTime() + 6 * SLOT) } : m);
    const r = assignRefereeTeams({ matches: shifted, teamIds: TEAMS, options: opts({ rules: { s1: "cross_groups" } }), mode: "fill" });
    expect(r.conflicts).toEqual([]);
    for (const m of shifted) expect(r.assignments.get(m.id)!.startsWith(m.groupKey === "A" ? "b" : "a")).toBe(true);

    const single = schedule({ A: ["a1", "a2", "a3", "a4"] });
    const r2 = assignRefereeTeams({ matches: single, teamIds: TEAMS, options: opts({ rules: { s1: "cross_groups" } }), mode: "fill" });
    expect(r2.assignments.size).toBe(single.length);
  });

  it("manuel : rien n'est désigné ; les choix de l'orga ne sont jamais écrasés", () => {
    const ms = schedule({ A: ["a1", "a2", "a3", "a4"] });
    expect(assignRefereeTeams({ matches: ms, teamIds: TEAMS, options: opts({ rules: { s1: "manual" } }), mode: "fill" }).assignments.size).toBe(0);
    ms[0].refereeTeamId = "b4"; ms[0].refereeAuto = false; // choix manuel
    ms[1].refereeTeamId = "b3"; ms[1].refereeAuto = true;  // choix automatique précédent
    const r = assignRefereeTeams({ matches: ms, teamIds: TEAMS, options: opts(), mode: "recompute" });
    expect(r.assignments.has(ms[0].id)).toBe(false);
    expect(r.assignments.has(ms[1].id)).toBe(true);
    const fill = assignRefereeTeams({ matches: ms, teamIds: TEAMS, options: opts(), mode: "fill" });
    expect(fill.assignments.has(ms[1].id)).toBe(false);
  });

  it("réparation : une désignation auto devenue impossible (retard) est remplacée ; une manuelle est signalée", () => {
    const ms = [
      mk("m1", 0, "C1", "x", "y", { refereeTeamId: "z", refereeAuto: true }),
      mk("m2", 0, "C1", "v", "u", { refereeTeamId: "w", refereeAuto: false }),
      // Le terrain 2 a pris du retard : z et w y jouent désormais en même temps.
      mk("m3", 5 * MIN, "C2", "z", "w", { status: "SCHEDULED" }),
    ];
    // m1 et m2 sur le même terrain au même horaire : on les sépare d'un créneau.
    ms[1].startAt = new Date(T0 + SLOT); ms[2].startAt = new Date(T0 + SLOT + 3 * MIN);
    ms[0].startAt = new Date(T0 + SLOT); ms[0].courtName = "C3";
    const teams = ["x", "y", "z", "w", "v", "u", "r", "q"];
    const r = assignRefereeTeams({ matches: ms, teamIds: teams, options: opts(), mode: "repair" });
    expect(r.assignments.get("m1")).toBeDefined();
    expect(["z", "w"]).not.toContain(r.assignments.get("m1"));
    expect(r.assignments.has("m2")).toBe(false);
    expect(r.conflicts).toContainEqual({ matchId: "m2", reason: "plays_same_slot" });
  });

  it("équipe dispensée : jamais désignée ; un choix manuel la concernant est signalé", () => {
    const ms = schedule({ A: ["a1", "a2", "a3", "a4"], B: ["b1", "b2", "b3", "b4"] });
    const r = assignRefereeTeams({ matches: ms, teamIds: TEAMS, options: opts({ excluded: ["b1", "a1"] }), mode: "fill" });
    expect([...r.assignments.values()]).not.toContain("b1");
    expect([...r.assignments.values()]).not.toContain("a1");
    ms[0].refereeTeamId = "b1";
    expect(checkRefereeAssignments({ matches: ms, teamIds: TEAMS, options: opts({ excluded: ["b1"] }) })).toContainEqual({ matchId: ms[0].id, reason: "excluded" });
  });

  it("matchs commencés ou aux équipes inconnues : ignorés ; match passé en cours mais pas lancé : désigné", () => {
    const ms = schedule({ A: ["a1", "a2", "a3", "a4"] });
    ms[0].status = "LIVE"; ms[0].started = true;
    ms[1].teamBId = null;
    ms[2].status = "LIVE"; ms[2].started = false; // mis « sur le terrain » par le recalage, chrono pas lancé
    const r = assignRefereeTeams({ matches: ms, teamIds: TEAMS, options: opts(), mode: "fill" });
    expect(r.assignments.has(ms[0].id)).toBe(false);
    expect(r.assignments.has(ms[1].id)).toBe(false);
    expect(r.assignments.has(ms[2].id)).toBe(true);
  });

  it("personne de libre : conflit signalé ; choix manuel incohérent : signalé aussi", () => {
    const busy: RefMatch[] = [
      mk("m1", 0, "C1", "a1", "a2"),
      mk("m2", 0, "C2", "a3", "a4", { refereeTeamId: "a1" }),
    ];
    const r = assignRefereeTeams({ matches: busy, teamIds: ["a1", "a2", "a3", "a4"], options: opts(), mode: "fill" });
    expect(r.conflicts).toEqual([{ matchId: "m1", reason: "no_candidate" }, { matchId: "m2", reason: "plays_same_slot" }]);
  });
});

describe("rankCandidates (sélecteur de l'orga)", () => {
  it("équipes libres et reposées en tête, celles qui jouent en même temps à la fin", () => {
    const ms = [
      mk("p", 0, "C1", "x", "y"),
      mk("m", 2 * SLOT, "C1", "a", "b"),
      mk("q", SLOT, "C1", "z", "w"),
      mk("o", 2 * SLOT + 2 * MIN, "C2", "v", "u"),
    ];
    const list = rankCandidates({ matches: ms, teamIds: ["a", "x", "z", "v", "r"], options: opts(), matchId: "m" });
    expect(list.map((c) => [c.teamId, c.state])).toEqual([
      ["x", "ok"], // a joué il y a deux matchs : idéal
      ["r", "ok"],
      ["z", "just_played"],
      ["a", "own"],
      ["v", "plays"],
    ]);
    expect(list[0].rested).toBe(true);
  });
});
