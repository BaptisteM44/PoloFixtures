/** Types de la simulation. Aucun import de rendu ici. */

/** actif : en jeu. auSol : vient de tomber. horsJeu : doit aller taper la balustrade (EHBA 6.2.1). */
export type EtatJoueur = "actif" | "auSol" | "horsJeu";

export interface Joueur {
  id: number;
  equipe: 0 | 1;
  x: number;
  y: number;
  /** Cap du vélo, en radians. Le vélo avance toujours dans le sens de son cap. */
  cap: number;
  /** Vitesse le long du cap, m/s. */
  v: number;
  etat: EtatJoueur;
  /** Temps écoulé dans l'état courant. */
  tEtat: number;
  /** Jauge de chute, de 0 à 1 : à 1, le joueur tombe. Sert aussi au signal d'alerte. */
  risque: number;
  /** Rotation appliquée au dernier pas, rad/s (sert à l'inclinaison et au décrochage de balle). */
  rot: number;
  freine: boolean;
  aLaBalle: boolean;
  pauseAimant: number;
  pauseCollision: number;
  /** Temps depuis le dernier geste de frappe, et sa force (pour l'animation). */
  tFrappe: number;
  forceFrappe: number;
}

export interface Balle {
  x: number;
  y: number;
  /** Hauteur du centre de la balle. */
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Dernier joueur à avoir touché la balle, et si c'était un tir (EHBA 4.2) ou une conduite. */
  dernierJoueur: number | null;
  dernierEstTir: boolean;
  /** 0 : en jeu. +1 / -1 : arrêtée dans la cage du côté +x / -x. */
  dansBut: -1 | 0 | 1;
}

/** Ce que demande un joueur (humain ou bot) pour un pas. */
export interface Commande {
  /** Direction voulue sur le terrain, norme entre 0 et 1. */
  dx: number;
  dy: number;
  frein: boolean;
  /** Point visé sur le terrain. */
  viseX: number;
  viseY: number;
  /** 0 : pas de frappe. Sinon : force de la frappe, entre 0 et 1, vers le point visé. */
  tir: number;
  /** Passe vers ce coéquipier (id) : la vitesse est plafonnée pour qu'elle se contrôle. */
  passe?: number | null;
}

export type Evenement =
  | { type: "tir"; joueur: number; force: number }
  | { type: "frappeDansLeVide"; joueur: number }
  | { type: "but"; camp: 1 | -1; joueur: number | null }
  | { type: "butRefuse"; camp: 1 | -1 }
  | { type: "chute"; joueur: number }
  | { type: "tapIn"; joueur: number }
  | { type: "piedAterre"; joueur: number }
  | { type: "collision"; a: number; b: number }
  | { type: "vol"; joueur: number; victime: number }
  | { type: "passe"; joueur: number; recepteur: number; passes: number; triangle: boolean }
  | { type: "tirCombo"; joueur: number; bonus: number; triangle: boolean }
  | { type: "rebond"; force: number }
  | { type: "poteau"; force: number }
  | { type: "plot"; force: number }
  | { type: "corps"; joueur: number; force: number };

export interface Etat {
  t: number;
  /** État du générateur aléatoire (déterministe). */
  graine: number;
  joueurs: Joueur[];
  balle: Balle;
  /** Plots posés sur le terrain (obstacles fixes). */
  plots: { x: number; y: number }[];
  /** Buts marqués par l'équipe 0 (attaque vers +x) et l'équipe 1. */
  score: [number, number];
  /** Compte à rebours avant la remise au centre après un but. */
  remise: number;
  /** Ce qui s'est passé pendant le dernier pas (vidé à chaque pas). */
  evenements: Evenement[];
  /** Série de passes réussies en cours. */
  combo: Combo;
}

/** Série de passes d'une équipe : nombre de passes reçues, joueurs impliqués, temps depuis la dernière action. */
export interface Combo { equipe: 0 | 1 | -1; passes: number; joueurs: number[]; t: number }

export const COMMANDE_VIDE: Commande = { dx: 0, dy: 0, frein: false, viseX: 0, viseY: 0, tir: 0 };
