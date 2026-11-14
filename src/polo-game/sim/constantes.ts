/**
 * Toutes les valeurs de réglage du jeu, en unités réelles (mètres, secondes, radians).
 * Dimensions du terrain : règlement EHBA 2023 (voir docs/polo-game/RULES.md).
 * Les valeurs marquées « à régler » ont été devinées et attendent l'essai de Morvan.
 */

/** Pas de simulation fixe : 60 par seconde. */
export const DT = 1 / 60;

export const TERRAIN = {
  /** Demi-longueur et demi-largeur : terrain de 40 × 20 m (EHBA 2.1.1). */
  demiL: 20,
  demiW: 10,
  /** Distance du centre à chaque ligne de but : cages à 4 m du fond (EHBA 2.1.4.3). */
  ligneBut: 16,
  /** Cage : 185 cm de large, 90 cm de haut, 80 cm de profondeur (EHBA 2.2). */
  butDemiLargeur: 0.925,
  butHauteur: 0.9,
  butProfondeur: 0.8,
  /** Hauteur de la balustrade (EHBA 2.1.2.2). */
  balustradeH: 1.2,
  /** Zone de tap-in : 0,75 m de part et d'autre de la ligne médiane (EHBA 2.1.5). */
  tapInDemi: 0.75,
  /** Distance max entre le joueur et la balustrade pour que le maillet la touche (à régler). */
  tapInPortee: 1.25,
  /** Rayon de la zone du gardien (EHBA 2.1.6). Dessinée seulement, en V1. */
  creaseRayon: 3,
  /** Rayon des poteaux de la cage. */
  poteauRayon: 0.04,
  /** Rebond de la balle sur un poteau ou un plot. */
  rebondPoteau: 0.55,
  /** Pans coupés à 45° dans les 4 coins : longueur coupée sur chaque côté, en mètres. */
  pan: 1.5,
} as const;

export const JOUEUR = {
  /** Encombrement d'un joueur sur son vélo, vu comme un disque (à régler). */
  rayon: 0.55,
  /** Pour la balle, le vélo est un segment de roue à roue (demi-longueur) avec une épaisseur (rayon). */
  veloDemiLongueur: 0.55,
  veloEpaisseur: 0.14,
  /** Hauteur sous laquelle la balle touche le vélo et le joueur. */
  veloHauteur: 1.1,
  /** Rebond de la balle sur un vélo. */
  veloRebond: 0.35,
  /** Vitesse de pointe, m/s : 22 km/h (demande de Morvan). */
  vMax: 22 / 3.6,
  /** Accélération, m/s² (à régler). */
  acc: 4.5,
  /** Décélération en roue libre, m/s². */
  roueLibre: 1.0,
  /** Décélération au frein, m/s² : environ 2,3 m pour s'arrêter depuis la vitesse de pointe. */
  frein: 6.5,
  /** Vitesse de rotation max à basse vitesse, rad/s : pivot quasi sur place. */
  rotLente: 6.5,
  /** Accélération latérale max, m/s² : plus on va vite, plus le virage est large. */
  aLatMax: 9,
  /** Chute en virage trop sec : désactivée pour l'instant (trop dur à éviter au clavier). */
  chuteVirage: false,
  /** Chute : au-dessus de cette part de la vitesse de pointe… */
  chuteVitesse: 0.7,
  /** …si on demande un changement de direction de plus de cet angle (≈ 100°) sans freiner… */
  chuteAngle: 1.75,
  /** …pendant cette durée, en secondes. */
  chuteDelai: 0.3,
  /** Pied à terre : en dessous de cette vitesse (m/s), on perd l'équilibre… */
  piedVitesse: 0.8,
  /** …et au bout de ce temps, on pose le pied : hors jeu jusqu'au tap-in (EHBA). */
  piedDelai: 2.2,
  /** Temps passé au sol avant de pouvoir repartir (hors jeu). */
  dureeAuSol: 1.3,
  /** Ralentissement quand on force un virage sans freiner, m/s² au maximum. */
  freinVirage: 1.5,
  /** Part de vitesse gardée après une collision entre joueurs (V1 : on ralentit, on ne tombe pas). */
  ralentiCollision: 0.5,
  /** Délai minimum entre deux ralentissements par collision, en secondes. */
  pauseCollision: 0.5,
  /** Frottement contre la balustrade, m/s² quand on la percute de face. */
  frottementBalustrade: 12,
} as const;

export const MAILLET = {
  /** Position de la tête du maillet par rapport au joueur : devant et à droite, en mètres. */
  avant: 0.75,
  cote: 0.45,
  /** Distance max entre la tête du maillet et la balle pour pouvoir la frapper. */
  portee: 1.15,
  /** Hauteur max de la balle pour pouvoir la frapper. */
  hauteurMax: 0.6,
} as const;

export const BALLE = {
  /** Balle de 67 mm (EHBA 2.3.1). */
  rayon: 0.0335,
  /** Décélération de roulement, m/s² (à régler). */
  frottement: 1.3,
  /** Part de vitesse gardée après un rebond sur la balustrade / sur le sol (balle « low-bounce »). */
  rebondMur: 0.6,
  rebondSol: 0.35,
  gravite: 9.81,
  /** Aimantation : distance de capture autour de la tête du maillet. */
  aimantRayon: 0.85,
  /** Balle libre qui roule doucement (récupération) : capture plus généreuse. */
  aimantRayonLibre: 1.05,
  aimantVitesseLibre: 3,
  /** Passe d'un coéquipier : capture large et tolérante, pour que les passes se reçoivent facilement. */
  aimantRayonPasse: 1.3,
  aimantVRelMaxPasse: 14,
  /** Raideur du suivi : plus c'est grand, plus la balle colle. */
  aimantRaideur: 22,
  /** Au-delà de cette vitesse relative, la balle ne se capture pas (un tir passe). */
  aimantVRelMax: 8,
  /** Pause d'aimantation après un tir ou un décrochage, en secondes. */
  aimantPause: 0.45,
  /** Décrochage : rotation trop vive (rad/s) à plus de cette vitesse (m/s). */
  decrocheRot: 4.2,
  decrocheVitesse: 2.2,
  /** Décrochage : freinage au-dessus de cette vitesse (m/s). */
  decrocheFrein: 3.5,
  /** Duel : un maillet adverse à moins de cette distance de la balle tenue peut la récupérer… */
  volDistance: 0.8,
  /** …avec cette probabilité par seconde (plus forte s'il arrive vite, plus faible si le porteur protège en roulant vite). */
  volTaux: 1.6,
  /** Vitesse relative (m/s) qui double la probabilité de récupération. */
  volVitesse: 3,
  /** Délai avant la remise au centre après un but, en secondes. */
  remiseEnJeu: 2,
} as const;

/** Plots d'entraînement : solides pour la balle et pour les joueurs. */
export const PLOT = {
  rayon: 0.16,
  hauteur: 0.42,
  /** Encombrement du joueur face à un plot (plus petit que face à un autre joueur : on frôle un plot). */
  rayonJoueur: 0.3,
} as const;

/** Disposition du terrain d'entraînement (M0) : une ligne de slalom et deux portes. */
export const PLOTS_ENTRAINEMENT: readonly { x: number; y: number }[] = [
  { x: -13, y: -5 }, { x: -10.5, y: -5 }, { x: -8, y: -5 }, { x: -5.5, y: -5 }, { x: -3, y: -5 },
  { x: -9, y: 4 }, { x: -9, y: 6 }, { x: 7, y: -6 }, { x: 7, y: -4 },
];

/**
 * Tir : une jauge continue. La force va de 0 à 1 selon la durée de l'appui ;
 * entre les deux bornes, tout est interpolé.
 */
export const TIR = {
  /** Durée d'appui pour atteindre la force maximale, en secondes. */
  dureePleine: 1.1,
  /** Force minimale d'un clic très court (une petite passe). */
  forceMin: 0.08,
  /** Vitesse de la balle à force minimale et maximale, m/s. */
  vitesseMin: 4,
  vitesseMax: 22,
  /** Vitesse verticale à force maximale, m/s (croît comme le carré de la force : la balle ne se lève que sur les gros tirs). */
  leverMax: 3.6,
  /** Erreur d'angle maximale à force maximale, en radians (croît comme le carré de la force). */
  erreurMax: 0.1,
} as const;

/** Passes et combos. */
export const PASSE = {
  /** Vitesse max d'une passe vers un coéquipier, m/s : au-delà, elle serait difficile à contrôler. */
  vitesseMax: 14,
  /** Vitesse d'une passe selon la distance : base + distance × facteur. */
  vitesseBase: 4.5,
  vitesseParMetre: 0.75,
  /** Combo : temps max (s) pour enchaîner (garder la balle ou attendre la réception) sans casser la série. */
  fenetre: 3.5,
  /** Bonus de vitesse du tir qui conclut : une-deux (2 passes) et triangle (3 joueurs différents). */
  bonusUneDeux: 1.25,
  bonusTriangle: 1.5,
  /** Vitesse max d'un tir, bonus compris. */
  vitesseTirMax: 30,
} as const;

/** Force (0 à 1) obtenue après `duree` secondes d'appui. */
export function forceDepuisDuree(duree: number): number {
  return Math.max(TIR.forceMin, Math.min(1, duree / TIR.dureePleine));
}
