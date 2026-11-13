import { describe, expect, it } from "vitest";
import { DT, TERRAIN } from "./constantes";
import { creerMatch, DUREES, pasMatch, type EvenementMatch } from "./match";
import { pointMaillet } from "./pas";
import { COMMANDE_VIDE, type Commande } from "./types";

const cmd = (p: Partial<Commande>): Commande => ({ ...COMMANDE_VIDE, ...p });
const avancer = (m: ReturnType<typeof creerMatch>, s: number, c: Commande[] = []) => { const evs: EvenementMatch[] = []; for (let i = 0; i < Math.round(s / DT); i++) { pasMatch(m, c); evs.push(...m.evenements); } return evs; };

describe("joute de départ (EHBA 5.2)", () => {
  it("personne ne bouge avant le signal, puis le jeu démarre", () => {
    const m = creerMatch(1);
    const x0 = m.etat.joueurs[0].x;
    const evs = avancer(m, DUREES.joute - 0.1, [cmd({ dx: 1 }), cmd({ dx: -1 })]);
    expect(m.etat.joueurs[0].x).toBe(x0);
    expect(evs.filter((v) => v.type === "compte").map((v) => (v as { n: number }).n)).toEqual([3, 2, 1]);
    const evs2 = avancer(m, 1, [cmd({ dx: 1 }), cmd({ dx: -1 })]);
    expect(evs2.some((v) => v.type === "coupDEnvoi")).toBe(true);
    expect(m.phase).toBe("jeu");
    expect(m.etat.joueurs[0].x).toBeGreaterThan(x0);
  });
  it("les joueurs partent de la balustrade derrière leur cage, la balle au centre", () => {
    const m = creerMatch(1);
    expect(m.etat.joueurs[0].x).toBeLessThan(-TERRAIN.ligneBut - TERRAIN.butProfondeur);
    expect(m.etat.joueurs[1].x).toBeGreaterThan(TERRAIN.ligneBut + TERRAIN.butProfondeur);
    expect(m.etat.balle.x).toBe(0);
  });
});

describe("buts, reprise et chrono", () => {
  function marquer(m: ReturnType<typeof creerMatch>, equipe: 0 | 1) {
    const j = m.etat.joueurs.find((x) => x.equipe === equipe)!, s = equipe === 0 ? 1 : -1;
    j.x = s * 9; j.y = 0; j.cap = s === 1 ? 0 : Math.PI;
    const mp = pointMaillet(j); m.etat.balle.x = mp.x; m.etat.balle.y = mp.y;
    const cmds = m.etat.joueurs.map((x) => (x === j ? cmd({ tir: 1, viseX: s * (TERRAIN.ligneBut + 0.4), viseY: 0 }) : cmd({})));
    pasMatch(m, cmds);
    return avancer(m, 1.5);
  }
  it("un but arrête le chrono, puis l'équipe qui a encaissé repart avec la balle dans son camp", () => {
    const m = creerMatch(2); avancer(m, DUREES.joute + 0.1);
    const evs = marquer(m, 0);
    expect(evs.some((v) => v.type === "but" && v.equipe === 0)).toBe(true);
    expect(m.etat.score).toEqual([1, 0]);
    const chrono = m.chrono; avancer(m, 0.5);
    expect(m.chrono).toBe(chrono);
    const evs2 = avancer(m, DUREES.but + DUREES.remise);
    expect(evs2.some((v) => v.type === "reprise" && v.possession === 1)).toBe(true);
    expect(m.phase).toBe("jeu");
    expect(m.etat.balle.x).toBeGreaterThan(0); // dans le camp de l'équipe 1
    const j1 = m.etat.joueurs[1], mp = pointMaillet(j1);
    expect(Math.hypot(mp.x - m.etat.balle.x, mp.y - m.etat.balle.y)).toBeLessThan(0.2);
    expect(m.etat.joueurs[0].x).toBeLessThan(0); // l'autre attend dans son camp
  });
  it("le match se termine au nombre de buts fixé", () => {
    const m = creerMatch(3, 1, { butsPourGagner: 2, duree: 600 }); avancer(m, DUREES.joute + 0.1);
    marquer(m, 1); avancer(m, DUREES.but + DUREES.remise);
    const evs = marquer(m, 1); evs.push(...avancer(m, DUREES.but));
    expect(evs.some((v) => v.type === "finMatch" && v.vainqueur === 1)).toBe(true);
    expect(m.phase).toBe("fin");
  });
  it("fin du temps : le meilleur score gagne ; à égalité, but en or", () => {
    const m = creerMatch(4, 1, { butsPourGagner: 5, duree: 2 });
    const evs = avancer(m, DUREES.joute + 2.2);
    expect(evs.some((v) => v.type === "butEnOr")).toBe(true);
    expect(m.phase).toBe("jeu");
    const evs2 = marquer(m, 0); evs2.push(...avancer(m, DUREES.but));
    expect(evs2.some((v) => v.type === "finMatch" && v.vainqueur === 0)).toBe(true);
  });
  it("une balle poussée dans la cage ne compte pas : arrêt, la défense repart avec la balle", () => {
    const m = creerMatch(5); avancer(m, DUREES.joute + 0.1);
    const j = m.etat.joueurs[0]; j.x = 12; j.y = -0.45; j.cap = 0;
    const mp = pointMaillet(j); m.etat.balle.x = mp.x; m.etat.balle.y = mp.y;
    const evs = avancer(m, 4, [cmd({ dx: 1 }), cmd({})]);
    expect(evs.some((v) => v.type === "butRefuse")).toBe(true);
    expect(m.etat.score).toEqual([0, 0]);
    avancer(m, DUREES.but + DUREES.remise);
    expect(m.etat.balle.x).toBeGreaterThan(0);
  });
});
