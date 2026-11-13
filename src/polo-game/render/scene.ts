/**
 * Rendu three.js du terrain d'entraînement (jalon M0) : formes simples, caméra iso qui suit l'action.
 * Le rendu lit l'état de la simulation et ne le modifie jamais.
 * Repère : x du terrain = x de la scène, y du terrain = z de la scène, la hauteur est y.
 */
import * as THREE from "three";
import { BALLE, JOUEUR, MAILLET, PLOT, TERRAIN } from "../sim/constantes";
import { pointMaillet } from "../sim/pas";
import type { Etat, Joueur } from "../sim/types";
import { creerCycliste, type Cycliste } from "./cycliste";
import { creerVelo, type Velo } from "./modeles";
import type { Genre, Peau, Ressources } from "./ressources";

const C = { encre: "#1a1a1a", creme: "#fcfbf5", teal: "#2fb5bd", tealClair: "#60c9cf", rose: "#ff7f96", jaune: "#fff25a", violet: "#9a6cf0", orange: "#ff7a2f", sol: "#4d5560", terrain: "#6f8f95", rouge: "#e5484d" };
/** La vraie balle fait 67 mm : à cette échelle elle serait invisible, on la grossit à l'écran seulement. */
const BALLE_RAYON_VISUEL = 0.11;
/** Demi-hauteur visible du terrain, en mètres (zoom). */
const ZOOM = 8.5;

export interface Instantane { joueurs: { x: number; y: number; cap: number }[]; balle: { x: number; y: number; z: number } }
export interface InfosRendu {
  viseX: number; viseY: number;
  /** 0 : pas d'appui ; sinon force en cours, de 0 à 1. */ force: number;
  zoom: number;
  /** La caméra suit la balle plutôt que le joueur (rediffusion). */ suivreBalle?: boolean;
  /** Cache le viseur et le trait de visée (rediffusion, menus). */ masquerVisee?: boolean;
  /** Place la caméra d'un coup, sans glisser (changement de scène). */ couper?: boolean;
}
export interface Rendu {
  rendre(e: Etat, prec: Instantane, alpha: number, infos: InfosRendu): void;
  pointSol(clientX: number, clientY: number): { x: number; y: number } | null;
  /** Position à l'écran (en pixels, dans le canvas) d'un point du terrain. */
  projeter(x: number, y: number, z: number): { sx: number; sy: number };
  redimensionner(): void;
  /** Retire joueurs et plots de la scène (changement de mode). */
  vider(): void;
  detruire(): void;
  canvas: HTMLCanvasElement;
  appelsDeDessin(): number;
}

const mat = (couleur: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color: couleur, roughness: 0.75, metalness: 0.05, ...o });
function boite(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; return o; }
function tube(a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material) {
  const len = a.distanceTo(b), o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), m);
  o.position.copy(a).add(b).multiplyScalar(0.5); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); o.castShadow = true; return o;
}
function ligne(points: [number, number][], couleur: string, largeur = 0.06) {
  const g = new THREE.Group(), m = new THREE.MeshBasicMaterial({ color: couleur });
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, z0] = points[i], [x1, z1] = points[i + 1], len = Math.hypot(x1 - x0, z1 - z0);
    const s = new THREE.Mesh(new THREE.PlaneGeometry(len + largeur, largeur), m);
    s.rotation.x = -Math.PI / 2; s.rotation.z = -Math.atan2(z1 - z0, x1 - x0); s.position.set((x0 + x1) / 2, 0.012, (z0 + z1) / 2); g.add(s);
  }
  return g;
}

function construireTerrain(scene: THREE.Scene) {
  const L = TERRAIN.demiL, W = TERRAIN.demiW, H = TERRAIN.balustradeH;
  const sol = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), mat(C.sol, { roughness: 1 })); sol.rotation.x = -Math.PI / 2; sol.position.y = -0.01; sol.receiveShadow = true; scene.add(sol);
  const court = new THREE.Mesh(new THREE.PlaneGeometry(L * 2, W * 2), mat(C.terrain, { roughness: 0.9 })); court.rotation.x = -Math.PI / 2; court.receiveShadow = true; scene.add(court);
  // Lignes : médiane, lignes de but, zones du gardien, point central (EHBA 2.1.4, 2.1.6)
  scene.add(ligne([[0, -W], [0, W]], C.creme));
  for (const s of [1, -1]) {
    const gx = TERRAIN.ligneBut * s;
    scene.add(ligne([[gx, -W], [gx, W]], C.creme));
    const lim = TERRAIN.butDemiLargeur + 1.25, pts: [number, number][] = [];
    for (let i = 0; i <= 28; i++) { const a = -Math.PI / 2 + (i / 28) * Math.PI; const z = Math.sin(a) * TERRAIN.creaseRayon; if (Math.abs(z) > lim) continue; pts.push([gx - Math.cos(a) * TERRAIN.creaseRayon * s, z]); }
    pts.unshift([gx, -lim]); pts.push([gx, lim]);
    scene.add(ligne(pts, C.creme, 0.05));
  }
  const point = new THREE.Mesh(new THREE.CircleGeometry(0.15, 20), new THREE.MeshBasicMaterial({ color: C.creme })); point.rotation.x = -Math.PI / 2; point.position.y = 0.012; scene.add(point);

  // Balustrade. Les deux côtés proches de la caméra sont translucides pour ne rien cacher.
  const plein = mat(C.creme), fantome = mat(C.creme, { transparent: true, opacity: 0.22, depthWrite: false });
  const lisse = mat(C.teal), lisseF = mat(C.teal, { transparent: true, opacity: 0.35, depthWrite: false });
  const e = 0.14;
  // Côtés raccourcis par les pans coupés à 45° des coins
  const P = TERRAIN.pan;
  const murs: [number, number, number, number, boolean, number][] = [[0, -W - e / 2, (L - P) * 2, e, false, 0], [0, W + e / 2, (L - P) * 2, e, true, 0], [L + e / 2, 0, e, (W - P) * 2, false, 0], [-L - e / 2, 0, e, (W - P) * 2, true, 0]];
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    // Pan : de (sx·(L−P), sz·W) à (sx·L, sz·(W−P)), poussé de e/2 vers l'extérieur ; translucide s'il touche un côté proche de la caméra
    const cx = sx * (L - P / 2 + e / (2 * Math.SQRT2)), cz = sz * (W - P / 2 + e / (2 * Math.SQRT2));
    murs.push([cx, cz, P * Math.SQRT2 + e * 0.6, e, sz === 1 || sx === -1, sx * sz > 0 ? Math.PI / 4 : -Math.PI / 4]);
  }
  for (const [x, z, w, d, proche, rot] of murs) {
    const m = boite(w, H, d, proche ? fantome : plein, x, H / 2, z); m.rotation.y = rot; if (proche) { m.castShadow = false; m.renderOrder = 5; } scene.add(m);
    const r = boite(w, 0.07, d + 0.04, proche ? lisseF : lisse, x, H + 0.035, z); r.rotation.y = rot; r.castShadow = false; if (proche) r.renderOrder = 5; scene.add(r);
  }
  // Sol du terrain coupé lui aussi dans les coins
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    const t = new THREE.Shape(); t.moveTo(sx * L, sz * W); t.lineTo(sx * (L - P), sz * W); t.lineTo(sx * L, sz * (W - P)); t.closePath();
    const coin = new THREE.Mesh(new THREE.ShapeGeometry(t), mat(C.sol, { roughness: 1, side: THREE.DoubleSide })); coin.rotation.x = Math.PI / 2; coin.position.y = 0.002; scene.add(coin);
  }
  // Zones de tap-in : au milieu des deux grands côtés (EHBA 2.1.5)
  const tap: THREE.Mesh[] = [];
  for (const s of [1, -1]) {
    const proche = s === 1;
    const p = boite(TERRAIN.tapInDemi * 2, H * 0.8, 0.05, new THREE.MeshStandardMaterial({ color: C.jaune, emissive: C.jaune, emissiveIntensity: 0.15, transparent: proche, opacity: proche ? 0.55 : 1, depthWrite: !proche }), 0, H * 0.5, s * (W - 0.03));
    p.castShadow = false; if (proche) p.renderOrder = 6; scene.add(p); tap.push(p);
    const marque = new THREE.Mesh(new THREE.PlaneGeometry(TERRAIN.tapInDemi * 2, TERRAIN.tapInPortee), new THREE.MeshBasicMaterial({ color: C.jaune, transparent: true, opacity: 0.28, depthWrite: false }));
    marque.rotation.x = -Math.PI / 2; marque.position.set(0, 0.014, s * (W - TERRAIN.tapInPortee / 2)); scene.add(marque); tap.push(marque);
  }
  // Cages (EHBA 2.2)
  const rouge = mat(C.rouge), filet = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
  for (const s of [1, -1]) {
    const g = new THREE.Group(), w = TERRAIN.butDemiLargeur, h = TERRAIN.butHauteur, p = TERRAIN.butProfondeur, V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    g.add(tube(V(0, 0, -w), V(0, h, -w), 0.04, rouge), tube(V(0, 0, w), V(0, h, w), 0.04, rouge), tube(V(0, h, -w), V(0, h, w), 0.04, rouge));
    g.add(tube(V(0, h, -w), V(p, 0, -w), 0.025, rouge), tube(V(0, h, w), V(p, 0, w), 0.025, rouge), tube(V(p, 0, -w), V(p, 0, w), 0.025, rouge));
    const fond = new THREE.Mesh(new THREE.PlaneGeometry(w * 2, Math.hypot(h, p)), filet); fond.position.set(p / 2, h / 2, 0); fond.rotation.set(0, Math.PI / 2, 0); fond.rotateX(-Math.atan2(p, h)); g.add(fond);
    for (const z of [-w, w]) { const f = new THREE.Shape(); f.moveTo(0, 0); f.lineTo(0, h); f.lineTo(p, 0); const c = new THREE.Mesh(new THREE.ShapeGeometry(f), filet); c.position.z = z; g.add(c); }
    g.position.x = TERRAIN.ligneBut * s; if (s === -1) g.rotation.y = Math.PI;
    scene.add(g);
  }
  return { tap };
}

interface Joueur3D {
  racine: THREE.Group; penche: THREE.Group; roues: THREE.Object3D[]; maillet: THREE.Group; mats: THREE.Material[]; anneau: THREE.Mesh; fantome: boolean;
  /** Version détaillée : vélo et cycliste animés (absente tant que les ressources ne sont pas chargées). */
  detail?: { velo: Velo; cycliste: Cycliste; roue: number; pedalier: number; maillet: number; braquage: number };
}

/** Tenues des deux équipes : maillot, short, gants, chaussures, casque ; vélo : cadre, flasques, motif, sigle. */
const EQUIPES = [
  { maillot: "#2fb5bd", short: "#1b1f2a", gants: "#151515", chaussures: "#2a2d33", casque: "#fff25a", cadre: "#1a1a1a", flasqueAv: "#fff25a", flasqueAr: "#ff7f96", motif: "#1a1a1a", sigle: "BBP", scotch: "#ff7f96" },
  { maillot: "#9a6cf0", short: "#fcfbf5", gants: "#151515", chaussures: "#1b1b1b", casque: "#fcfbf5", cadre: "#fcfbf5", flasqueAv: "#ff7a2f", flasqueAr: "#9a6cf0", motif: "#1a1a1a", sigle: "BOT", scotch: "#ff7a2f" },
];
/** Décalage du vélo détaillé : ses roues sont centrées sur la position du joueur. */
const DECALAGE_VELO = -0.095;
/** Axe de direction du vélo détaillé (repère du vélo). */
const AXE_DIRECTION = new THREE.Vector3(-0.05, 0.14, 0).normalize();

function construireJoueurDetaille(res: Ressources, equipe: 0 | 1, genre: Genre, peau: Peau): Joueur3D {
  const E = EQUIPES[equipe];
  const racine = new THREE.Group(), penche = new THREE.Group(); racine.add(penche);
  const velo = creerVelo({ cadre: E.cadre, flasqueAv: E.flasqueAv, flasqueAr: E.flasqueAr, motif: E.motif, sigle: E.sigle });
  velo.groupe.position.x = DECALAGE_VELO; penche.add(velo.groupe);
  const cycliste = creerCycliste(res.modeles[genre], res.peaux[genre][peau], velo, E, { manche: "#c9ccd1", tete: "#fcfbf5", scotch: E.scotch });
  velo.groupe.add(cycliste.groupe);
  const mats: THREE.Material[] = [];
  penche.traverse((o) => { const m = (o as THREE.Mesh).material; if (m) for (const x of Array.isArray(m) ? m : [m]) if (!mats.includes(x)) mats.push(x); });
  const anneau = new THREE.Mesh(new THREE.RingGeometry(JOUEUR.rayon * 0.92, JOUEUR.rayon * 1.08, 40), new THREE.MeshBasicMaterial({ color: C.creme, transparent: true, opacity: 0.55, depthWrite: false }));
  anneau.rotation.x = -Math.PI / 2; anneau.position.y = 0.016; racine.add(anneau);
  return { racine, penche, roues: [], maillet: cycliste.maillet, mats, anneau, fantome: false, detail: { velo, cycliste, roue: 0, pedalier: 0, maillet: 0.25, braquage: 0 } };
}

function construireJoueur(couleurMaillot: string, couleurCadre: string, flasqueAv: string, flasqueAr: string): Joueur3D {
  const mats: THREE.MeshStandardMaterial[] = [];
  const M = (c: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => { const m = mat(c, o); mats.push(m); return m; };
  const racine = new THREE.Group(), penche = new THREE.Group(); racine.add(penche);
  const V = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);
  const pneu = M(C.encre), cadre = M(couleurCadre), acier = M("#c9ccd1", { metalness: 0.5, roughness: 0.4 });
  const roues: THREE.Object3D[] = [];
  for (const [x, coul] of [[-0.52, flasqueAr], [0.52, flasqueAv]] as [number, string][]) {
    const r = new THREE.Group();
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.035, 8, 24), pneu); t.castShadow = true; r.add(t);
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.02, 24), M(coul)); f.rotation.x = Math.PI / 2; f.castShadow = true; r.add(f);
    const trait = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.03), M(C.creme)); r.add(trait);
    r.position.set(x, 0.345, 0); penche.add(r); roues.push(r);
  }
  const AR = V(-0.52, 0.345), AV = V(0.52, 0.345), BB = V(-0.02, 0.31), SE = V(-0.2, 0.88), DI = V(0.36, 0.86);
  penche.add(tube(AR, BB, 0.022, cadre), tube(BB, SE, 0.024, cadre), tube(AR, SE, 0.018, cadre), tube(BB, DI, 0.026, cadre), tube(SE, DI, 0.024, cadre), tube(DI, AV, 0.022, cadre));
  penche.add(tube(DI, V(0.4, 1.0), 0.018, acier), tube(V(0.4, 1.0, -0.3), V(0.4, 1.0, 0.3), 0.016, acier));
  penche.add(boite(0.26, 0.05, 0.13, M(C.encre), -0.22, 0.93, 0));
  // Cycliste : formes simples
  const peau = M("#f0c9a0"), maillot = M(couleurMaillot), short = M("#2a2a30");
  const hanche = V(-0.2, 1.0), epaule = V(0.14, 1.42);
  const buste = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.36, 4, 10), maillot); buste.position.copy(hanche).add(epaule).multiplyScalar(0.5); buste.rotation.z = -Math.atan2(epaule.x - hanche.x, epaule.y - hanche.y); buste.castShadow = true; penche.add(buste);
  penche.add(boite(0.24, 0.16, 0.3, short, -0.18, 0.99, 0));
  for (const z of [-0.11, 0.11]) penche.add(tube(V(-0.16, 0.97, z), V(0.12, 0.68, z), 0.065, short), tube(V(0.12, 0.68, z), V(0.02, 0.33, z), 0.045, peau));
  const tete = new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 10), peau); tete.position.set(0.26, 1.6, 0); tete.castShadow = true; penche.add(tete);
  const casque = new THREE.Mesh(new THREE.SphereGeometry(0.135, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), M(C.rose)); casque.position.set(0.26, 1.61, 0); casque.castShadow = true; penche.add(casque);
  penche.add(tube(V(0.14, 1.4, -0.17), V(0.4, 1.02, -0.26), 0.04, maillot)); // bras gauche au guidon
  // Bras droit + maillet, articulés à l'épaule (côté droit = +z local)
  const maillet = new THREE.Group(); maillet.position.set(0.14, 1.4, 0.19);
  maillet.add(tube(V(0, 0, 0), V(0, -0.5, 0.05), 0.04, maillot));
  maillet.add(tube(V(0, -0.42, 0.05), V(0, -1.28, 0.16), 0.016, M(C.teal)));
  const teteM = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.13, 12), M(C.creme)); teteM.rotation.z = Math.PI / 2; teteM.position.set(0, -1.3, 0.16); teteM.castShadow = true; maillet.add(teteM);
  penche.add(maillet);
  const anneau = new THREE.Mesh(new THREE.RingGeometry(JOUEUR.rayon * 0.92, JOUEUR.rayon * 1.08, 40), new THREE.MeshBasicMaterial({ color: C.creme, transparent: true, opacity: 0.55, depthWrite: false }));
  anneau.rotation.x = -Math.PI / 2; anneau.position.y = 0.016; racine.add(anneau);
  return { racine, penche, roues, maillet, mats, anneau, fantome: false };
}

/**
 * `ressources` : chargement des personnages en cours. Tant qu'il n'est pas fini (ou s'il échoue),
 * les joueurs sont dessinés en formes simples ; ensuite ils sont reconstruits en version détaillée.
 */
export function creerRendu(conteneur: HTMLElement, ressources?: Promise<Ressources>): Rendu {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement; canvas.style.cssText = "display:block;width:100%;height:100%;touch-action:none;outline:none"; canvas.tabIndex = 0;
  conteneur.appendChild(canvas);
  const scene = new THREE.Scene(); scene.background = new THREE.Color("#2b3138");
  scene.add(new THREE.HemisphereLight("#ffffff", "#59616b", 1.15));
  const soleil = new THREE.DirectionalLight("#fff4dc", 1.7); soleil.castShadow = true; soleil.shadow.mapSize.set(2048, 2048); soleil.shadow.bias = -0.0004; soleil.shadow.normalBias = 0.02;
  Object.assign(soleil.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 80 }); soleil.shadow.camera.updateProjectionMatrix();
  scene.add(soleil, soleil.target);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  /** Direction caméra -> cible. L'attaque vers +x part en haut à droite de l'écran. */
  const DECALAGE = new THREE.Vector3(-1, 1.1, 1).normalize().multiplyScalar(60);
  const cible = new THREE.Vector3(-6, 0, 0);

  const { tap } = construireTerrain(scene);
  // Plots : lus dans l'état de la simulation (solides pour la balle et les joueurs)
  const matPlot = mat(C.orange), matBande = mat(C.creme), geoPlot = new THREE.ConeGeometry(PLOT.rayon, PLOT.hauteur, 16), geoBande = new THREE.CylinderGeometry(PLOT.rayon * 0.52, PLOT.rayon * 0.66, 0.07, 16), geoSocle = new THREE.BoxGeometry(PLOT.rayon * 2.3, 0.03, PLOT.rayon * 2.3);
  let plotsPoses = 0;
  const plots3D: THREE.Group[] = [];
  const joueurs3D: Joueur3D[] = [];
  let res: Ressources | null = null, aReconstruire = false;
  ressources?.then((r) => { res = r; aReconstruire = true; }).catch((err) => console.warn("Personnages non chargés, formes simples conservées :", err));
  /** Équipes mixtes au hasard : chaque place garde son personnage pendant toute la session. */
  const tirages: { genre: Genre; peau: Peau }[] = [];
  const tirage = (i: number) => (tirages[i] ??= { genre: Math.random() < 0.5 ? "h" : "f", peau: Math.random() < 0.5 ? "claire" : "foncee" });
  const palette: [string, string, string, string][] = [[C.teal, C.encre, C.jaune, C.rose], [C.violet, C.encre, C.creme, C.orange]];
  // Balle + ombre portée simplifiée (aide à lire la hauteur)
  const balle = new THREE.Mesh(new THREE.SphereGeometry(BALLE_RAYON_VISUEL, 18, 12), mat(C.orange, { roughness: 0.5 })); balle.castShadow = true; scene.add(balle);
  const ombre = new THREE.Mesh(new THREE.CircleGeometry(BALLE_RAYON_VISUEL * 1.15, 18), new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.35, depthWrite: false })); ombre.rotation.x = -Math.PI / 2; ombre.position.y = 0.018; scene.add(ombre);
  // Point visé + trait de visée
  const viseur = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.3, 32), new THREE.MeshBasicMaterial({ color: C.creme, transparent: true, opacity: 0.9, depthWrite: false })); viseur.rotation.x = -Math.PI / 2; viseur.position.y = 0.02; scene.add(viseur);
  const trait = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.07), new THREE.MeshBasicMaterial({ color: C.creme, transparent: true, opacity: 0.55, depthWrite: false })); trait.rotation.x = -Math.PI / 2; scene.add(trait);
  const COUL_FORCE = [new THREE.Color(C.tealClair), new THREE.Color(C.jaune), new THREE.Color(C.orange), new THREE.Color(C.rouge)];
  const couleurForce = new THREE.Color();
  /** Couleur de la jauge : teal -> jaune -> orange -> rouge. */
  function teinte(f: number) { const x = Math.min(0.999, f) * 3, i = Math.floor(x); return couleurForce.copy(COUL_FORCE[i]).lerp(COUL_FORCE[i + 1], x - i); }

  let largeur = 1, hauteur = 1, zoomCourant = ZOOM;
  function redimensionner() {
    largeur = Math.max(1, conteneur.clientWidth); hauteur = Math.max(1, conteneur.clientHeight);
    renderer.setSize(largeur, hauteur, false); cadrer();
  }
  function cadrer() {
    const ratio = largeur / hauteur, h = zoomCourant * (ratio < 1 ? 1.35 : 1);
    camera.left = -h * ratio; camera.right = h * ratio; camera.top = h; camera.bottom = -h; camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(redimensionner); ro.observe(conteneur); redimensionner();

  const rayon = new THREE.Raycaster(), ndc = new THREE.Vector2(), plan = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), touche = new THREE.Vector3();
  const lerpAngle = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
  let dernier = performance.now();

  function majJoueur(o: Joueur3D, j: Joueur, x: number, y: number, cap: number, dt: number, t: number, charge: number) {
    o.racine.position.set(x, 0, y); o.racine.rotation.y = -cap;
    // Inclinaison dans les virages, bascule au sol quand on tombe
    const cibleRoulis = j.etat === "auSol" ? 1.35 : THREE.MathUtils.clamp(j.rot * j.v * 0.035, -0.45, 0.45) + (j.risque > 0.25 ? Math.sin(t * 40) * 0.05 * j.risque : 0);
    o.penche.rotation.x += (cibleRoulis - o.penche.rotation.x) * Math.min(1, dt * (j.etat === "auSol" ? 9 : 12));
    if (o.detail) {
      const d = o.detail;
      // Roues et pédalier (développement : une tour de pédale = 2,6 tours de roue), braquage selon le virage
      d.roue += (j.v * dt) / 0.33; d.pedalier += (j.v * dt) / 0.33 / 2.6;
      d.velo.roueAr.rotation.z = -d.roue; d.velo.roueAv.rotation.z = -d.roue; d.velo.pedalier.rotation.z = -d.pedalier;
      const braq = THREE.MathUtils.clamp(-Math.atan((1.17 * j.rot) / Math.max(0.8, Math.abs(j.v))), -0.5, 0.5);
      d.braquage += (braq - d.braquage) * Math.min(1, dt * 10);
      d.velo.direction.quaternion.setFromAxisAngle(AXE_DIRECTION, d.braquage);
      // Maillet : armé pendant la charge (joueur), frappe fouettée vers l'avant puis retour au repos, balancement en roulant
      const f = j.tFrappe, amp = 0.5 + 0.8 * j.forceFrappe;
      let cible = 0.25 + Math.sin(d.pedalier * 2) * 0.06;
      if (charge > 0) cible = -0.35 - 1.0 * charge;
      else if (f < 0.12) cible = THREE.MathUtils.lerp(-amp, 0.95, f / 0.12);
      else if (f < 0.5) cible = THREE.MathUtils.lerp(0.95, 0.25, (f - 0.12) / 0.38);
      const vitesse = charge > 0 ? 8 : f < 0.12 ? 60 : 9;
      d.maillet += (cible - d.maillet) * Math.min(1, dt * vitesse);
      d.cycliste.poser({ pedalier: d.pedalier, maillet: d.maillet, buste: 1.0 + (charge > 0 ? 0.12 : 0) });
    } else {
      for (const r of o.roues) r.rotation.z -= (j.v * dt) / 0.345;
      // Geste de frappe : armé vers l'arrière puis fouetté vers l'avant
      const f = j.tFrappe, amp = 0.45 + 0.75 * j.forceFrappe;
      o.maillet.rotation.z = f < 0.28 ? Math.sin((f / 0.28) * Math.PI) * amp : 0;
    }
    const horsJeu = j.etat !== "actif";
    if (horsJeu !== o.fantome) { o.fantome = horsJeu; for (const m of o.mats) { m.transparent = horsJeu; m.opacity = horsJeu ? 0.38 : 1; m.depthWrite = !horsJeu; m.needsUpdate = true; } o.penche.traverse((x) => { x.castShadow = !horsJeu && (x as THREE.Mesh).isMesh; }); }
    const am = o.anneau.material as THREE.MeshBasicMaterial;
    am.color.set(horsJeu ? C.jaune : j.risque > 0.25 ? C.rouge : j.aLaBalle ? C.orange : j.id === 0 ? C.creme : j.equipe === 0 ? C.tealClair : C.violet);
    am.opacity = horsJeu ? 0.5 + Math.sin(t * 8) * 0.3 : 0.55 + j.risque * 0.4;
    o.anneau.scale.setScalar(1 + j.risque * 0.25);
  }

  return {
    canvas,
    rendre(e, prec, alpha, infos) {
      const maintenant = performance.now(), dt = Math.min(0.05, (maintenant - dernier) / 1000), t = maintenant / 1000; dernier = maintenant;
      for (; plotsPoses < e.plots.length; plotsPoses++) {
        const p = e.plots[plotsPoses], g = new THREE.Group();
        const c = new THREE.Mesh(geoPlot, matPlot); c.position.y = PLOT.hauteur / 2; c.castShadow = true; g.add(c);
        const bd = new THREE.Mesh(geoBande, matBande); bd.position.y = PLOT.hauteur * 0.48; g.add(bd);
        const so = new THREE.Mesh(geoSocle, matPlot); so.position.y = 0.015; so.castShadow = true; g.add(so);
        g.position.set(p.x, 0, p.y); scene.add(g); plots3D.push(g);
      }
      if (aReconstruire) { aReconstruire = false; for (const o of joueurs3D) scene.remove(o.racine); joueurs3D.length = 0; }
      while (joueurs3D.length < e.joueurs.length) {
        const i = joueurs3D.length, eq = e.joueurs[i].equipe, p = palette[eq];
        const o = res ? construireJoueurDetaille(res, eq, tirage(i).genre, tirage(i).peau) : construireJoueur(p[0], p[1], p[2], p[3]);
        joueurs3D.push(o); scene.add(o.racine);
      }
      e.joueurs.forEach((j, i) => {
        const p = prec.joueurs[i] ?? j;
        majJoueur(joueurs3D[i], j, p.x + (j.x - p.x) * alpha, p.y + (j.y - p.y) * alpha, lerpAngle(p.cap, j.cap, alpha), dt, t, i === 0 && !infos.masquerVisee ? infos.force : 0);
      });
      const b = e.balle, pb = prec.balle;
      const bx = pb.x + (b.x - pb.x) * alpha, by = pb.y + (b.y - pb.y) * alpha, bz = pb.z + (b.z - pb.z) * alpha;
      balle.position.set(bx, bz - BALLE.rayon + BALLE_RAYON_VISUEL, by);
      ombre.position.set(bx, 0.018, by); ombre.scale.setScalar(1 + bz * 0.5); (ombre.material as THREE.MeshBasicMaterial).opacity = Math.max(0.12, 0.38 - bz * 0.1);
      // Visée
      const moi = e.joueurs[0], mp = pointMaillet(moi);
      const aPortee = moi.etat === "actif" && b.dansBut === 0 && Math.hypot(b.x - mp.x, b.y - mp.y) <= MAILLET.portee && b.z <= MAILLET.hauteurMax;
      const coul = infos.force > 0 ? teinte(infos.force) : couleurForce.set(C.creme);
      viseur.position.set(infos.viseX, 0.02, infos.viseY); (viseur.material as THREE.MeshBasicMaterial).color.copy(coul); viseur.scale.setScalar(1 + infos.force * 0.6 + (infos.force >= 1 ? Math.sin(t * 25) * 0.08 : 0));
      trait.visible = aPortee && !infos.masquerVisee; viseur.visible = !infos.masquerVisee;
      if (aPortee) { const dx = infos.viseX - bx, dz = infos.viseY - by, len = Math.hypot(dx, dz); trait.scale.x = Math.max(0.01, len); trait.position.set(bx + dx / 2, 0.019, by + dz / 2); trait.rotation.z = -Math.atan2(dz, dx); trait.scale.y = 1 + infos.force * 2.5; (trait.material as THREE.MeshBasicMaterial).color.copy(coul); }
      // Zones de tap-in : elles clignotent quand le joueur est hors jeu
      const appel = moi.etat !== "actif" ? 0.5 + Math.sin(t * 8) * 0.5 : 0;
      for (const m of tap) { const mm = m.material as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial; if ("emissiveIntensity" in mm) mm.emissiveIntensity = 0.15 + appel * 0.9; else mm.opacity = 0.2 + appel * 0.45; }
      // Caméra : suit le joueur, un peu tirée vers la balle
      const jx = infos.suivreBalle ? bx : joueurs3D[0].racine.position.x, jz = infos.suivreBalle ? by : joueurs3D[0].racine.position.z;
      let ex = bx - jx, ez = by - jz; const d = Math.hypot(ex, ez), dmax = 7; if (d > dmax) { ex *= dmax / d; ez *= dmax / d; }
      const k = infos.couper ? 1 : 1 - Math.exp(-dt * (infos.suivreBalle ? 6 : 4));
      cible.x += (jx + ex * 0.35 - cible.x) * k; cible.z += (jz + ez * 0.35 - cible.z) * k;
      if (infos.couper) { zoomCourant = infos.zoom * ZOOM; cadrer(); }
      if (Math.abs(infos.zoom * ZOOM - zoomCourant) > 0.001) { zoomCourant += (infos.zoom * ZOOM - zoomCourant) * (1 - Math.exp(-dt * 6)); cadrer(); }
      camera.position.copy(cible).add(DECALAGE); camera.lookAt(cible);
      soleil.position.set(cible.x - 14, 30, cible.z - 10); soleil.target.position.copy(cible);
      renderer.render(scene, camera);
    },
    pointSol(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      rayon.setFromCamera(ndc, camera);
      const p = rayon.ray.intersectPlane(plan, touche);
      return p ? { x: THREE.MathUtils.clamp(p.x, -TERRAIN.demiL, TERRAIN.demiL), y: THREE.MathUtils.clamp(p.z, -TERRAIN.demiW, TERRAIN.demiW) } : null;
    },
    projeter(x, y, z) {
      const v = new THREE.Vector3(x, z, y).project(camera);
      return { sx: (v.x + 1) / 2 * largeur, sy: (1 - v.y) / 2 * hauteur };
    },
    redimensionner,
    vider() {
      for (const o of joueurs3D) scene.remove(o.racine);
      joueurs3D.length = 0;
      for (const g of plots3D) scene.remove(g);
      plots3D.length = 0; plotsPoses = 0;
    },
    appelsDeDessin: () => renderer.info.render.calls,
    detruire() {
      ro.disconnect();
      scene.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); const mm = m.material as THREE.Material | THREE.Material[] | undefined; if (Array.isArray(mm)) mm.forEach((x) => x.dispose()); else if (mm) mm.dispose(); });
      renderer.dispose(); canvas.remove();
    },
  };
}
