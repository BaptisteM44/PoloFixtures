/**
 * Régression : computeStandings doit compter les stats d'une équipe même
 * pour un match contre un adversaire ABSENT du classement courant (ex: match
 * de poule hérité contre une tête de série qui n'a pas rejoint le Swiss).
 * Avant ce fix, ces matchs étaient silencieusement exclus (played plafonné),
 * alors que l'adversaire présent doit voir son historique complet compté.
 */
import { describe, it, expect } from "vitest";
import { computeStandings } from "./standings";
import type { Match, Team } from "@prisma/client";

function team(id: string): Team {
  return { id, name: id } as Team;
}

function match(id: string, teamAId: string | null, teamBId: string | null, scoreA: number, scoreB: number): Match {
  return { id, teamAId, teamBId, scoreA, scoreB, status: "FINISHED" } as unknown as Match;
}

describe("computeStandings — match contre une équipe absente du classement", () => {
  it("compte les stats de l'équipe présente même si l'adversaire n'est pas dans `teams`", () => {
    const teams = [team("A"), team("B")];
    const matches = [
      // A vs B : les deux présentes, compté normalement des deux côtés.
      match("m1", "A", "B", 5, 2),
      // A vs X : X est absente de `teams` (ex: tête de série hors Swiss).
      // Le match doit quand même compter pour A.
      match("m2", "A", "X", 3, 1),
      // B vs Y : idem pour B.
      match("m3", "B", "Y", 0, 4),
    ];

    const standings = computeStandings(teams, matches, "3/1");
    const a = standings.find((r) => r.teamId === "A")!;
    const b = standings.find((r) => r.teamId === "B")!;

    expect(a.played, "A doit avoir 2 matchs comptés (vs B + vs X absente)").toBe(2);
    expect(b.played, "B doit avoir 2 matchs comptés (vs A + vs Y absente)").toBe(2);

    // A : 1 victoire (vs B) + 1 victoire (vs X) = 2 victoires, 6 points.
    expect(a.wins).toBe(2);
    expect(a.points).toBe(6);

    // B : 1 défaite (vs A) + 1 défaite (vs Y) = 2 défaites, 0 point.
    expect(b.losses).toBe(2);
    expect(b.points).toBe(0);

    // Aucune ligne ne doit exister pour les équipes absentes X/Y.
    expect(standings.find((r) => r.teamId === "X")).toBeUndefined();
    expect(standings.find((r) => r.teamId === "Y")).toBeUndefined();
  });

  it("un match entre deux équipes absentes n'affecte aucune ligne", () => {
    const teams = [team("A")];
    const matches = [match("m1", "X", "Y", 5, 2)];
    const standings = computeStandings(teams, matches, "3/1");
    expect(standings[0].played).toBe(0);
  });
});
