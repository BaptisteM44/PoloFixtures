/**
 * Déroulement d'un match (jalon M1), au-dessus de `pas` : joute de départ, chrono, buts, remises en jeu, fin.
 * Règles : RULES.md (EHBA 2023). L'équipe 0 attaque vers +x, l'équipe 1 vers -x.
 * TypeScript pur, déterministe, sans rendu.
 */
import { DT, JOUEUR, MAILLET, TERRAIN } from "./constantes";
import { casserCombo, creerEtat, creerJoueur, pas, remettreAuCentre } from "./pas";
import { COMMANDE_VIDE, type Commande, type Etat } from "./types";

export type Phase = "joute" | "jeu" | "but" | "remise" | "fin";

export interface ConfigMatch {
  /** Nombre de buts pour gagner. */
  butsPourGagner: number;
  /** Durée du match en secondes (chrono arrêté à chaque arrêt de jeu, EHBA 5.3.4). */
  duree: number;
}
export const CONFIG_MATCH: ConfigMatch = { butsPourGagner: 5, duree: 6 * 60 };

/** Durées des phases, en secondes de simulation. */
export const DUREES = {
  /** Compte à rebours de la joute : 3, 2, 1, polo. */
  joute: 3,
  /** Temps après un but, avant de replacer les joueurs. */
  but: 2.6,
  /** Pause après le replacement, avant que le jeu reprenne. */
  remise: 1.2,
} as const;

export type EvenementMatch =
  | { type: "compte"; n: 3 | 2 | 1 }
  | { type: "coupDEnvoi" }
  | { type: "but"; equipe: 0 | 1; contreSonCamp: boolean }
  | { type: "butRefuse"; equipe: 0 | 1 }
  | { type: "reprise"; possession: 0 | 1 }
  | { type: "butEnOr" }
  | { type: "finMatch"; vainqueur: 0 | 1 };

export interface Match {
  etat: Etat;
  config: ConfigMatch;
  phase: Phase;
  /** Temps passé dans la phase courante. */
  tPhase: number;
  /** Temps de jeu restant, en secondes. */
  chrono: number;
  butEnOr: boolean;
  vainqueur: 0 | 1 | null;
  /** Équipe qui aura la balle à la reprise (après un but ou une balle poussée dans la cage). */
  possessionReprise: 0 | 1 | null;
  /** Ce qui s'est passé au dernier pas, en plus de `etat.evenements`. */
  evenements: EvenementMatch[];
}

/** Sens d'attaque d'une équipe : +1 vers +x, -1 vers -x. */
export const sensAttaque = (equipe: 0 | 1) => (equipe === 0 ? 1 : -1);

/** Joute (EHBA 5.2) : chaque joueur part de la balustrade derrière sa cage, sur le côté de la cage, face à l'adversaire. */
/** Écarts en largeur des joueurs d'une équipe, selon leur nombre (le premier est toujours au même endroit qu'en 1 contre 1). */
const ECARTS: Record<number, number[]> = { 1: [2.4], 2: [2.4, -2.4], 3: [2.4, -2.4, 6] };
const rangDansEquipe = (e: Etat, j: Etat["joueurs"][number]) => e.joueurs.filter((o) => o.equipe === j.equipe).indexOf(j);
const tailleEquipe = (e: Etat, eq: 0 | 1) => e.joueurs.filter((o) => o.equipe === eq).length;

function placerJoute(e: Etat) {
  casserCombo(e.combo);
  for (const j of e.joueurs) {
    const s = sensAttaque(j.equipe), n = tailleEquipe(e, j.equipe), ecarts = ECARTS[n] ?? ECARTS[3];
    const k = rangDansEquipe(e, j);
    // Derrière sa cage, contre la balustrade du fond (le 3e un peu plus en avant, à côté du pan coupé)
    j.x = -s * (TERRAIN.demiL - JOUEUR.rayon - 0.05 - (Math.abs(ecarts[k % ecarts.length]) > 5 ? 2 : 0));
    j.y = -s * ecarts[k % ecarts.length];
    j.cap = s === 1 ? 0 : Math.PI;
    reinitialiserMouvement(j);
  }
  remettreAuCentre(e.balle);
}

function reinitialiserMouvement(j: Etat["joueurs"][number]) {
  j.v = 0; j.rot = 0; j.risque = 0; j.aLaBalle = false; j.pauseAimant = 0; j.pauseCollision = 0; j.tFrappe = 99;
  if (j.etat === "auSol") { j.etat = "horsJeu"; j.tEtat = 0; }
}

/**
 * Reprise après un arrêt (EHBA 5.4) : chacun dans son camp ; l'équipe en possession a la balle
 * dans son camp, au maillet ; l'autre attend dans son camp.
 */
function placerReprise(e: Etat, possession: 0 | 1) {
  const s = sensAttaque(possession), b = e.balle;
  remettreAuCentre(b); casserCombo(e.combo);
  b.x = -s * 6; b.y = 0;
  let premier = true;
  for (const j of e.joueurs) {
    const sj = sensAttaque(j.equipe);
    reinitialiserMouvement(j);
    j.cap = sj === 1 ? 0 : Math.PI;
    if (j.equipe === possession && premier) {
      // Placé pour que la tête du maillet touche la balle (maillet devant et à droite)
      premier = false;
      j.x = b.x - Math.cos(j.cap) * MAILLET.avant + Math.sin(j.cap) * MAILLET.cote;
      j.y = b.y - Math.sin(j.cap) * MAILLET.avant - Math.cos(j.cap) * MAILLET.cote;
    } else {
      // Les autres dans leur camp, étalés en largeur
      const k = rangDansEquipe(e, j), ys = j.equipe === possession ? [-3.5, 3.5, 0] : [0, -4, 4];
      j.x = -sj * (j.equipe === possession ? 9 + (k % 2) * 2 : 11 - (k === 0 ? 0 : 3)); j.y = ys[k % ys.length];
    }
  }
}

export function creerMatch(graine: number, nbParEquipe = 1, config: ConfigMatch = CONFIG_MATCH): Match {
  const joueurs = [];
  let id = 0;
  for (const equipe of [0, 1] as const) for (let k = 0; k < nbParEquipe; k++) joueurs.push(creerJoueur(id++, equipe, 0, 0, 0));
  const etat = creerEtat(graine, joueurs);
  placerJoute(etat);
  return { etat, config, phase: "joute", tPhase: 0, chrono: config.duree, butEnOr: false, vainqueur: null, possessionReprise: null, evenements: [] };
}

const COMMANDES_VIDES: Commande[] = [];

function changerPhase(m: Match, p: Phase) { m.phase = p; m.tPhase = 0; }

/** Fait avancer le match d'un pas fixe (DT). `commandes[i]` s'applique à `m.etat.joueurs[i]`. */
export function pasMatch(m: Match, commandes: Commande[]): Match {
  m.evenements.length = 0;
  const e = m.etat, avant = m.tPhase;
  m.tPhase += DT;
  switch (m.phase) {
    case "joute": {
      // Personne ne bouge avant le signal : pas de faux départ possible.
      e.evenements.length = 0;
      for (const n of [3, 2, 1] as const) { const t = DUREES.joute - n; if (avant <= t && m.tPhase > t) m.evenements.push({ type: "compte", n }); }
      if (m.tPhase >= DUREES.joute) { changerPhase(m, "jeu"); m.evenements.push({ type: "coupDEnvoi" }); }
      break;
    }
    case "jeu": {
      pas(e, commandes);
      m.chrono = Math.max(0, m.chrono - DT);
      for (const ev of e.evenements) {
        if (ev.type === "but") {
          const equipe: 0 | 1 = ev.camp === 1 ? 0 : 1;
          const tireur = ev.joueur === null ? null : e.joueurs.find((j) => j.id === ev.joueur);
          e.remise = 0; // le match gère lui-même la remise en jeu
          m.possessionReprise = equipe === 0 ? 1 : 0; // l'équipe qui encaisse repart avec la balle
          m.evenements.push({ type: "but", equipe, contreSonCamp: !!tireur && tireur.equipe !== equipe });
          if (m.butEnOr || e.score[equipe] >= m.config.butsPourGagner) m.vainqueur = equipe;
          changerPhase(m, "but");
          return m;
        }
        if (ev.type === "butRefuse") {
          // Balle poussée dans la cage sans tir : arrêt, la défense récupère la balle.
          const defense: 0 | 1 = ev.camp === 1 ? 1 : 0;
          e.remise = 0;
          m.possessionReprise = defense;
          m.evenements.push({ type: "butRefuse", equipe: defense === 0 ? 1 : 0 });
          changerPhase(m, "but");
          return m;
        }
      }
      if (m.chrono <= 0 && !m.butEnOr) {
        if (e.score[0] !== e.score[1]) { m.vainqueur = e.score[0] > e.score[1] ? 0 : 1; changerPhase(m, "fin"); m.evenements.push({ type: "finMatch", vainqueur: m.vainqueur }); }
        else { m.butEnOr = true; m.evenements.push({ type: "butEnOr" }); }
      }
      break;
    }
    case "but": {
      // La balle finit sa course dans le filet ; les joueurs roulent sur leur élan. Chrono arrêté.
      for (const j of e.joueurs) j.risque = 0; // pas de pied à terre pendant la célébration
      pas(e, COMMANDES_VIDES);
      e.remise = 0;
      if (m.tPhase >= DUREES.but) {
        if (m.vainqueur !== null) { changerPhase(m, "fin"); m.evenements.push({ type: "finMatch", vainqueur: m.vainqueur }); break; }
        placerReprise(e, m.possessionReprise ?? 0);
        changerPhase(m, "remise");
      }
      break;
    }
    case "remise": {
      e.evenements.length = 0;
      if (m.tPhase >= DUREES.remise) { changerPhase(m, "jeu"); m.evenements.push({ type: "reprise", possession: m.possessionReprise ?? 0 }); }
      break;
    }
    case "fin":
      e.evenements.length = 0;
      break;
  }
  return m;
}

export { COMMANDE_VIDE };
