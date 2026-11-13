/**
 * Simulation du jeu : une fonction `pas` qui fait avancer l'état d'un pas fixe (DT).
 * TypeScript pur : aucun import de three.js, de React ou du DOM, aucun hasard non contrôlé.
 * `pas` modifie l'état reçu et le renvoie (pas d'allocation à chaque pas).
 */
import { BALLE, DT, JOUEUR, MAILLET, PASSE, PLOT, TERRAIN, TIR } from "./constantes";
import type { Balle, Combo, Commande, Etat, Evenement, Joueur } from "./types";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const normAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Générateur déterministe (mulberry32). Fait avancer `e.graine`, renvoie un nombre dans [0, 1). */
export function alea(e: Etat): number {
  e.graine = (e.graine + 0x6d2b79f5) | 0;
  let t = Math.imul(e.graine ^ (e.graine >>> 15), 1 | e.graine);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function creerJoueur(id: number, equipe: 0 | 1, x: number, y: number, cap: number): Joueur {
  return { id, equipe, x, y, cap, v: 0, etat: "actif", tEtat: 0, risque: 0, rot: 0, freine: false, aLaBalle: false, pauseAimant: 0, pauseCollision: 0, tFrappe: 99, forceFrappe: 0 };
}

export function creerEtat(graine = 1, joueurs?: Joueur[], plots: { x: number; y: number }[] = []): Etat {
  return {
    t: 0,
    graine,
    joueurs: joueurs ?? [creerJoueur(0, 0, -6, 0, 0)],
    balle: { x: 0, y: 0, z: BALLE.rayon, vx: 0, vy: 0, vz: 0, dernierJoueur: null, dernierEstTir: false, dansBut: 0 },
    plots: plots.map((p) => ({ x: p.x, y: p.y })),
    score: [0, 0],
    remise: 0,
    evenements: [],
    combo: { equipe: -1, passes: 0, joueurs: [], t: 0 },
  };
}

/** Remet la série de passes à zéro (perte de balle, but, arrêt de jeu). */
export function casserCombo(c: Combo) { c.equipe = -1; c.passes = 0; c.joueurs.length = 0; c.t = 0; }

/** Bonus de vitesse que vaudrait un tir maintenant pour ce joueur (1 = aucun). */
export function bonusCombo(e: Etat, j: Joueur): { bonus: number; triangle: boolean } {
  const c = e.combo;
  if (c.equipe !== j.equipe || c.passes < 2 || !c.joueurs.includes(j.id)) return { bonus: 1, triangle: false };
  const triangle = new Set(c.joueurs).size >= 3;
  return { bonus: triangle ? PASSE.bonusTriangle : PASSE.bonusUneDeux, triangle };
}

/** Constante des pans coupés : un point (x, y) est dans le terrain si |x| + |y| <= K. */
const K_PAN = TERRAIN.demiL + TERRAIN.demiW - TERRAIN.pan;
/** Distance (positive = dehors) d'un point au pan coupé du coin le plus proche, et normale vers l'intérieur. */
export function horsPan(x: number, y: number, marge: number): { d: number; nx: number; ny: number } {
  const sx = x >= 0 ? 1 : -1, sy = y >= 0 ? 1 : -1;
  const d = (Math.abs(x) + Math.abs(y) - K_PAN) / Math.SQRT2 + marge;
  return { d, nx: -sx / Math.SQRT2, ny: -sy / Math.SQRT2 };
}

/** Position de la tête du maillet : devant le joueur, à sa droite. */
export function pointMaillet(j: Joueur): { x: number; y: number } {
  const c = Math.cos(j.cap), s = Math.sin(j.cap);
  return { x: j.x + c * MAILLET.avant - s * MAILLET.cote, y: j.y + s * MAILLET.avant + c * MAILLET.cote };
}

/** Vrai si le joueur est assez près de la balustrade, au milieu d'un grand côté, pour y taper son maillet. */
export function dansZoneTapIn(j: Joueur): boolean {
  return Math.abs(j.x) <= TERRAIN.tapInDemi + 0.25 && TERRAIN.demiW - Math.abs(j.y) <= TERRAIN.tapInPortee;
}

function tomber(j: Joueur, ev: Evenement[]) {
  j.etat = "auSol"; j.tEtat = 0; j.risque = 0; j.aLaBalle = false; j.pauseAimant = BALLE.aimantPause;
  ev.push({ type: "chute", joueur: j.id });
}

function pasJoueur(j: Joueur, c: Commande, ev: Evenement[], plots: { x: number; y: number }[]) {
  const dt = DT;
  j.tEtat += dt; j.tFrappe += dt;
  j.pauseAimant = Math.max(0, j.pauseAimant - dt);
  j.pauseCollision = Math.max(0, j.pauseCollision - dt);
  j.freine = false; j.rot = 0;

  if (j.etat === "auSol") {
    // Le joueur glisse puis se relève : il est alors hors jeu jusqu'au tap-in.
    j.v = Math.max(0, j.v - 9 * dt);
    if (j.tEtat >= JOUEUR.dureeAuSol) { j.etat = "horsJeu"; j.tEtat = 0; }
  } else {
    const m = Math.min(1, Math.hypot(c.dx, c.dy));
    j.freine = c.frein;
    if (m > 0.05) {
      const ecart = normAngle(Math.atan2(c.dy, c.dx) - j.cap), absEcart = Math.abs(ecart);
      // Chute : à pleine vitesse, demander un changement de direction brutal sans freiner.
      const tropVite = j.v > JOUEUR.chuteVitesse * JOUEUR.vMax;
      if (JOUEUR.chuteVirage && tropVite && !c.frein && absEcart > JOUEUR.chuteAngle) j.risque += dt / JOUEUR.chuteDelai;
      else j.risque = Math.max(0, j.risque - dt * 3);
      // Le vélo tourne vers la direction voulue : vite à basse vitesse, large à haute vitesse.
      const rotMax = Math.min(JOUEUR.rotLente, JOUEUR.aLatMax / Math.max(j.v, 0.5));
      j.rot = clamp(ecart * 8, -rotMax, rotMax);
      j.cap = normAngle(j.cap + j.rot * dt);
      const aligne = Math.max(0, Math.cos(ecart));
      const cible = c.frein ? 0 : JOUEUR.vMax * m * (0.35 + 0.65 * aligne);
      if (j.v < cible) j.v = Math.min(cible, j.v + JOUEUR.acc * dt);
      else j.v = Math.max(cible, j.v - (c.frein ? JOUEUR.frein : JOUEUR.roueLibre + (1 - aligne) * JOUEUR.freinVirage) * dt);
    } else {
      j.risque = Math.max(0, j.risque - dt * 3);
      j.v = Math.max(0, j.v - (c.frein ? JOUEUR.frein : JOUEUR.roueLibre) * dt);
    }
    if (j.etat === "actif" && j.risque >= 1) tomber(j, ev);
  }

  const cx = Math.cos(j.cap), sy = Math.sin(j.cap);
  j.x += cx * j.v * dt; j.y += sy * j.v * dt;

  // Balustrade : on bute dessus, on frotte, on ne tombe pas (V1).
  const lx = TERRAIN.demiL - JOUEUR.rayon, ly = TERRAIN.demiW - JOUEUR.rayon;
  let pousse = 0;
  if (j.x > lx) { j.x = lx; pousse = Math.max(pousse, cx); } else if (j.x < -lx) { j.x = -lx; pousse = Math.max(pousse, -cx); }
  if (j.y > ly) { j.y = ly; pousse = Math.max(pousse, sy); } else if (j.y < -ly) { j.y = -ly; pousse = Math.max(pousse, -sy); }
  { // Pans coupés dans les coins
    const p = horsPan(j.x, j.y, JOUEUR.rayon);
    if (p.d > 0) { j.x += p.nx * p.d; j.y += p.ny * p.d; pousse = Math.max(pousse, -(cx * p.nx + sy * p.ny)); }
  }
  if (pousse > 0) j.v = Math.max(0, j.v - pousse * JOUEUR.frottementBalustrade * dt);

  // Cages : obstacles pleins pour les joueurs.
  for (const cote of [1, -1] as const) {
    const x0 = TERRAIN.ligneBut, x1 = TERRAIN.ligneBut + TERRAIN.butProfondeur, w = TERRAIN.butDemiLargeur + 0.05;
    const px = j.x * cote;
    const nx = clamp(px, x0, x1), ny = clamp(j.y, -w, w);
    const ddx = px - nx, ddy = j.y - ny, d = Math.hypot(ddx, ddy);
    if (d < JOUEUR.rayon) {
      if (d > 1e-6) { j.x = (nx + (ddx / d) * JOUEUR.rayon) * cote; j.y = ny + (ddy / d) * JOUEUR.rayon; }
      else j.x = (x0 - JOUEUR.rayon) * cote;
      j.v = Math.max(0, j.v - 6 * dt);
    }
  }

  // Plots : on les contourne, on ne passe pas au travers.
  for (const p of plots) {
    const dx = j.x - p.x, dy = j.y - p.y, d = Math.hypot(dx, dy), min = PLOT.rayonJoueur + PLOT.rayon;
    if (d >= min || d < 1e-6) continue;
    j.x = p.x + (dx / d) * min; j.y = p.y + (dy / d) * min;
    const face = Math.max(0, -(Math.cos(j.cap) * dx + Math.sin(j.cap) * dy) / d);
    j.v = Math.max(0, j.v - face * 10 * dt);
  }

  // Retour en jeu : taper la balustrade au milieu d'un grand côté (EHBA 6.2.1.7).
  if (j.etat === "horsJeu" && dansZoneTapIn(j)) { j.etat = "actif"; j.tEtat = 0; ev.push({ type: "tapIn", joueur: j.id }); }
}

/** Après une bousculade : personne ne passe à travers la balustrade ni les pans coupés. */
function garderDansTerrain(j: Joueur) {
  const lx = TERRAIN.demiL - JOUEUR.rayon, ly = TERRAIN.demiW - JOUEUR.rayon;
  j.x = clamp(j.x, -lx, lx); j.y = clamp(j.y, -ly, ly);
  const p = horsPan(j.x, j.y, JOUEUR.rayon); if (p.d > 0) { j.x += p.nx * p.d; j.y += p.ny * p.d; }
}

function collisionsJoueurs(e: Etat) {
  const js = e.joueurs;
  for (let a = 0; a < js.length; a++) for (let b = a + 1; b < js.length; b++) {
    const A = js[a], B = js[b];
    let dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy);
    if (d >= JOUEUR.rayon * 2) continue;
    if (d < 1e-6) { dx = 1; dy = 0; d = 1; }
    const k = (JOUEUR.rayon * 2 - d) / 2;
    A.x -= (dx / d) * k; A.y -= (dy / d) * k; B.x += (dx / d) * k; B.y += (dy / d) * k;
    garderDansTerrain(A); garderDansTerrain(B);
    // V1 : une collision ralentit les deux joueurs, personne ne tombe.
    if (A.pauseCollision <= 0 || B.pauseCollision <= 0) {
      A.v *= JOUEUR.ralentiCollision; B.v *= JOUEUR.ralentiCollision;
      A.pauseCollision = B.pauseCollision = JOUEUR.pauseCollision;
      // Le porteur garde la balle dans un simple contact (c'est le duel au maillet qui peut la lui prendre)
      if (!A.aLaBalle) A.pauseAimant = Math.max(A.pauseAimant, 0.25);
      if (!B.aLaBalle) B.pauseAimant = Math.max(B.pauseAimant, 0.25);
      e.evenements.push({ type: "collision", a: A.id, b: B.id });
    }
  }
}

function frapper(e: Etat, j: Joueur, c: Commande) {
  const b = e.balle;
  j.tFrappe = 0; j.forceFrappe = c.tir;
  const mp = pointMaillet(j);
  const aPortee = b.dansBut === 0 && b.z <= MAILLET.hauteurMax && Math.hypot(b.x - mp.x, b.y - mp.y) <= MAILLET.portee;
  if (!aPortee) { e.evenements.push({ type: "frappeDansLeVide", joueur: j.id }); return; }
  const dx = c.viseX - b.x, dy = c.viseY - b.y, dist = Math.hypot(dx, dy);
  const f = clamp(c.tir, 0, 1), f2 = f * f;
  const angle = (dist > 0.05 ? Math.atan2(dy, dx) : j.cap) + (alea(e) * 2 - 1) * TIR.erreurMax * f2;
  let v = TIR.vitesseMin + (TIR.vitesseMax - TIR.vitesseMin) * f, vz = TIR.leverMax * f2, ang = angle;
  const recepteur = c.passe != null ? e.joueurs.find((o) => o.id === c.passe && o.equipe === j.equipe && o.id !== j.id) : undefined;
  if (recepteur) {
    // Passe : vitesse adaptée à la distance, au ras du sol, sans erreur d'angle
    v = Math.min(PASSE.vitesseMax, Math.max(v * 0.6, PASSE.vitesseBase + dist * PASSE.vitesseParMetre)); vz = 0;
    ang = dist > 0.05 ? Math.atan2(dy, dx) : j.cap;
  } else {
    // Tir vers la cage adverse après une série de passes : bonus de puissance et de précision
    const s = j.equipe === 0 ? 1 : -1, gx = s * TERRAIN.ligneBut;
    const versBut = Math.abs(normAngle(Math.atan2(-b.y, gx - b.x) - ang)) < 0.4 && (gx - b.x) * s > 0;
    const { bonus, triangle } = bonusCombo(e, j);
    if (bonus > 1 && versBut) {
      v = Math.min(PASSE.vitesseTirMax, v * bonus); ang = dist > 0.05 ? Math.atan2(dy, dx) : j.cap;
      e.evenements.push({ type: "tirCombo", joueur: j.id, bonus, triangle });
      casserCombo(e.combo);
    }
  }
  b.vx = Math.cos(ang) * v; b.vy = Math.sin(ang) * v; b.vz = vz;
  b.dernierJoueur = j.id; b.dernierEstTir = true; // frappe avec le bout du maillet (EHBA 4.2.1)
  j.aLaBalle = false; j.pauseAimant = BALLE.aimantPause;
  if (e.combo.equipe === j.equipe) e.combo.t = 0;
  e.evenements.push({ type: "tir", joueur: j.id, force: c.tir });
}

function aimanter(e: Etat) {
  const b = e.balle;
  // Vol de balle : un adversaire qui passe son maillet sur la balle tenue la fait sauter du maillet du porteur.
  const tenant = e.joueurs.find((j) => j.aLaBalle);
  if (tenant && b.dansBut === 0) {
    for (const o of e.joueurs) {
      if (o === tenant || o.equipe === tenant.equipe || o.etat !== "actif") continue;
      if (o.pauseAimant > 0.3) continue;
      const mp = pointMaillet(o), d = Math.hypot(b.x - mp.x, b.y - mp.y);
      if (d >= BALLE.volDistance) continue;
      // Duel : chance de récupérer à chaque instant, plus forte si on arrive vite et tout près ; un porteur lancé protège mieux.
      const vrel = Math.hypot(Math.cos(o.cap) * o.v - Math.cos(tenant.cap) * tenant.v, Math.sin(o.cap) * o.v - Math.sin(tenant.cap) * tenant.v);
      const proche = 1 - d / BALLE.volDistance;
      const taux = BALLE.volTaux * (0.5 + proche) * (1 + vrel / BALLE.volVitesse) / (1 + tenant.v / JOUEUR.vMax);
      if (alea(e) < taux * DT) {
        // La balle passe au maillet de celui qui la récupère
        const v = Math.max(1, o.v);
        b.vx = Math.cos(o.cap) * v; b.vy = Math.sin(o.cap) * v; b.x = mp.x; b.y = mp.y; b.dernierJoueur = o.id; b.dernierEstTir = false;
        tenant.aLaBalle = false; tenant.pauseAimant = 0.6; o.pauseAimant = 0;
        casserCombo(e.combo);
        e.evenements.push({ type: "vol", joueur: o.id, victime: tenant.id });
        break;
      }
    }
  }
  let porteur: Joueur | null = null, meilleure = Infinity;
  const avant = e.joueurs.find((j) => j.aLaBalle) ?? null;
  const passeur = b.dernierEstTir && b.dernierJoueur !== null ? e.joueurs.find((o) => o.id === b.dernierJoueur) ?? null : null;
  const vb = Math.hypot(b.vx, b.vy);
  if (b.dansBut === 0 && b.z <= 0.3) {
    for (const j of e.joueurs) {
      if (j.etat !== "actif" || j.pauseAimant > 0) continue; // un joueur hors jeu ne joue pas la balle (EHBA 6.2.1.5)
      const mp = pointMaillet(j), d = Math.hypot(b.x - mp.x, b.y - mp.y);
      const vjx = Math.cos(j.cap) * j.v, vjy = Math.sin(j.cap) * j.v, vrel = Math.hypot(b.vx - vjx, b.vy - vjy);
      // Passe d'un coéquipier : capture large ; balle libre lente : récupération facile ; sinon aimant normal
      const passe = !!passeur && passeur.equipe === j.equipe && passeur.id !== j.id && j !== avant;
      // Le porteur garde la balle tant qu'elle est dans le plus grand rayon (sinon une balle prise de loin lui échapperait aussitôt)
      const rayon = passe || j === avant ? BALLE.aimantRayonPasse : vb < BALLE.aimantVitesseLibre && !avant ? BALLE.aimantRayonLibre : BALLE.aimantRayon;
      const vmax = passe || j === avant ? BALLE.aimantVRelMaxPasse : BALLE.aimantVRelMax;
      // Le porteur garde la priorité ; sinon, le maillet le plus proche
      const score = j === avant ? d - 0.3 : d;
      if (d < rayon && score < meilleure && vrel < vmax) { porteur = j; meilleure = score; }
    }
  }
  for (const j of e.joueurs) j.aLaBalle = j === porteur;
  if (!porteur) return;
  if (porteur !== avant) {
    // Nouvelle prise de balle : passe réussie, ou balle récupérée par l'autre équipe
    const c = e.combo;
    if (passeur && passeur.equipe === porteur.equipe && passeur.id !== porteur.id) {
      if (c.equipe !== porteur.equipe) { casserCombo(c); c.equipe = porteur.equipe; c.joueurs.push(passeur.id); }
      c.passes++; c.joueurs.push(porteur.id); c.t = 0;
      e.evenements.push({ type: "passe", joueur: passeur.id, recepteur: porteur.id, passes: c.passes, triangle: new Set(c.joueurs).size >= 3 });
    } else if (c.equipe !== porteur.equipe) { casserCombo(c); c.equipe = porteur.equipe; c.joueurs.push(porteur.id); }
  }
  const j = porteur, vjx = Math.cos(j.cap) * j.v, vjy = Math.sin(j.cap) * j.v;
  // La balle se décroche si on tourne trop sec ou si on freine fort : elle continue tout droit.
  const decroche = (Math.abs(j.rot) > BALLE.decrocheRot && j.v > BALLE.decrocheVitesse) || (j.freine && j.v > BALLE.decrocheFrein);
  if (decroche) { j.aLaBalle = false; j.pauseAimant = BALLE.aimantPause; return; }
  const mp = pointMaillet(j), k = 1 - Math.exp(-DT * BALLE.aimantRaideur);
  b.vx += (vjx + (mp.x - b.x) * 6 - b.vx) * k; b.vy += (vjy + (mp.y - b.y) * 6 - b.vy) * k;
  b.vz = 0; b.z = BALLE.rayon;
  b.dernierJoueur = j.id; b.dernierEstTir = false; // conduite au côté du maillet : pas un tir (EHBA 4.3)
}

function pasBalle(e: Etat, dt: number) {
  const b = e.balle, r = BALLE.rayon, ev = e.evenements;
  if (b.dansBut !== 0) {
    // Dans la cage : le filet arrête la balle, elle ne ressort pas
    const k = Math.exp(-dt * 9); b.vx *= k; b.vy *= k; b.vz = 0;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z = Math.max(r, b.z - 2 * dt);
    const x0 = TERRAIN.ligneBut + r, x1 = TERRAIN.ligneBut + TERRAIN.butProfondeur * Math.max(0.15, 1 - b.z / TERRAIN.butHauteur) - r, w = TERRAIN.butDemiLargeur - r;
    const ax = b.x * b.dansBut;
    if (ax > x1) { b.x = x1 * b.dansBut; b.vx *= -0.15; } else if (ax < x0) { b.x = x0 * b.dansBut; b.vx *= -0.15; }
    if (Math.abs(b.y) > w) { b.y = Math.sign(b.y) * w; b.vy *= -0.15; }
    return;
  }
  const px = b.x, py = b.y;
  const auSol = b.z <= r + 1e-4 && Math.abs(b.vz) < 0.5;
  if (auSol) {
    b.z = r; b.vz = 0;
    const porte = e.joueurs.some((j) => j.aLaBalle);
    if (!porte) { const v = Math.hypot(b.vx, b.vy), d = BALLE.frottement * dt; if (v <= d) { b.vx = 0; b.vy = 0; } else { b.vx -= (b.vx / v) * d; b.vy -= (b.vy / v) * d; } }
  } else {
    b.vz -= BALLE.gravite * dt;
  }
  b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
  if (b.z < r) { b.z = r; if (b.vz < -1) { b.vz = -b.vz * BALLE.rebondSol; b.vx *= 0.9; b.vy *= 0.9; } else b.vz = 0; }

  // Balustrade
  const lx = TERRAIN.demiL - r, ly = TERRAIN.demiW - r;
  if (b.x > lx || b.x < -lx) { const f = Math.abs(b.vx); b.x = clamp(b.x, -lx, lx); b.vx = -b.vx * BALLE.rebondMur; if (f > 2) ev.push({ type: "rebond", force: f }); }
  if (b.y > ly || b.y < -ly) { const f = Math.abs(b.vy); b.y = clamp(b.y, -ly, ly); b.vy = -b.vy * BALLE.rebondMur; if (f > 2) ev.push({ type: "rebond", force: f }); }
  { // Pans coupés : rebond sur la diagonale
    const p = horsPan(b.x, b.y, r);
    if (p.d > 0) {
      b.x += p.nx * p.d; b.y += p.ny * p.d;
      const vn = b.vx * p.nx + b.vy * p.ny;
      if (vn < 0) { b.vx -= (1 + BALLE.rebondMur) * vn * p.nx; b.vy -= (1 + BALLE.rebondMur) * vn * p.ny; if (-vn > 2) ev.push({ type: "rebond", force: -vn }); }
    }
  }

  // Plots et poteaux : petits cylindres sur lesquels la balle rebondit.
  const obstacle = (ox: number, oy: number, rayon: number, hauteur: number, type: "plot" | "poteau") => {
    if (b.z - r > hauteur) return;
    const dx = b.x - ox, dy = b.y - oy, d = Math.hypot(dx, dy), min = rayon + r;
    if (d >= min || d < 1e-6) return;
    const nx = dx / d, ny = dy / d, vn = b.vx * nx + b.vy * ny;
    b.x = ox + nx * min; b.y = oy + ny * min;
    if (vn >= 0) return;
    b.vx -= (1 + TERRAIN.rebondPoteau) * vn * nx; b.vy -= (1 + TERRAIN.rebondPoteau) * vn * ny;
    for (const j of e.joueurs) if (j.aLaBalle) { j.aLaBalle = false; j.pauseAimant = BALLE.aimantPause; }
    if (-vn > 0.8) ev.push({ type, force: -vn });
  };
  for (const p of e.plots) obstacle(p.x, p.y, PLOT.rayon, PLOT.hauteur, "plot");
  // Les vélos arrêtent la balle : c'est ce qui permet de défendre sa cage en se mettant en travers.
  if (b.z - r < JOUEUR.veloHauteur) for (const j of e.joueurs) {
    if (j.aLaBalle) continue;
    const c = Math.cos(j.cap), s = Math.sin(j.cap), L = JOUEUR.veloDemiLongueur;
    const t = Math.max(-L, Math.min(L, (b.x - j.x) * c + (b.y - j.y) * s));
    const qx = j.x + c * t, qy = j.y + s * t, dx = b.x - qx, dy = b.y - qy, d = Math.hypot(dx, dy), min = JOUEUR.veloEpaisseur + r;
    if (d >= min || d < 1e-6) continue;
    const nx = dx / d, ny = dy / d;
    b.x = qx + nx * min; b.y = qy + ny * min;
    const vjx = c * j.v, vjy = s * j.v, vn = (b.vx - vjx) * nx + (b.vy - vjy) * ny;
    if (vn < 0) {
      b.vx -= (1 + JOUEUR.veloRebond) * vn * nx; b.vy -= (1 + JOUEUR.veloRebond) * vn * ny;
      if (-vn > 1) ev.push({ type: "corps", joueur: j.id, force: -vn });
    }
  }
  for (const cote of [1, -1] as const) for (const s of [1, -1]) obstacle(TERRAIN.ligneBut * cote, TERRAIN.butDemiLargeur * s, TERRAIN.poteauRayon, TERRAIN.butHauteur, "poteau");

  // Cages
  for (const cote of [1, -1] as const) {
    const x0 = TERRAIN.ligneBut, x1 = x0 + TERRAIN.butProfondeur, w = TERRAIN.butDemiLargeur;
    const avant = px * cote, apres = b.x * cote;
    const dedans = apres > x0 && apres < x1 && Math.abs(b.y) < w && b.z < TERRAIN.butHauteur;
    if (!dedans) continue;
    const etaitDedans = avant > x0 && avant < x1 && Math.abs(py) < w;
    if (etaitDedans) continue;
    if (avant <= x0 && Math.abs(py) < w) {
      // La balle franchit la ligne de but par l'ouverture.
      b.dansBut = cote; e.remise = BALLE.remiseEnJeu;
      if (b.dernierEstTir) { // but valable seulement sur un tir (EHBA 5.6.1.1)
        e.score[cote === 1 ? 0 : 1]++;
        ev.push({ type: "but", camp: cote, joueur: b.dernierJoueur });
      } else ev.push({ type: "butRefuse", camp: cote });
    } else if (avant >= x1) { b.x = (x1 + r) * cote; b.vx = -b.vx * 0.4; }
    else { b.y = py > 0 ? w + r : -w - r; b.vy = -b.vy * 0.4; }
  }
}

/** Fait avancer la simulation d'un pas fixe (DT). `commandes[i]` s'applique à `e.joueurs[i]`. */
export function pas(e: Etat, commandes: Commande[]): Etat {
  e.evenements.length = 0;
  e.t += DT;
  for (let i = 0; i < e.joueurs.length; i++) {
    const c = commandes[i];
    if (c) pasJoueur(e.joueurs[i], c, e.evenements, e.plots);
  }
  collisionsJoueurs(e);
  for (let i = 0; i < e.joueurs.length; i++) {
    const c = commandes[i], j = e.joueurs[i];
    if (c && c.tir > 0 && j.etat === "actif") frapper(e, j, c);
  }
  aimanter(e);
  // La balle avance en petits sous-pas quand elle va vite : elle ne traverse ni un poteau, ni un vélo, ni le filet
  const vb = Math.hypot(e.balle.vx, e.balle.vy, e.balle.vz), n = Math.min(8, Math.max(1, Math.ceil((vb * DT) / 0.12)));
  for (let k = 0; k < n; k++) pasBalle(e, DT / n);
  // Série de passes : elle se casse si on garde la balle trop longtemps ou si la passe n'arrive pas
  if (e.combo.equipe !== -1) { e.combo.t += DT; if (e.combo.t > PASSE.fenetre || e.balle.dansBut !== 0) casserCombo(e.combo); }
  if (e.remise > 0) {
    e.remise -= DT;
    if (e.remise <= 0) remettreAuCentre(e.balle);
  }
  return e;
}

export function remettreAuCentre(b: Balle) {
  b.x = 0; b.y = 0; b.z = BALLE.rayon; b.vx = 0; b.vy = 0; b.vz = 0; b.dansBut = 0; b.dernierJoueur = null; b.dernierEstTir = false;
}
