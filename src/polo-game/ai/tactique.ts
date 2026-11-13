/**
 * Tactique d'équipe (jalon M2), inspirée du hockey sur glace à 3 contre 3 :
 * garder la balle plutôt que la jouer à l'aveugle, écarter le jeu, toujours un joueur « haut » en sécurité,
 * un seul joueur au pressing, marquage individuel des autres, et revenir en arrière (« reset ») si rien n'est ouvert.
 *
 * Les rôles sont calculés une fois par pas et par équipe, partagés par tous les bots de l'équipe
 * (et ils tiennent compte du joueur humain : s'il est le plus près de la balle, aucun bot ne lui court après).
 * Ils changent avec un peu d'inertie pour éviter que deux joueurs échangent leur rôle sans arrêt.
 */
import { TERRAIN } from "../sim/constantes";
import type { Etat, Joueur } from "../sim/types";

export type Role =
  /** A la balle. */
  | "porteur"
  /** Va chercher la balle (balle libre) ou met la pression sur le porteur adverse. */
  | "premier"
  /** Offre une solution : large et devant en attaque, marquage individuel en défense. */
  | "soutien"
  /** Joueur de sécurité : reste haut (en retrait) en attaque, protège la cage en défense. */
  | "arriere"
  /** Hors jeu : va taper la balustrade. */
  | "horsJeu";

export type Phase = "attaque" | "defense" | "libre";

export interface Tableau { t: number; phase: Phase; roles: Map<number, Role>; arriere: number | null; premier: number | null }

const memoire = new WeakMap<Etat, Partial<Record<0 | 1, Tableau>>>();

/** `humains` : joueurs pilotés par une personne (on ne leur donne pas le rôle d'arrière, on ne peut pas compter sur eux pour le tenir). */
export function tableauEquipe(e: Etat, equipe: 0 | 1, humains: ReadonlySet<number> = new Set([0])): Tableau {
  let m = memoire.get(e); if (!m) { m = {}; memoire.set(e, m); }
  const prec = m[equipe];
  if (prec && prec.t === e.t) return prec;
  const s = equipe === 0 ? 1 : -1, b = e.balle;
  const miens = e.joueurs.filter((j) => j.equipe === equipe);
  const actifs = miens.filter((j) => j.etat === "actif");
  const roles = new Map<number, Role>();
  for (const j of miens) if (j.etat !== "actif") roles.set(j.id, "horsJeu");
  const porteur = e.joueurs.find((j) => j.aLaBalle) ?? null;
  const phase: Phase = porteur ? (porteur.equipe === equipe ? "attaque" : "defense") : "libre";
  const recul = (j: Joueur) => j.x * s; // plus c'est petit, plus le joueur est près de sa propre cage
  const dBalle = (j: Joueur) => Math.hypot(j.x - b.x, j.y - b.y);

  // Joueur de sécurité : de préférence un bot, le plus en retrait ; on garde le même tant que c'est raisonnable
  let arriere: Joueur | null = null;
  const candidats = actifs.filter((j) => j !== porteur);
  const bots = candidats.filter((j) => !humains.has(j.id));
  const pool = bots.length > 0 && actifs.length >= 3 ? bots : actifs.length >= 3 ? candidats : [];
  if (pool.length > 0) {
    const ancien = pool.find((j) => j.id === prec?.arriere) ?? null;
    const plusEnRetrait = pool.slice().sort((p, q) => recul(p) - recul(q))[0];
    arriere = ancien && recul(ancien) < recul(plusEnRetrait) + 5 ? ancien : plusEnRetrait;
  }
  if (porteur && porteur.equipe === equipe) roles.set(porteur.id, "porteur");
  if (arriere) roles.set(arriere.id, "arriere");

  // Premier : un seul joueur va à la balle (ou au porteur adverse), avec inertie ; l'arrière n'y va que si la balle est dans notre tiers
  let premier: Joueur | null = null;
  if (phase !== "attaque") {
    const balleChezNous = b.x * s < -TERRAIN.ligneBut + 7;
    const prets = actifs.filter((j) => j !== arriere || balleChezNous || actifs.length < 3);
    const ancien = prets.find((j) => j.id === prec?.premier) ?? null;
    const proche = prets.slice().sort((p, q) => dBalle(p) - dBalle(q))[0] ?? null;
    premier = ancien && proche && dBalle(ancien) < dBalle(proche) + 2.5 ? ancien : proche;
    if (premier) roles.set(premier.id, "premier");
  }
  for (const j of actifs) if (!roles.has(j.id)) roles.set(j.id, "soutien");
  const t: Tableau = { t: e.t, phase, roles, arriere: arriere?.id ?? null, premier: premier?.id ?? null };
  m[equipe] = t;
  return t;
}

/** Couloir ouvert : aucun adversaire actif à moins de `marge` du segment. */
export function couloirOuvert(e: Etat, equipe: 0 | 1, ax: number, ay: number, bx: number, by: number, marge: number) {
  const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1;
  return e.joueurs.every((o) => {
    if (o.equipe === equipe || o.etat !== "actif") return true;
    const t = Math.max(0, Math.min(1, ((o.x - ax) * vx + (o.y - ay) * vy) / l2));
    return Math.hypot(o.x - ax - vx * t, o.y - ay - vy * t) > marge;
  });
}

const borne = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Place d'un joueur selon son rôle (hors porteur et premier, qui jouent la balle). */
export function placeRole(e: Etat, j: Joueur, role: Role, phase: Phase): { x: number; y: number; gardien: boolean } {
  const s = j.equipe === 0 ? 1 : -1, b = e.balle, L = TERRAIN.ligneBut;
  const monBut = { x: -s * L, y: 0 };
  const porteur = e.joueurs.find((o) => o.aLaBalle) ?? null;
  const cote = (y: number) => (y >= 0 ? 1 : -1);
  if (role === "arriere") {
    if (phase === "attaque") {
      // Haut, en retrait du porteur, légèrement du même côté : la solution de repli (« reset »)
      const x = borne(b.x * s - 7, -L + 4, 3) * s;
      return { x, y: borne(b.y * 0.35, -3, 3), gardien: false };
    }
    const dx = b.x - monBut.x, dy = b.y - monBut.y, d = Math.hypot(dx, dy) || 1;
    if (d < 14) { const r = Math.min(2.2, d * 0.4); return { x: monBut.x + (dx / d) * r, y: monBut.y + (dy / d) * r, gardien: true }; }
    // Balle loin : on tient le milieu de notre camp, entre la balle et la cage
    return { x: monBut.x + s * Math.min(7, d * 0.35), y: dy * 0.2, gardien: false };
  }
  // Soutien
  if (phase === "attaque" && porteur) {
    const yP = porteur.y;
    if (b.x * s > L - 7) {
      // Balle près de la cage adverse : au second poteau, prêt à reprendre
      return { x: s * (L - 2.6), y: -cote(yP) * 2.6, gardien: false };
    }
    // Écarter le jeu : large, côté opposé au porteur, un peu devant lui
    return { x: borne(b.x * s + 5, -6, L - 3.5) * s, y: -cote(yP) * 6, gardien: false };
  }
  if (phase === "defense" && porteur) {
    // Marquage individuel : l'adversaire démarqué le plus dangereux, corps entre lui et notre cage, un peu vers la balle
    const libres = e.joueurs.filter((o) => o.equipe !== j.equipe && o !== porteur && o.etat === "actif");
    const cible = libres.sort((p, q) => Math.hypot(p.x - monBut.x, p.y - monBut.y) - Math.hypot(q.x - monBut.x, q.y - monBut.y))[0];
    if (cible) {
      const gx = cible.x + (monBut.x - cible.x) * 0.25 + (b.x - cible.x) * 0.12, gy = cible.y + (monBut.y - cible.y) * 0.25 + (b.y - cible.y) * 0.12;
      return { x: gx, y: gy, gardien: false };
    }
    return { x: monBut.x + s * 5, y: b.y * 0.3, gardien: false };
  }
  // Balle libre : se rendre disponible, large, du côté opposé à la balle, un peu en avant
  return { x: borne(b.x * s + 3, -L + 5, L - 4) * s, y: -cote(b.y) * 5.5, gardien: false };
}
