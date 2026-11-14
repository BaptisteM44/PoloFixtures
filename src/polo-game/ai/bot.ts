/**
 * Bot de bike polo (jalons M1 et M2 : 1 contre 1 et 3 contre 3).
 * En équipe, chaque bot prend un rôle selon la situation (porteur, soutien, couverture, marquage),
 * fait des passes quand il est pressé ou qu'un coéquipier est mieux placé, et va au-devant des passes qu'on lui fait. Il lit l'état et produit les mêmes commandes qu'un joueur :
 * pas d'accès à ce qu'un humain ne peut pas faire. La difficulté joue sur le temps de réaction,
 * la vitesse, la précision et la portée de tir, pas sur des bonus cachés.
 */
import { BALLE, JOUEUR, MAILLET, PASSE, TERRAIN } from "../sim/constantes";
import { dansZoneTapIn, pointMaillet } from "../sim/pas";
import { couloirOuvert, placeRole, tableauEquipe } from "./tactique";
import type { Commande, Etat, Joueur } from "../sim/types";

export type Niveau = "facile" | "moyen" | "difficile";

export const NIVEAUX: Record<Niveau, { reaction: number; vitesse: number; erreurVisee: number; portee: number; agressivite: number; passe: number }> = {
  facile: { reaction: 0.4, vitesse: 0.78, erreurVisee: 1.4, portee: 9, agressivite: 0.35, passe: 0.25 },
  moyen: { reaction: 0.22, vitesse: 0.9, erreurVisee: 0.7, portee: 11, agressivite: 0.6, passe: 0.45 },
  difficile: { reaction: 0.1, vitesse: 1, erreurVisee: 0.3, portee: 13, agressivite: 0.85, passe: 0.6 },
};

type Mode = "balle" | "conduite" | "defense" | "tapIn" | "soutien" | "reception";

/** Distance d'un point au segment [a, b]. */
function distSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1, t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l2));
  return Math.hypot(px - ax - vx * t, py - ay - vy * t);
}

export interface Bot { decider(e: Etat): Commande }

const norm = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Si la ligne droite vers la cible traverse une cage, renvoie le prochain point de passage pour en faire le tour (par devant ou par derrière, au plus court). */
function contournerCages(px: number, py: number, tx: number, ty: number): { x: number; y: number } {
  const W = TERRAIN.butDemiLargeur + 0.9;
  for (const cote of [1, -1]) {
    const xa = cote * TERRAIN.ligneBut, xb = cote * (TERRAIN.ligneBut + TERRAIN.butProfondeur);
    const x0 = Math.min(xa, xb) - 0.9, x1 = Math.max(xa, xb) + 0.9;
    const dedans = (x: number, y: number) => x > x0 && x < x1 && Math.abs(y) < W;
    if (dedans(px, py)) continue;
    let coupe = false;
    for (let k = 1; k <= 16 && !coupe; k++) { const t = k / 16; if (dedans(px + (tx - px) * t, py + (ty - py) * t)) coupe = true; }
    if (!coupe) continue;
    const sp = py >= 0 ? 1 : -1, st = ty >= 0 ? 1 : -1, Wc = W + 0.15;
    let meilleur: { x: number; y: number }[] = [], lmin = Infinity;
    for (const xs of [cote * (TERRAIN.ligneBut - 1.1), cote * (TERRAIN.ligneBut + TERRAIN.butProfondeur + 1.05)]) {
      const pts = sp === st ? [{ x: xs, y: sp * Wc }] : [{ x: xs, y: sp * Wc }, { x: xs, y: st * Wc }];
      let l = 0, ax = px, ay = py; for (const q of pts) { l += Math.hypot(q.x - ax, q.y - ay); ax = q.x; ay = q.y; } l += Math.hypot(tx - ax, ty - ay);
      if (l < lmin) { lmin = l; meilleur = pts; }
    }
    for (const q of meilleur) if (Math.hypot(q.x - px, q.y - py) > 0.7) return q;
    return meilleur[meilleur.length - 1];
  }
  return { x: tx, y: ty };
}

/** `index` : position du joueur contrôlé dans `etat.joueurs`. `graine` : hasard propre au bot (déterministe). */
export function creerBot(index: number, niveau: Niveau, graine = 1): Bot {
  const P = NIVEAUX[niveau];
  let g = graine | 0;
  const alea = () => { g = (g + 0x6d2b79f5) | 0; let t = Math.imul(g ^ (g >>> 15), 1 | g); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  // Décision « lente » (rafraîchie selon le temps de réaction) et pilotage « rapide » (à chaque pas)
  let prochaineDecision = 0;
  let cible = { x: 0, y: 0 }, mode: Mode = "balle";
  let tirPrevu: { x: number; y: number; force: number; passe?: number } | null = null;
  let tientDepuis = -1;
  let gardien = false;
  // Balle immobile depuis longtemps (coincée dans un recoin) : on change de méthode pour la sortir.
  let balleX = 0, balleY = 0, balleFixeDepuis = 0;
  let repere = { x: 0, y: 0, t: 0 };
  let viseeErreur = 0, prochaineFrappe = 0, bloque = 0, degagement = -1, degagementDir = { x: 1, y: 0 };

  return {
    decider(e) {
      const j = e.joueurs[index], b = e.balle;
      const s = j.equipe === 0 ? 1 : -1;
      const butAdverse = { x: s * TERRAIN.ligneBut, y: 0 }, monBut = { x: -s * TERRAIN.ligneBut, y: 0 };
      const adversaires = e.joueurs.filter((o) => o.equipe !== j.equipe);
      const porteurAdverse = adversaires.find((o) => o.aLaBalle) ?? null;
      const equipiers = e.joueurs.filter((o) => o.equipe === j.equipe && o !== j);
      const porteurAmi = equipiers.find((o) => o.aLaBalle) ?? null;
      if (j.aLaBalle) { if (tientDepuis < 0) tientDepuis = e.t; } else tientDepuis = -1;
      // Passe d'un coéquipier en route : on va au-devant de la balle si on est celui qu'elle cherche
      const passeur = b.dernierEstTir && b.dernierJoueur !== null ? equipiers.find((o) => o.id === b.dernierJoueur) ?? null : null;
      const vb = Math.hypot(b.vx, b.vy);
      let pointReception: { x: number; y: number } | null = null;
      if (passeur && vb > 1.5 && j.etat === "actif" && !e.joueurs.some((o) => o.aLaBalle)) {
        const ux = b.vx / vb, uy = b.vy / vb;
        const proj = (o: Joueur) => { const t = Math.max(0, (o.x - b.x) * ux + (o.y - b.y) * uy); return { t, d: Math.hypot(b.x + ux * t - o.x, b.y + uy * t - o.y) }; };
        const moi = proj(j);
        const premier = [j, ...equipiers.filter((o) => o !== passeur && o.etat === "actif")].sort((p, q) => proj(p).d - proj(q).d)[0];
        if (premier === j && moi.d < 6) pointReception = { x: b.x + ux * (moi.t + 0.5), y: b.y + uy * (moi.t + 0.5) };
      }
      if (Math.hypot(b.x - balleX, b.y - balleY) > 0.05) { balleX = b.x; balleY = b.y; balleFixeDepuis = e.t; }
      const balleBloquee = e.t - balleFixeDepuis > 2.5 && !e.joueurs.some((o) => o.aLaBalle);

      if (e.t >= prochaineDecision) {
        prochaineDecision = e.t + P.reaction * (0.7 + alea() * 0.6);
        viseeErreur = (alea() * 2 - 1) * P.erreurVisee;
        tirPrevu = null;
        if (j.etat !== "actif") {
          mode = "tapIn";
          // Zone de tap-in la plus proche : au milieu d'un grand côté (EHBA 6.2.1.7)
          const cote = j.y >= 0 ? 1 : -1;
          cible = { x: 0, y: cote * (TERRAIN.demiW - JOUEUR.rayon) };
        } else if (j.aLaBalle) {
          mode = "conduite";
          const dx = butAdverse.x - b.x, dy = butAdverse.y - b.y, dist = Math.hypot(dx, dy);
          const devant = TERRAIN.ligneBut - b.x * s > 0.8; // balle devant la ligne de but adverse
          const angleOuvert = Math.abs(dy) / Math.max(0.1, Math.abs(dx)) < 1.3;
          // Tirer si c'est jouable ; et toujours tirer tout près de la cage (une balle poussée dedans ne compte pas)
          if (devant && ((angleOuvert && dist < P.portee) || dist < 3.5)) {
            // Tir vers la cage, un peu décalé vers un poteau, force selon la distance
            const poteau = (alea() < 0.5 ? -1 : 1) * TERRAIN.butDemiLargeur * 0.55;
            const force = Math.min(1, 0.45 + dist / 18);
            tirPrevu = { x: butAdverse.x, y: poteau + viseeErreur * 0.5, force };
          }
        } else if (porteurAdverse) {
          gardien = false;
          // L'adversaire a la balle : si on est entre lui et notre cage, on va au contact ; sinon on se replie.
          const cotéBut = (j.x - porteurAdverse.x) * -s > 0 || Math.hypot(j.x - monBut.x, j.y - monBut.y) < Math.hypot(porteurAdverse.x - monBut.x, porteurAdverse.y - monBut.y);
          mode = "defense";
          const menace = Math.hypot(b.x - monBut.x, b.y - monBut.y) < 13;
          if (cotéBut && !menace && alea() < 0.5 + P.agressivite * 0.5) cible = attaquerBalle(j, b.x, b.y);
          else if (menace) {
            // Devant sa cage, entre la balle et le but, pour couper l'angle de tir avec son vélo
            const dx = b.x - monBut.x, dy = b.y - monBut.y, d = Math.hypot(dx, dy) || 1, r = Math.min(2.2, d * 0.4);
            cible = { x: monBut.x + (dx / d) * r, y: monBut.y + (dy / d) * r };
            gardien = true;
            if (cotéBut && Math.hypot(j.x - porteurAdverse.x, j.y - porteurAdverse.y) < 3 && alea() < P.agressivite) cible = attaquerBalle(j, b.x, b.y);
          } else { const k = 0.35; cible = { x: monBut.x + (b.x - monBut.x) * k + s * 1.2, y: monBut.y + (b.y - monBut.y) * k }; }
        } else {
          // Balle libre. Si un tir arrive sur notre cage, ou si l'adversaire en est bien plus près dans notre camp : on garde la cage.
          const versNous = b.vx * -s > 4 && Math.hypot(b.x - monBut.x, b.y - monBut.y) < 24;
          const dMoi = Math.hypot(b.x - j.x, b.y - j.y), dLui = Math.min(...adversaires.map((o) => Math.hypot(b.x - o.x, b.y - o.y)), 99);
          const notreCamp = b.x * s < 0;
          if (versNous || (notreCamp && dLui + 3 < dMoi && Math.hypot(j.x - monBut.x, j.y - monBut.y) < Math.hypot(b.x - monBut.x, b.y - monBut.y))) {
            mode = "defense"; gardien = true;
            const dx = b.x - monBut.x, dy = b.y - monBut.y, d = Math.hypot(dx, dy) || 1, r = Math.min(2.2, d * 0.4);
            cible = { x: monBut.x + (dx / d) * r, y: monBut.y + (dy / d) * r };
          } else { mode = "balle"; gardien = false; }
        }
      }

      // En équipe : rôles partagés (tactique.ts). Un seul joueur va à la balle, un joueur de sécurité, un soutien large.
      const enEquipe = equipiers.length > 0;
      const tab = enEquipe ? tableauEquipe(e, j.equipe) : null;
      const role = tab?.roles.get(j.id) ?? null;
      if (tab && role && j.etat === "actif" && !j.aLaBalle) {
        if (pointReception) { mode = "reception"; cible = pointReception; }
        else if (role === "premier") {
          if (tab.phase === "libre") { if (mode !== "balle") { mode = "balle"; gardien = false; } }
          else if (porteurAdverse) {
            // Pression sur le porteur, en venant du côté de notre cage pour lui fermer le chemin
            mode = "defense"; gardien = false;
            const gx = porteurAdverse.x + (monBut.x - porteurAdverse.x) * 0.18, gy = porteurAdverse.y + (monBut.y - porteurAdverse.y) * 0.18;
            const coteBut = Math.hypot(j.x - monBut.x, j.y - monBut.y) < Math.hypot(porteurAdverse.x - monBut.x, porteurAdverse.y - monBut.y) - 0.5;
            cible = coteBut ? attaquerBalle(j, b.x, b.y) : { x: gx, y: gy };
          }
        } else if (role === "arriere" || role === "soutien") {
          const p = placeRole(e, j, role, tab.phase);
          mode = tab.phase === "attaque" || (role === "soutien" && tab.phase === "libre") ? "soutien" : "defense";
          cible = { x: p.x, y: p.y }; gardien = p.gardien;
        }
      }
      // Porteur en équipe : tir seulement s'il est de qualité ; sinon passe (écarter, ou repli vers l'arrière) ; sinon on garde et on écarte
      if (enEquipe && j.aLaBalle && mode === "conduite") {
        const dBut = Math.hypot(butAdverse.x - b.x, butAdverse.y - b.y);
        if (tirPrevu && !tirPrevu.passe && dBut > 4 && !couloirOuvert(e, j.equipe, b.x, b.y, butAdverse.x, tirPrevu.y, 0.9)) tirPrevu = null;
        if (!tirPrevu && e.t - tientDepuis > 0.3) {
          const devant = (o: Joueur) => (o.x - j.x) * Math.cos(j.cap) + (o.y - j.y) * Math.sin(j.cap);
          const presse = adversaires.some((o) => o.etat === "actif" && Math.hypot(o.x - j.x, o.y - j.y) < 3.2 && devant(o) > -0.5);
          const barre = adversaires.some((o) => o.etat === "actif" && devant(o) > 0 && devant(o) < 6 && Math.abs((o.y - j.y) * Math.cos(j.cap) - (o.x - j.x) * Math.sin(j.cap)) < 1.8);
          let meilleur: { o: Joueur; x: number; y: number; val: number } | null = null;
          for (const o of equipiers) {
            if (o.etat !== "actif") continue;
            const d0 = Math.hypot(o.x - b.x, o.y - b.y); if (d0 < 3 || d0 > 20) continue;
            const tv = d0 / Math.min(PASSE.vitesseMax, PASSE.vitesseBase + d0 * PASSE.vitesseParMetre);
            const lx = o.x + Math.cos(o.cap) * o.v * tv, ly = o.y + Math.sin(o.cap) * o.v * tv;
            if (Math.abs(lx) > TERRAIN.demiL - 1 || Math.abs(ly) > TERRAIN.demiW - 1) continue;
            if (!couloirOuvert(e, j.equipe, b.x, b.y, lx, ly, 1.6)) continue;
            // Valeur : avancer vers la cage, angle de tir ouvert pour le receveur, compléter un triangle
            const dButO = Math.hypot(lx - butAdverse.x, ly), angle = Math.abs(ly) / Math.max(0.5, Math.abs(butAdverse.x - lx));
            let val = (dBut - dButO) * 0.12 + (angle < 1.2 && dButO < P.portee ? 0.8 : 0);
            const c = e.combo; if (c.equipe === j.equipe && c.passes >= 1 && !c.joueurs.includes(o.id)) val += 1.2;
            if (tab?.roles.get(o.id) === "arriere") val += barre || presse ? 0.6 : -0.6; // repli quand c'est bouché
            if (!meilleur || val > meilleur.val) meilleur = { o, x: lx, y: ly, val };
          }
          const tenue = e.t - tientDepuis;
          if (meilleur && (presse || (barre && tenue > 0.6 && meilleur.val > -0.3) || (tenue > 1 && meilleur.val > 0.3 && alea() < P.passe * 0.8)))
            tirPrevu = { x: meilleur.x, y: meilleur.y, force: 0.4, passe: meilleur.o.id };
        }
      }

      let dirX = 0, dirY = 0, frein = false, tir = 0, viseX = butAdverse.x, viseY = butAdverse.y + viseeErreur;
      let passe: number | null = null;
      const vers = (x: number, y: number) => { const dx = x - j.x, dy = y - j.y, d = Math.hypot(dx, dy) || 1; return { x: dx / d, y: dy / d, d }; };

      if (mode === "tapIn") {
        const pc = contournerCages(j.x, j.y, cible.x, cible.y), v = vers(pc.x, pc.y); dirX = v.x; dirY = v.y;
        if (dansZoneTapIn(j)) { dirX = 0; dirY = 0; }
      } else if (mode === "conduite") {
        if (!j.aLaBalle) { mode = "balle"; prochaineDecision = e.t; }
        if (tirPrevu && j.aLaBalle) { tir = tirPrevu.force; viseX = tirPrevu.x; viseY = tirPrevu.y; passe = tirPrevu.passe ?? null; tirPrevu = null; }
        // Conduire vers la cage adverse, en évitant l'adversaire qui barre la route ; tourner doucement pour garder la balle.
        let cx = butAdverse.x - s * 2, cy = 0;
        if (equipiers.length > 0 && b.x * s < TERRAIN.ligneBut - 7) { cx = b.x + s * 6; cy = (j.y >= 0 ? 1 : -1) * Math.max(3, Math.min(6, Math.abs(j.y))); }
        for (const o of adversaires) {
          const rel = (o.x - j.x) * s;
          if (rel > 0 && rel < 4 && Math.abs(o.y - j.y) < 1.6) cy = j.y + (j.y >= o.y ? 2.5 : -2.5);
        }
        const pc = contournerCages(j.x, j.y, cx, cy); cx = pc.x; cy = pc.y;
        const v = vers(cx, cy);
        const ecart = norm(Math.atan2(v.y, v.x) - j.cap), lim = 0.45;
        const a = j.cap + Math.max(-lim, Math.min(lim, ecart));
        dirX = Math.cos(a); dirY = Math.sin(a);
      } else {
        // Aller à la balle (mode « balle ») ou défendre
        let tx: number, ty: number, aligne = false;
        if (mode === "balle") {
          // Venir sur la balle par derrière, orienté vers la cage adverse, pour que le maillet (à droite) la prenne.
          // Le maillet est à droite : contre une balustrade, il faut parfois prendre la balle dans un autre sens.
          const h0 = Math.atan2(butAdverse.y - b.y, butAdverse.x - b.x), marge = JOUEUR.rayon + 0.05;
          let h = h0, pire = Infinity;
          for (let k = 0; k <= 20; k++) {
            const d = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.3, hc = h0 + d;
            const cx = b.x - (Math.cos(hc) * MAILLET.avant - Math.sin(hc) * MAILLET.cote), cy = b.y - (Math.sin(hc) * MAILLET.avant + Math.cos(hc) * MAILLET.cote);
            const depasse = Math.max(0, Math.abs(cx) - (TERRAIN.demiL - marge)) + Math.max(0, Math.abs(cy) - (TERRAIN.demiW - marge));
            if (depasse === 0) { h = hc; break; }
            if (depasse < pire) { pire = depasse; h = hc; }
          }
          const c = Math.cos(h), sn = Math.sin(h);
          const corps = { x: b.x - (c * MAILLET.avant - sn * MAILLET.cote), y: b.y - (sn * MAILLET.avant + c * MAILLET.cote) };
          const derriere = (j.x - b.x) * c + (j.y - b.y) * sn < -0.6;
          const lateral = Math.abs(-(j.x - corps.x) * sn + (j.y - corps.y) * c);
          // Balle qui roule : viser un peu devant elle
          const lead = Math.min(0.6, Math.hypot(j.x - b.x, j.y - b.y) / 12);
          // Bien placé : on traverse le point de prise sans ralentir ; sinon on se place d'abord derrière.
          aligne = derriere && lateral < 1.0;
          if (balleBloquee) {
            // Approche directe : on vient sur la balle depuis là où on est, maillet en avant
            const hd = Math.atan2(b.y - j.y, b.x - j.x), cd = Math.cos(hd), sd = Math.sin(hd);
            corps.x = b.x - (cd * MAILLET.avant - sd * MAILLET.cote); corps.y = b.y - (sd * MAILLET.avant + cd * MAILLET.cote); aligne = true;
          }
          // En équipe : on prend la balle directement, d'où qu'on vienne (on s'oriente ensuite pour passer ou conduire)
          if (equipiers.length > 0 && Math.hypot(b.vx, b.vy) < 4 && !balleBloquee) {
            const hd = Math.atan2(b.y - j.y, b.x - j.x), cd = Math.cos(hd), sd = Math.sin(hd);
            corps.x = b.x - (cd * MAILLET.avant - sd * MAILLET.cote); corps.y = b.y - (sd * MAILLET.avant + cd * MAILLET.cote);
            tx = corps.x + cd * 1.5 + b.vx * lead; ty = corps.y + sd * 1.5 + b.vy * lead; aligne = true;
          } else if (aligne && balleBloquee) { tx = corps.x; ty = corps.y; }
          else if (aligne) { tx = corps.x + c * 2.5 + b.vx * lead; ty = corps.y + sn * 2.5 + b.vy * lead; }
          else { tx = corps.x - c * 2.2 + b.vx * lead; ty = corps.y - sn * 2.2 + b.vy * lead; }
        } else if (mode === "reception") {
          // Au-devant de la passe : maillet sur la trajectoire, dans le sens de la balle pour la cueillir en douceur
          const h = Math.atan2(b.vy, b.vx), c = Math.cos(h), sn = Math.sin(h);
          tx = cible.x - (c * MAILLET.avant - sn * MAILLET.cote); ty = cible.y - (sn * MAILLET.avant + c * MAILLET.cote); aligne = true;
        } else { tx = cible.x; ty = cible.y; }
        tx = Math.max(-TERRAIN.demiL + 0.8, Math.min(TERRAIN.demiL - 0.8, tx)); ty = Math.max(-TERRAIN.demiW + 0.8, Math.min(TERRAIN.demiW - 0.8, ty));
        const passage = contournerCages(j.x, j.y, tx, ty); if (passage.x !== tx || passage.y !== ty) { tx = passage.x; ty = passage.y; aligne = false; }
        const v = vers(tx, ty); dirX = v.x; dirY = v.y;
        const ecartCible = Math.abs(norm(Math.atan2(v.y, v.x) - j.cap));
        const m = aligne && !balleBloquee ? 1 : Math.min(1, Math.max(0.3, v.d / 2.5));
        dirX *= m; dirY *= m;
        // Freiner avant un virage serré à grande vitesse, comme un humain prudent
        // Freiner avant un virage serré, comme un humain prudent ; et ne pas tourner autour d'une cible proche
        if ((ecartCible > 1.6 && j.v > 3.2) || (v.d < 3 && ecartCible > 0.9 && j.v > 2)) frein = true;
        if (mode === "defense" && v.d < 0.8 && !porteurAdverse) { dirX *= 0.3; dirY *= 0.3; }
        if (mode === "soutien" && v.d < 1.5) { dirX *= 0.35; dirY *= 0.35; }
        if (mode === "reception") { const m2 = Math.min(1, Math.max(0.35, v.d / 3)); dirX = v.x * m2; dirY = v.y * m2; frein = v.d < 1 && j.v > 3; }
        // Gardien en place : se mettre en travers de l'axe du tir pour couvrir la cage avec son vélo
        if (mode === "defense" && gardien && v.d < 0.9) {
          const ax = b.x - j.x, ay = b.y - j.y, n = Math.hypot(ax, ay) || 1;
          const px = -ay / n, py = ax / n, sens = px * Math.cos(j.cap) + py * Math.sin(j.cap) >= 0 ? 1 : -1;
          dirX = px * sens * 0.35 + v.x * 0.25; dirY = py * sens * 0.35 + v.y * 0.25;
        }
      }

      // Balle libre ou tenue par l'adversaire, à portée de notre maillet : on la frappe vers l'avant (dégagement ou tir).
 if (!tir && mode !== "conduite" && mode !== "tapIn" && mode !== "reception" && mode !== "soutien" && j.etat === "actif" && !j.aLaBalle && b.dansBut === 0 && b.z < 0.4 && j.pauseAimant <= 0) {
        const mp = pointMaillet(j);
        const loin = Math.hypot(butAdverse.x - b.x, butAdverse.y - b.y) > P.portee;
        // En équipe, on contrôle la balle plutôt que de la frapper au hasard : on ne dégage que si un adversaire est vraiment dessus
        const presse = !!porteurAdverse || adversaires.some((o) => o.etat === "actif" && Math.hypot(b.x - o.x, b.y - o.y) < (equipiers.length > 0 ? 1.3 : 2.5));
        // Balle coincée contre la balustrade (coin, derrière une cage) : on la sort vers le milieu.
        const coincee = balleBloquee || (TERRAIN.demiL - Math.abs(b.x) < 1 && TERRAIN.demiW - Math.abs(b.y) < 1.2) || (Math.abs(b.x) > TERRAIN.ligneBut + TERRAIN.butProfondeur - 0.1 && Math.abs(b.y) < TERRAIN.butDemiLargeur + 1.5);
        const tirDirect = !loin && TERRAIN.ligneBut - b.x * s > 0.8 && Math.abs(b.y - butAdverse.y) / Math.max(0.1, Math.abs(butAdverse.x - b.x)) < 1.3;
        // On frappe sans contrôler seulement si on est pressé, ou pour un tir direct ; sinon on prend la balle au maillet.
        if ((presse || tirDirect || coincee) && Math.hypot(mp.x - b.x, mp.y - b.y) < MAILLET.portee * 0.85 && e.t >= prochaineFrappe) {
          prochaineFrappe = e.t + P.reaction * 2;
          if (coincee) { tir = 0.5; viseX = b.x * 0.4; viseY = b.y * 0.2; }
          else if (loin) { tir = 0.45 + alea() * 0.15; viseX = b.x + s * 10; viseY = Math.max(-7, Math.min(7, b.y + (alea() - 0.5) * 8)); }
          else { tir = 0.6 + alea() * 0.25; viseX = butAdverse.x; viseY = (alea() < 0.5 ? -1 : 1) * TERRAIN.butDemiLargeur * 0.5 + viseeErreur * 0.5; }
        }
      }
      // Bloqué (contre un adversaire ou la balustrade) : on recule d'un coup de pédale dans une autre direction.
      // (bloqué = on veut avancer mais on n'a presque pas bougé depuis 1,2 s : contre un adversaire, une cage, la balustrade)
      if (e.t - repere.t >= 1.2) { const deplace = Math.hypot(j.x - repere.x, j.y - repere.y); bloque = deplace < 0.35 && Math.hypot(dirX, dirY) > 0.3 && !(mode === "defense" && gardien) ? 2 : 0; repere = { x: j.x, y: j.y, t: e.t }; }
      if (bloque > 1.2) { degagement = e.t + 0.9; bloque = 0; const a = j.cap + Math.PI * (0.6 + alea() * 0.8); degagementDir = { x: Math.cos(a), y: Math.sin(a) }; }
      if (e.t < degagement) { dirX = degagementDir.x; dirY = degagementDir.y; frein = false; }
      const k = P.vitesse;
      // Équilibre : presque à l'arrêt depuis trop longtemps, on repart en petit cercle plutôt que de poser le pied
      if (j.etat === "actif" && j.risque > 0.5 && !tir && Math.hypot(dirX, dirY) * k < 0.5) {
        const a = j.cap + 0.8 * (j.id % 2 ? 1 : -1); dirX = Math.cos(a) * 0.55; dirY = Math.sin(a) * 0.55; frein = false;
        return { dx: dirX, dy: dirY, frein, viseX, viseY, tir, passe };
      }
      return { dx: dirX * k, dy: dirY * k, frein, viseX, viseY, tir, passe };
    },
  };
}

/** Pour aller chercher la balle tenue par un adversaire : position du corps qui amène notre maillet sur la balle, un peu au-delà. */
function attaquerBalle(j: Joueur, bx: number, by: number) {
  const h = Math.atan2(by - j.y, bx - j.x), c = Math.cos(h), s = Math.sin(h);
  return { x: bx - (c * MAILLET.avant - s * MAILLET.cote) + c * 0.6, y: by - (s * MAILLET.avant + c * MAILLET.cote) + s * 0.6 };
}

/** Point de soutien : devant la balle, du côté opposé au porteur, pour offrir une passe. */
function pointSoutien(bx: number, by: number, s: number, yPorteur: number) {
  const x = Math.max(-TERRAIN.ligneBut + 2, Math.min(TERRAIN.ligneBut - 2.5, bx + s * 6.5));
  const y = yPorteur >= 0 ? -4.5 : 4.5;
  return { x, y };
}

/** Utile aux tests : distance entre la tête du maillet d'un joueur et la balle. */
export const distanceMailletBalle = (j: Joueur, e: Etat) => { const p = pointMaillet(j); return Math.hypot(p.x - e.balle.x, p.y - e.balle.y); };
export const PORTEE_AIMANT = BALLE.aimantRayon;
