import { describe, expect, it } from "vitest";
import { planAbcResync } from "./abc-teams";

/** Fausse base : juste ce que lit planAbcResync. */
function fakeTx(data: {
  teams: string[];
  entries: { playerId: string; teamId: string | null; waitlisted?: boolean }[];
  teamPlayers: { id: string; teamId: string; playerId: string }[];
}) {
  return {
    tournamentSoloEntry: { findMany: async () => data.entries.map((e) => ({ waitlisted: false, ...e })) },
    teamPlayer: { findMany: async () => data.teamPlayers },
    team: { findMany: async () => data.teams.map((id) => ({ id })) },
  } as never;
}

describe("planAbcResync", () => {
  it("ne propose rien quand le panneau et les équipes sont d'accord", async () => {
    const plan = await planAbcResync(fakeTx({
      teams: ["t1"],
      entries: [{ playerId: "a", teamId: "t1" }, { playerId: "b", teamId: "t1" }],
      teamPlayers: [{ id: "tp1", teamId: "t1", playerId: "a" }, { id: "tp2", teamId: "t1", playerId: "b" }],
    }), "x");
    expect(plan).toEqual({ remove: [], add: [], extra: 0 });
  });

  it("recale un·e joueur·euse déplacé·e à la main avant le correctif (cas Lille)", async () => {
    // Panneau : Davide dans t2. Vraie composition : encore dans t1.
    const plan = await planAbcResync(fakeTx({
      teams: ["t1", "t2"],
      entries: [{ playerId: "davide", teamId: "t2" }, { playerId: "lucas", teamId: "t1" }],
      teamPlayers: [{ id: "tp1", teamId: "t1", playerId: "davide" }, { id: "tp2", teamId: "t1", playerId: "lucas" }],
    }), "x");
    expect(plan.remove).toEqual(["tp1"]);
    expect(plan.add).toEqual([{ teamId: "t2", playerId: "davide" }]);
  });

  it("retire les doublons et les joueur·euses non placé·e·s ou en attente", async () => {
    const plan = await planAbcResync(fakeTx({
      teams: ["t1", "t2"],
      entries: [{ playerId: "a", teamId: "t1" }, { playerId: "b", teamId: null }, { playerId: "c", teamId: "t1", waitlisted: true }],
      teamPlayers: [
        { id: "tp1", teamId: "t1", playerId: "a" },
        { id: "tp2", teamId: "t2", playerId: "a" },
        { id: "tp3", teamId: "t2", playerId: "b" },
        { id: "tp4", teamId: "t1", playerId: "c" },
      ],
    }), "x");
    expect(plan.remove.sort()).toEqual(["tp2", "tp3", "tp4"]);
    expect(plan.add).toEqual([]);
  });

  it("laisse les joueur·euses sans inscription solo (gestion classique)", async () => {
    const plan = await planAbcResync(fakeTx({
      teams: ["t1"],
      entries: [{ playerId: "a", teamId: "t1" }],
      teamPlayers: [{ id: "tp1", teamId: "t1", playerId: "a" }, { id: "tp2", teamId: "t1", playerId: "invite" }],
    }), "x");
    expect(plan).toEqual({ remove: [], add: [], extra: 1 });
  });
});
