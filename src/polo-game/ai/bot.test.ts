import { describe, expect, it } from "vitest";
import { DT, JOUEUR, TERRAIN } from "../sim/constantes";
import { creerMatch, pasMatch, type EvenementMatch } from "../sim/match";
import { creerEtat, creerJoueur, pas } from "../sim/pas";
import { COMMANDE_VIDE } from "../sim/types";
import { creerBot, type Niveau } from "./bot";

function matchBots(graine: number, n0: Niveau, n1: Niveau, secondes: number) {
  const m = creerMatch(graine, 1, { butsPourGagner: 99, duree: secondes });
  const bots = [creerBot(0, n0, graine * 7 + 1), creerBot(1, n1, graine * 13 + 2)];
  const evs: EvenementMatch[] = []; let tirs = 0, toucheurs = new Set<number>(), immobile = 0, maxImmobile = 0;
  let px = m.etat.balle.x, py = m.etat.balle.y;
  for (let i = 0; i < Math.round((secondes + 30) / DT) && m.phase !== "fin"; i++) {
    pasMatch(m, bots.map((b) => b.decider(m.etat)));
    evs.push(...m.evenements);
    for (const ev of m.etat.evenements) if (ev.type === "tir") tirs++;
    if (m.etat.balle.dernierJoueur !== null) toucheurs.add(m.etat.balle.dernierJoueur);
    const bouge = Math.hypot(m.etat.balle.x - px, m.etat.balle.y - py) > 1e-4; px = m.etat.balle.x; py = m.etat.balle.y;
    if (m.phase === "jeu" && !bouge) { immobile += DT; maxImmobile = Math.max(maxImmobile, immobile); } else immobile = 0;
  }
  return { m, evs, tirs, toucheurs, maxImmobile };
}

describe("bot 1 contre 1", () => {
  it("bots contre bots pendant 4 minutes : les deux jouent la balle, tirent, marquent, sans blocage", () => {
    for (const graine of [1, 2, 3]) {
      const r = matchBots(graine, "moyen", "moyen", 240);
      expect(r.toucheurs.size).toBe(2);
      expect(r.tirs).toBeGreaterThan(8);
      expect(r.m.etat.score[0] + r.m.etat.score[1]).toBeGreaterThan(1);
      expect(r.maxImmobile).toBeLessThan(15);
    }
  });
  it("le niveau difficile bat le niveau facile sur plusieurs matchs", () => {
    let dif = 0, fac = 0;
    for (const graine of [11, 12, 13, 14]) { const r = matchBots(graine, "difficile", "facile", 180); dif += r.m.etat.score[0]; fac += r.m.etat.score[1]; }
    expect(dif).toBeGreaterThan(fac);
  });
  it("seul sur le terrain, il va chercher la balle et marque", () => {
    const m = creerMatch(21); const bot = creerBot(1, "moyen", 5);
    m.etat.joueurs[0].x = -18; m.etat.joueurs[0].y = 9; // l'adversaire est loin, immobile
    let but = false;
    for (let i = 0; i < Math.round(40 / DT) && !but; i++) { pasMatch(m, [COMMANDE_VIDE, bot.decider(m.etat)]); if (m.evenements.some((v) => v.type === "but" && v.equipe === 1)) but = true; }
    expect(but).toBe(true);
  });
  it("hors jeu, il va taper la balustrade au milieu et revient en jeu (EHBA 6.2.1.7)", () => {
    const e = creerEtat(1, [creerJoueur(0, 1, 12, -6, Math.PI)]);
    e.joueurs[0].etat = "horsJeu"; e.balle.x = 5;
    const bot = creerBot(0, "moyen", 3);
    let retour = -1;
    for (let i = 0; i < Math.round(15 / DT); i++) { pas(e, [bot.decider(e)]); if (e.evenements.some((v) => v.type === "tapIn")) { retour = i * DT; break; } }
    expect(retour).toBeGreaterThan(0);
    expect(Math.abs(e.joueurs[0].x)).toBeLessThan(1.2);
    expect(TERRAIN.demiW - Math.abs(e.joueurs[0].y)).toBeLessThan(1.3);
  });
  it("même graine, même match", () => {
    const a = matchBots(9, "moyen", "difficile", 60), b = matchBots(9, "moyen", "difficile", 60);
    expect(JSON.stringify([a.m.etat.joueurs, a.m.etat.balle, a.m.etat.score])).toBe(JSON.stringify([b.m.etat.joueurs, b.m.etat.balle, b.m.etat.score]));
  });
});

describe("bots 3 contre 3", () => {
  it("4 minutes : passes réussies, combos possibles, buts, personne hors du terrain, pas de balle bloquée", () => {
    const m = creerMatch(21, 3, { butsPourGagner: 99, duree: 240 });
    const bots = m.etat.joueurs.map((_, i) => creerBot(i, "moyen", 300 + i));
    let passes = 0, buts = 0, fixe = 0, maxFixe = 0, bx = 0, by = 0, dehors = 0;
    const K = TERRAIN.demiL + TERRAIN.demiW - TERRAIN.pan - JOUEUR.rayon * Math.SQRT2 + 1e-6;
    for (let t = 0; t < 245 / DT && m.phase !== "fin"; t++) {
      pasMatch(m, bots.map((b) => b.decider(m.etat)));
      for (const ev of m.etat.evenements) if (ev.type === "passe") passes++;
      for (const ev of m.evenements) if (ev.type === "but") buts++;
      for (const j of m.etat.joueurs) if (Math.abs(j.x) + Math.abs(j.y) > K) dehors++;
      const b = m.etat.balle;
      if (m.phase === "jeu" && Math.hypot(b.x - bx, b.y - by) < 0.05) { fixe += DT; maxFixe = Math.max(maxFixe, fixe); } else { fixe = 0; bx = b.x; by = b.y; }
    }
    expect(passes).toBeGreaterThan(10);
    expect(buts).toBeGreaterThan(2);
    expect(dehors).toBe(0);
    expect(maxFixe).toBeLessThan(6);
  }, 60000);
});
