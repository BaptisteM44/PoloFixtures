import { describe, expect, it } from "vitest";
import { BALLE, DT, JOUEUR, PLOT, TERRAIN, TIR, forceDepuisDuree } from "./constantes";
import { creerEtat, creerJoueur, dansZoneTapIn, pas, pointMaillet } from "./pas";
import { COMMANDE_VIDE, type Commande, type Etat } from "./types";

const cmd = (p: Partial<Commande>): Commande => ({ ...COMMANDE_VIDE, ...p });
function rouler(e: Etat, c: Commande, secondes: number, autres: Commande[] = []) {
  const n = Math.round(secondes / DT);
  for (let i = 0; i < n; i++) pas(e, [c, ...autres]);
}
/** Place la balle à la tête du maillet du joueur 0, à l'arrêt. */
function balleAuMaillet(e: Etat) { const mp = pointMaillet(e.joueurs[0]); e.balle.x = mp.x; e.balle.y = mp.y; e.balle.vx = e.balle.vy = 0; }

describe("déplacement", () => {
  it("accélère jusqu'à la vitesse de pointe, pas au-delà", () => {
    const e = creerEtat(); e.balle.x = 15; e.balle.y = 8;
    rouler(e, cmd({ dx: 1 }), 3);
    expect(e.joueurs[0].v).toBeCloseTo(JOUEUR.vMax, 3);
    expect(e.joueurs[0].y).toBeCloseTo(0, 6);
  });
  it("freiner prend du temps et de la distance", () => {
    const e = creerEtat(); e.balle.y = 8; e.joueurs[0].x = -15;
    rouler(e, cmd({ dx: 1 }), 3);
    const x0 = e.joueurs[0].x; let t = 0;
    while (e.joueurs[0].v > 0 && t < 5) { pas(e, [cmd({ dx: 1, frein: true })]); t += DT; }
    expect(t).toBeGreaterThan(0.6); expect(t).toBeLessThan(1.2);
    expect(e.joueurs[0].x - x0).toBeGreaterThan(1.8); expect(e.joueurs[0].x - x0).toBeLessThan(3.2);
  });
  it("pivote presque sur place à basse vitesse", () => {
    const e = creerEtat(); e.balle.y = 8;
    rouler(e, cmd({ dx: 0, dy: 1 }), 0.5);
    expect(Math.abs(e.joueurs[0].cap - Math.PI / 2)).toBeLessThan(0.05);
    expect(Math.hypot(e.joueurs[0].x + 6, e.joueurs[0].y)).toBeLessThan(1.2);
  });
  it("bute contre la balustrade sans la traverser ni tomber", () => {
    const e = creerEtat(); e.balle.y = 8;
    rouler(e, cmd({ dx: 1, dy: 0.01 }), 4); rouler(e, cmd({ dy: 1 }), 6);
    const j = e.joueurs[0];
    expect(j.y).toBeLessThanOrEqual(TERRAIN.demiW - JOUEUR.rayon + 1e-9);
    expect(j.etat).toBe("actif");
  });
});

describe("chute, hors jeu et tap-in", () => {
  it("demi-tour à pleine vitesse sans freiner : pas de chute pour l'instant (chuteVirage désactivée)", () => {
    const e = creerEtat(); e.balle.y = 8; e.joueurs[0].x = -15;
    rouler(e, cmd({ dx: 1 }), 3);
    rouler(e, cmd({ dx: -1 }), 2);
    expect(e.joueurs[0].etat).toBe("actif");
    expect(Math.cos(e.joueurs[0].cap)).toBeLessThan(-0.9);
  });
  it("le même demi-tour en freinant d'abord ne fait pas tomber", () => {
    const e = creerEtat(); e.balle.y = 8; e.joueurs[0].x = -15;
    rouler(e, cmd({ dx: 1 }), 3);
    rouler(e, cmd({ dx: 1, frein: true }), 0.5);
    rouler(e, cmd({ dx: -1 }), 2);
    expect(e.joueurs[0].etat).toBe("actif");
    expect(Math.cos(e.joueurs[0].cap)).toBeLessThan(-0.9);
  });
  it("un virage à 90° à pleine vitesse est large mais ne fait pas tomber", () => {
    const e = creerEtat(); e.balle.x = 15; e.balle.y = -8; e.joueurs[0].x = -15;
    rouler(e, cmd({ dx: 1 }), 3);
    const x0 = e.joueurs[0].x;
    rouler(e, cmd({ dy: 1 }), 1.5);
    expect(e.joueurs[0].etat).toBe("actif");
    expect(e.joueurs[0].x - x0).toBeGreaterThan(1.5); // le virage prend de la place
  });
  it("hors jeu : ne capture pas la balle, revient en tapant la balustrade au milieu", () => {
    const e = creerEtat(); const j = e.joueurs[0];
    j.etat = "horsJeu"; balleAuMaillet(e);
    rouler(e, cmd({ dx: 1 }), 0.5);
    expect(j.aLaBalle).toBe(false);
    // Un bord loin du milieu ne suffit pas
    j.x = 8; j.y = TERRAIN.demiW - JOUEUR.rayon; j.v = 0;
    rouler(e, cmd({}), 0.2);
    expect(j.etat).toBe("horsJeu");
    j.x = 0.3; j.y = -(TERRAIN.demiW - JOUEUR.rayon);
    expect(dansZoneTapIn(j)).toBe(true);
    pas(e, [cmd({})]);
    expect(j.etat).toBe("actif");
    expect(e.evenements.some((v) => v.type === "tapIn")).toBe(true);
  });
});

describe("balle, aimantation, tir", () => {
  it("la balle reste au maillet quand on roule avec", () => {
    const e = creerEtat(); balleAuMaillet(e);
    rouler(e, cmd({ dx: 1 }), 2);
    const mp = pointMaillet(e.joueurs[0]);
    expect(e.joueurs[0].aLaBalle).toBe(true);
    expect(Math.hypot(e.balle.x - mp.x, e.balle.y - mp.y)).toBeLessThan(0.5);
  });
  it("la balle se décroche sur un freinage fort", () => {
    const e = creerEtat(); e.joueurs[0].x = -15; balleAuMaillet(e);
    rouler(e, cmd({ dx: 1 }), 2.5);
    expect(e.joueurs[0].aLaBalle).toBe(true);
    rouler(e, cmd({ dx: 1, frein: true }), 0.3);
    expect(e.joueurs[0].aLaBalle).toBe(false);
    expect(e.balle.x).toBeGreaterThan(pointMaillet(e.joueurs[0]).x);
  });
  it("un tir fort vers la cage marque un but", () => {
    const e = creerEtat(); e.joueurs[0].x = 9; balleAuMaillet(e);
    pas(e, [cmd({ tir: 1, viseX: TERRAIN.ligneBut + 0.4, viseY: 0 })]);
    expect(e.evenements.some((v) => v.type === "tir")).toBe(true);
    let but = false;
    for (let i = 0; i < 120; i++) { pas(e, [cmd({})]); if (e.evenements.some((v) => v.type === "but")) but = true; }
    expect(but).toBe(true);
    expect(e.score).toEqual([1, 0]);
    rouler(e, cmd({}), BALLE.remiseEnJeu + 0.1);
    expect(e.balle.dansBut).toBe(0); expect(e.balle.x).toBe(0);
  });
  it("une balle poussée en conduite dans la cage ne compte pas (EHBA 5.6.1.1)", () => {
    const e = creerEtat(); e.joueurs[0].x = 12; e.joueurs[0].y = -0.45; balleAuMaillet(e);
    let refuse = false;
    for (let i = 0; i < 300; i++) { pas(e, [cmd({ dx: 1 })]); if (e.evenements.some((v) => v.type === "butRefuse")) refuse = true; }
    expect(refuse).toBe(true);
    expect(e.score).toEqual([0, 0]);
  });
  it("la jauge est continue : plus on appuie longtemps, plus la balle part vite et va loin", () => {
    const portee = (f: number) => { const e = creerEtat(); balleAuMaillet(e); const x0 = e.balle.x; pas(e, [cmd({ tir: f, viseX: x0 + 30, viseY: e.balle.y })]); const v = Math.hypot(e.balle.vx, e.balle.vy); rouler(e, cmd({}), 0.5); return { v, d: e.balle.x - x0 }; }; // distance parcourue en 0,5 s, avant tout rebond
    const a = portee(0.15), b = portee(0.5), c = portee(1);
    expect(a.v).toBeLessThan(b.v); expect(b.v).toBeLessThan(c.v);
    expect(a.d).toBeLessThan(b.d);
    expect(forceDepuisDuree(0)).toBeGreaterThan(0); expect(forceDepuisDuree(0.55)).toBeCloseTo(0.5, 1); expect(forceDepuisDuree(5)).toBe(1);
  });
  it("seul un tir fort lève la balle", () => {
    const hauteur = (f: number) => { const e = creerEtat(); balleAuMaillet(e); pas(e, [cmd({ tir: f, viseX: 10, viseY: 0 })]); return e.balle.vz; };
    expect(hauteur(0.2)).toBeLessThan(0.2); expect(hauteur(1)).toBeGreaterThan(3);
  });
  it("frapper sans balle à portée ne fait rien", () => {
    const e = creerEtat(); e.balle.x = 10;
    pas(e, [cmd({ tir: 0.5, viseX: 15, viseY: 0 })]);
    expect(e.evenements.some((v) => v.type === "frappeDansLeVide")).toBe(true);
    expect(e.balle.vx).toBe(0);
  });
  it("la balle reste dans le terrain", () => {
    const e = creerEtat(7); e.joueurs[0].x = -18; e.joueurs[0].y = -8;
    for (let k = 0; k < 40; k++) {
      e.balle.dansBut = 0; e.remise = 0;
      const a = (k * 2.399) % (Math.PI * 2);
      e.balle.vx = Math.cos(a) * 20; e.balle.vy = Math.sin(a) * 20; e.balle.vz = 3;
      rouler(e, cmd({}), 3);
      expect(Math.abs(e.balle.x)).toBeLessThanOrEqual(TERRAIN.demiL);
      expect(Math.abs(e.balle.y)).toBeLessThanOrEqual(TERRAIN.demiW);
      expect(e.balle.z).toBeGreaterThanOrEqual(BALLE.rayon - 1e-9);
    }
  });
});

describe("collisions entre joueurs (V1)", () => {
  it("ralentissent les deux joueurs, personne ne tombe", () => {
    const e = creerEtat(1, [creerJoueur(0, 0, -5, 0, 0), creerJoueur(1, 1, 5, 0, Math.PI)]);
    e.balle.y = 8;
    let choc = false, vAvant = 0;
    for (let i = 0; i < 240; i++) {
      const v = e.joueurs[0].v;
      pas(e, [cmd({ dx: 1 }), cmd({ dx: -1 })]);
      if (!choc && e.evenements.some((x) => x.type === "collision")) { choc = true; vAvant = v; expect(e.joueurs[0].v).toBeLessThan(vAvant * 0.7); }
    }
    expect(choc).toBe(true);
    expect(e.joueurs.every((j) => j.etat === "actif")).toBe(true);
    expect(Math.hypot(e.joueurs[1].x - e.joueurs[0].x, e.joueurs[1].y - e.joueurs[0].y)).toBeGreaterThanOrEqual(JOUEUR.rayon * 2 - 1e-6);
  });
});

describe("déterminisme et budget", () => {
  const script = (i: number): Commande => cmd({ dx: Math.cos(i / 37), dy: Math.sin(i / 53), frein: i % 211 < 12, tir: i % 97 === 0 ? 0.2 + (i % 5) * 0.2 : 0, viseX: 16, viseY: Math.sin(i) });
  it("mêmes commandes, même graine : même résultat", () => {
    const run = () => { const e = creerEtat(42); for (let i = 0; i < 3000; i++) pas(e, [script(i)]); return JSON.stringify([e.joueurs, e.balle, e.score]); };
    expect(run()).toBe(run());
  });
  it("un pas avec 6 joueurs et la balle coûte moins de 1 ms", () => {
    const js = [0, 1, 2, 3, 4, 5].map((i) => creerJoueur(i, (i % 2) as 0 | 1, -8 + i * 3, -4 + i * 1.5, i));
    const e = creerEtat(3, js); const N = 6000;
    const t0 = performance.now();
    for (let i = 0; i < N; i++) pas(e, js.map((_, k) => script(i + k * 17)));
    expect((performance.now() - t0) / N).toBeLessThan(1);
  });
});

describe("poteaux et plots", () => {
  it("une balle qui file sur un poteau rebondit et ne rentre pas", () => {
    const e = creerEtat(); e.joueurs[0].y = 8;
    const b = e.balle; b.x = TERRAIN.ligneBut - 3; b.y = TERRAIN.butDemiLargeur; b.vx = 12; b.vy = 0; b.dernierEstTir = true;
    let poteau = false;
    for (let i = 0; i < 90; i++) { pas(e, [cmd({})]); if (e.evenements.some((v) => v.type === "poteau")) poteau = true; }
    expect(poteau).toBe(true);
    expect(e.score).toEqual([0, 0]);
    expect(b.x).toBeLessThan(TERRAIN.ligneBut);
  });
  it("la balle rebondit sur un plot", () => {
    const e = creerEtat(1, undefined, [{ x: 5, y: 0 }]); e.joueurs[0].y = 8;
    const b = e.balle; b.x = 2; b.y = 0; b.vx = 8;
    let plot = false;
    for (let i = 0; i < 60; i++) { pas(e, [cmd({})]); if (e.evenements.some((v) => v.type === "plot")) plot = true; }
    expect(plot).toBe(true);
    expect(b.vx).toBeLessThan(0);
  });
  it("un joueur ne traverse pas un plot", () => {
    const e = creerEtat(1, undefined, [{ x: -3, y: 0 }]); e.balle.y = 8;
    rouler(e, cmd({ dx: 1 }), 3);
    const j = e.joueurs[0];
    expect(Math.hypot(j.x + 3, j.y)).toBeGreaterThanOrEqual(PLOT.rayonJoueur + PLOT.rayon - 1e-6);
  });
});

describe("vol de balle", () => {
  it("un adversaire qui passe son maillet sur la balle tenue la fait sauter", () => {
    const A = creerJoueur(0, 0, 0, 0, 0), B = creerJoueur(1, 1, 4, -3, Math.PI / 2);
    const e = creerEtat(1, [A, B]); balleAuMaillet(e);
    let vol = false;
    for (let i = 0; i < 180 && !vol; i++) {
      const mpB = pointMaillet(e.joueurs[1]);
      pas(e, [cmd({}), cmd({ dx: e.balle.x - mpB.x, dy: e.balle.y - mpB.y })]);
      if (e.evenements.some((v) => v.type === "vol")) vol = true;
    }
    expect(vol).toBe(true);
    expect(e.joueurs[0].aLaBalle).toBe(false);
  });
});

describe("la balle et les vélos", () => {
  it("un vélo en travers arrête un tir", () => {
    const e = creerEtat(1, [creerJoueur(0, 0, -10, 8, 0), creerJoueur(1, 1, 5, 0, Math.PI / 2)]);
    const b = e.balle; b.x = 0; b.y = 0; b.vx = 12; b.dernierEstTir = true;
    let corps = false;
    for (let i = 0; i < 60; i++) { pas(e, [cmd({}), cmd({})]); if (e.evenements.some((v) => v.type === "corps")) corps = true; }
    expect(corps).toBe(true);
    expect(b.x).toBeLessThan(5);
  });
});

describe("pans coupés, filet, passes et combos (M2)", () => {
  const K = TERRAIN.demiL + TERRAIN.demiW - TERRAIN.pan;
  it("un joueur qui fonce dans un coin reste contre le pan coupé", () => {
    const e = creerEtat(); e.balle.x = -15; const j = e.joueurs[0]; j.x = 14; j.y = 5; j.cap = Math.atan2(1, 1);
    rouler(e, cmd({ dx: 1, dy: 1 }), 4);
    expect(Math.abs(j.x) + Math.abs(j.y)).toBeLessThanOrEqual(K - JOUEUR.rayon * Math.SQRT2 + 1e-6);
  });
  it("la balle rebondit sur le pan coupé", () => {
    const e = creerEtat(); e.joueurs[0].x = -15; const b = e.balle; b.x = 17; b.y = 7; b.vx = 8; b.vy = 8;
    rouler(e, cmd({}), 1);
    expect(Math.abs(b.x) + Math.abs(b.y)).toBeLessThanOrEqual(K + 1e-6);
    expect(b.vx + b.vy).toBeLessThan(0);
  });
  it("un tir dans la cage reste dans le filet", () => {
    const e = creerEtat(); e.joueurs[0].x = 10; e.joueurs[0].y = -0.45; e.joueurs[0].cap = 0; balleAuMaillet(e);
    pas(e, [cmd({ tir: 1, viseX: 16, viseY: 0 })]);
    rouler(e, cmd({}), 2);
    expect(e.balle.dansBut).toBe(1);
    expect(Math.abs(e.balle.x)).toBeLessThan(TERRAIN.ligneBut + TERRAIN.butProfondeur);
    expect(Math.abs(e.balle.y)).toBeLessThan(TERRAIN.butDemiLargeur);
  });
  it("une passe vers un coéquipier est reçue, et le triangle donne +50 % au tir", () => {
    const js = [creerJoueur(0, 0, -8, -0.45, 0), creerJoueur(1, 0, -2, 4, 0), creerJoueur(2, 0, 2, -3, 0)];
    const e = creerEtat(3, js); e.balle.x = 0; e.balle.y = 9;
    const passer = (de: number, vers: number) => {
      const d = e.joueurs[de], mp = pointMaillet(d); e.balle.x = mp.x; e.balle.y = mp.y; e.balle.vx = e.balle.vy = 0; d.aLaBalle = false; d.pauseAimant = 0;
      pas(e, [cmd({}), cmd({}), cmd({})]); expect(d.aLaBalle).toBe(true);
      const r = e.joueurs[vers], cible = pointMaillet(r), cmds = [cmd({}), cmd({}), cmd({})];
      cmds[de] = cmd({ tir: 0.5, viseX: cible.x, viseY: cible.y, passe: r.id });
      pas(e, cmds);
      let recu = false; for (let i = 0; i < 180 && !recu; i++) { pas(e, [cmd({}), cmd({}), cmd({})]); recu = r.aLaBalle; }
      expect(recu).toBe(true);
    };
    passer(0, 1); passer(1, 2);
    expect(e.combo.passes).toBe(2);
    expect(new Set(e.combo.joueurs).size).toBe(3);
    const j2 = e.joueurs[2]; j2.cap = 0;
    const mp = pointMaillet(j2); e.balle.x = mp.x; e.balle.y = mp.y; e.balle.vx = e.balle.vy = 0;
    pas(e, [cmd({}), cmd({}), cmd({ tir: 0.5, viseX: 16, viseY: 0 })]);
    expect(e.evenements.some((v) => v.type === "tirCombo" && v.triangle && v.bonus === 1.5)).toBe(true);
    const vSansBonus = TIR.vitesseMin + (TIR.vitesseMax - TIR.vitesseMin) * 0.5;
    expect(Math.hypot(e.balle.vx, e.balle.vy)).toBeCloseTo(vSansBonus * 1.5, 1);
  });
});
