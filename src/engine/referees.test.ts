import { describe, it, expect } from "vitest";
import { assignRefereeTeams, type RefMatch } from "./referees";

const T0 = Date.parse("2026-10-10T08:00:00Z");
const SLOT = 20 * 60_000;

/** Poules round-robin de 4 (groupes A et B), 2 terrains, un match par terrain et par créneau. */
function schedule(groups: Record<string, string[]>, stageKey = "s1"): RefMatch[] {
  const pairs: { g: string; a: string; b: string }[] = [];
  for (const [g, teams] of Object.entries(groups)) {
    // Ordre « berger » pour 4 équipes : 3 rondes de 2 matchs.
    const [t1, t2, t3, t4] = teams;
    pairs.push({ g, a: t1, b: t2 }, { g, a: t3, b: t4 }, { g, a: t1, b: t3 }, { g, a: t2, b: t4 }, { g, a: t1, b: t4 }, { g, a: t2, b: t3 });
  }
  // Un match par terrain et par créneau : groupe A sur le terrain 1, B sur le 2.
  const byGroup = Object.keys(groups).map((g) => pairs.filter((p) => p.g === g));
  const out: RefMatch[] = [];
  byGroup.forEach((list, gi) => list.forEach((p, i) => out.push({
    id: `${p.g}${i}`, startAt: new Date(T0 + i * SLOT), courtName: `Court ${gi + 1}`,
    teamAId: p.a, teamBId: p.b, stageKey, groupKey: p.g, status: "SCHEDULED",
    refereeTeamId: null, refereeAuto: false,
  })));
  return out;
}
const TEAMS = ["a1", "a2", "a3", "a4", "b1", "b2", "b3", "b4"];
const slotPlays = (ms: RefMatch[], team: string, at: number) =>
  ms.some((m) => m.startAt.getTime() === at && (m.teamAId === team || m.teamBId === team));

describe("assignRefereeTeams", () => {
  it("rotation : chaque match a un arbitre qui ne joue pas au même créneau, charge équilibrée", () => {
    const ms = schedule({ A: ["a1", "a2", "a3", "a4"], B: ["b1", "b2", "b3", "b4"] });
    const { assignments, conflicts } = assignRefereeTeams({ matches: ms, teamIds: TEAMS, rules: { s1: "rotation" }, mode: "fill" });
    expect(conflicts).toEqual([]);
    expect(assignments.size).toBe(ms.length);
    for (const m of ms) {
      const ref = assignments.get(m.id)!;
      expect([m.teamAId, m.teamBId]).not.toContain(ref);
      expect(slotPlays(ms, ref, m.startAt.getTime())).toBe(false);
    }
    // Une équipe n'arbitre qu'un match par créneau.
    const perSlot = new Map<string, number>();
    for (const m of ms) {
      const k = `${m.startAt.getTime()}|${assignments.get(m.id)}`;
      perSlot.set(k, (perSlot.get(k) ?? 0) + 1);
    }
    expect(Math.max(...perSlot.values())).toBe(1);
    // Équité : 12 matchs / 8 équipes → 1 ou 2 arbitrages chacune.
    const load = TEAMS.map((t) => [...assignments.values()].filter((x) => x === t).length);
    expect(Math.max(...load) - Math.min(...load)).toBeLessThanOrEqual(1);
  });

  it("groupes croisés : le groupe B arbitre le groupe A et inversement", () => {
    const ms = schedule({ A: ["a1", "a2", "a3", "a4"], B: ["b1", "b2", "b3", "b4"] });
    // Groupes décalés (A le matin, B l'après-midi) pour qu'il y ait toujours des arbitres libres.
    const shifted = ms.map((m) => m.groupKey === "B" ? { ...m, startAt: new Date(m.startAt.getTime() + 6 * SLOT) } : m);
    const { assignments, conflicts } = assignRefereeTeams({ matches: shifted, teamIds: TEAMS, rules: { s1: "cross_groups" }, mode: "fill" });
    expect(conflicts).toEqual([]);
    for (const m of shifted) {
      const ref = assignments.get(m.id)!;
      expect(ref.startsWith(m.groupKey === "A" ? "b" : "a")).toBe(true);
    }
  });

  it("manuel : rien n'est désigné ; les choix de l'orga ne sont jamais écrasés", () => {
    const ms = schedule({ A: ["a1", "a2", "a3", "a4"] });
    expect(assignRefereeTeams({ matches: ms, teamIds: TEAMS, rules: { s1: "manual" }, mode: "fill" }).assignments.size).toBe(0);
    ms[0].refereeTeamId = "b4"; ms[0].refereeAuto = false; // choix manuel
    ms[1].refereeTeamId = "b3"; ms[1].refereeAuto = true;  // choix automatique précédent
    const r = assignRefereeTeams({ matches: ms, teamIds: TEAMS, rules: { s1: "rotation" }, mode: "recompute" });
    expect(r.assignments.has(ms[0].id)).toBe(false);
    expect(r.assignments.has(ms[1].id)).toBe(true);
    const fill = assignRefereeTeams({ matches: ms, teamIds: TEAMS, rules: { s1: "rotation" }, mode: "fill" });
    expect(fill.assignments.has(ms[1].id)).toBe(false);
  });

  it("matchs commencés ou aux équipes inconnues (bracket) : ignorés", () => {
    const ms = schedule({ A: ["a1", "a2", "a3", "a4"] });
    ms[0].status = "LIVE";
    ms[1].teamBId = null;
    const r = assignRefereeTeams({ matches: ms, teamIds: TEAMS, rules: { s1: "rotation" }, mode: "fill" });
    expect(r.assignments.has(ms[0].id)).toBe(false);
    expect(r.assignments.has(ms[1].id)).toBe(false);
  });

  it("personne de libre : conflit signalé ; choix manuel incohérent : signalé aussi", () => {
    // 4 équipes, 2 matchs au même créneau : tout le monde joue.
    const busy: RefMatch[] = [
      { id: "m1", startAt: new Date(T0), courtName: "C1", teamAId: "a1", teamBId: "a2", stageKey: "s1", groupKey: null, status: "SCHEDULED", refereeTeamId: null, refereeAuto: false },
      { id: "m2", startAt: new Date(T0), courtName: "C2", teamAId: "a3", teamBId: "a4", stageKey: "s1", groupKey: null, status: "SCHEDULED", refereeTeamId: "a1", refereeAuto: false },
    ];
    const r = assignRefereeTeams({ matches: busy, teamIds: ["a1", "a2", "a3", "a4"], rules: { s1: "rotation" }, mode: "fill" });
    expect(r.conflicts).toEqual([{ matchId: "m1", reason: "no_candidate" }, { matchId: "m2", reason: "plays_same_slot" }]);
  });

  it("rotation : jouer → repos → arbitrer quand le planning le permet", () => {
    // Groupes en alternance : A aux créneaux pairs, B aux impairs (un seul terrain).
    const ms = schedule({ A: ["a1", "a2", "a3", "a4"], B: ["b1", "b2", "b3", "b4"] })
      .map((m) => {
        const i = Number(m.id.slice(1));
        return { ...m, courtName: "Court 1", startAt: new Date(T0 + (2 * i + (m.groupKey === "B" ? 1 : 0)) * SLOT) };
      });
    const { assignments, conflicts } = assignRefereeTeams({ matches: ms, teamIds: TEAMS, rules: { s1: "rotation" }, mode: "fill" });
    expect(conflicts).toEqual([]);
    let justPlayed = 0;
    for (const m of ms) if (slotPlays(ms, assignments.get(m.id)!, m.startAt.getTime() - SLOT)) justPlayed++;
    expect(justPlayed).toBe(0);
  });
});
