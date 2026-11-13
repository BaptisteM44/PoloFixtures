/**
 * Cycliste du jeu (jalon M0bis) : personnages Quaternius « Universal Base Characters » (CC0), homme ou femme,
 * habillés en code (maillot, short, gants, chaussures, casque aux couleurs du club),
 * posés sur le vélo par cinématique inverse : pieds aux pédales, main gauche serrée sur la poignée du guidon,
 * main droite serrée sur la poignée du maillet. Le personnage regarde vers +z dans son fichier ; on le tourne vers +x (sens du vélo).
 */
import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as clonerSquelette } from "three/examples/jsm/utils/SkeletonUtils.js";
import { creerMaillet, type CouleursMaillet, type Velo } from "./modeles";

export interface Tenue { maillot: string; short: string; gants: string; chaussures: string; casque: string }

export interface Cycliste {
  groupe: THREE.Group;
  maillet: THREE.Group;
  /** Pose complète pour une image : angle du pédalier, angle du maillet (0 = tête au sol sous l'épaule, + = vers l'avant), inclinaison du buste. */
  poser(p: { pedalier: number; maillet: number; buste?: number }): void;
}

/** Longueur de jambe de référence (hanche → cheville) : les personnages sont mis à cette échelle pour atteindre les pédales. */
const JAMBE = 0.885;
const DOIGTS = ["index", "middle", "ring", "pinky"];

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const pos = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());

/** Oriente un os pour que son enfant pointe vers une cible (repère monde). */
function viser(os: THREE.Bone, enfant: THREE.Object3D, cible: THREE.Vector3) {
  const p = os.getWorldPosition(_a), e = enfant.getWorldPosition(_b);
  const cur = e.sub(p).normalize(), des = _c.copy(cible).sub(p).normalize();
  if (cur.lengthSq() < 1e-8 || des.lengthSq() < 1e-8) return;
  const delta = _q.setFromUnitVectors(cur, des);
  const monde = os.getWorldQuaternion(_q2).premultiply(delta);
  const parent = os.parent!.getWorldQuaternion(new THREE.Quaternion()).invert();
  os.quaternion.copy(parent.multiply(monde));
  os.updateMatrixWorld(true);
}
/** Tourne un os autour d'un axe exprimé en repère monde. */
function tourner(os: THREE.Bone, axeMonde: THREE.Vector3, angle: number) {
  const monde = os.getWorldQuaternion(new THREE.Quaternion()).premultiply(new THREE.Quaternion().setFromAxisAngle(axeMonde, angle));
  const parent = os.parent!.getWorldQuaternion(new THREE.Quaternion()).invert();
  os.quaternion.copy(parent.multiply(monde));
  os.updateMatrixWorld(true);
}
/** Cinématique inverse à deux os (cuisse-mollet, bras-avant-bras). `pole` : point vers lequel plie l'articulation. */
function ik2(a: THREE.Bone, b: THREE.Bone, c: THREE.Bone, cible: THREE.Vector3, pole: THREE.Vector3) {
  const A = pos(a), B = pos(b), C = pos(c);
  const la = A.distanceTo(B), lb = B.distanceTo(C);
  const dir = cible.clone().sub(A); const d = Math.min(Math.max(dir.length(), 1e-4), (la + lb) * 0.999); dir.normalize();
  const cosA = (la * la + d * d - lb * lb) / (2 * la * d), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const p = pole.clone().sub(A); p.sub(dir.clone().multiplyScalar(p.dot(dir))).normalize();
  const coude = A.clone().add(dir.clone().multiplyScalar(la * cosA)).add(p.multiplyScalar(la * sinA));
  viser(a, b, coude);
  viser(b, c, A.clone().add(dir.multiplyScalar(d)));
}
/** Distance d'un point à une droite (point P0, direction unitaire u). */
function distDroite(p: THREE.Vector3, p0: THREE.Vector3, u: THREE.Vector3) {
  const v = p.clone().sub(p0); return v.sub(u.clone().multiplyScalar(v.dot(u))).length();
}

/** Repères du corps dans la pose de référence (en T), mesurés sur le squelette : servent à placer la tenue et à asseoir le personnage. */
interface Reperes { hanche: number; genou: number; epaule: number; epauleX: number; cou: number; mainX: number; pied: number }

/** Peint la tenue sur le corps à partir de la position de chaque point dans la pose de référence. */
function habiller(mat: THREE.MeshStandardMaterial, t: Tenue, r: Reperes) {
  const u = {
    uMaillot: { value: new THREE.Color(t.maillot) }, uShort: { value: new THREE.Color(t.short) },
    uGants: { value: new THREE.Color(t.gants) }, uChaussures: { value: new THREE.Color(t.chaussures) },
    uR1: { value: new THREE.Vector4(r.hanche, r.genou, r.epaule, r.epauleX) }, uR2: { value: new THREE.Vector4(r.cou, r.mainX, r.pied, 0) },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vRef;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvRef = position;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vRef;\nuniform vec3 uMaillot; uniform vec3 uShort; uniform vec3 uGants; uniform vec3 uChaussures; uniform vec4 uR1; uniform vec4 uR2;")
      .replace("#include <map_fragment>", `#include <map_fragment>
        {
          float hanche = uR1.x, genou = uR1.y, epaule = uR1.z, epX = uR1.w, cou = uR2.x, mainX = uR2.y, pied = uR2.z;
          float ax = abs(vRef.x); float y = vRef.y;
          float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
          float plis = 0.78 + 0.45 * smoothstep(0.08, 0.6, lum);
          float buste = step(hanche + 0.02, y) * step(y, cou + 0.025) * step(ax, epX * 1.11);
          float manche = step(epaule - 0.125, y) * step(epX * 0.8, ax) * step(ax, epX + (mainX - epX) * 0.36);
          float col = step(cou - 0.1, y) * step(y, cou + 0.045) * step(ax, 0.12);
          float maillot = max(max(buste, manche), col);
          float shortZ = step(genou + 0.08, y) * step(y, hanche + 0.03) * step(ax, 0.45);
          float gants = step(mainX - 0.05, ax) * step(epaule - 0.15, y);
          float chauss = step(y, pied + 0.05);
          vec3 c = diffuseColor.rgb;
          c = mix(c, uShort * plis, shortZ);
          c = mix(c, uMaillot * plis, maillot);
          c = mix(c, uGants * (0.85 + 0.3 * lum), gants);
          c = mix(c, uChaussures * (0.85 + 0.3 * lum), chauss);
          diffuseColor.rgb = c;
        }`);
  };
  mat.customProgramCacheKey = () => "tenue-polo";
}

export function creerCycliste(gltf: GLTF, peau: THREE.Texture, velo: Velo, tenue: Tenue, couleursMaillet: CouleursMaillet): Cycliste {
  const corps = clonerSquelette(gltf.scene) as THREE.Group;
  const os: Record<string, THREE.Bone> = {};
  corps.traverse((o) => { if ((o as THREE.Bone).isBone) os[o.name] = o as THREE.Bone; });
  // Repères mesurés dans la pose de référence, avant toute transformation
  corps.updateMatrixWorld(true);
  const P = (n: string) => pos(os[n]);
  const r: Reperes = {
    hanche: P("thigh_l").y, genou: P("calf_l").y, epaule: P("upperarm_l").y, epauleX: Math.abs(P("upperarm_l").x),
    cou: P("neck_01").y, mainX: Math.abs(P("hand_l").x), pied: P("foot_l").y,
  };
  const hancheRef = P("thigh_l").add(P("thigh_r")).multiplyScalar(0.5);
  const casqueRef = P("Head").add(new THREE.Vector3(0, 0.135, -0.01));
  corps.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isMesh) return;
    m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
    if (m.name.toLowerCase().startsWith("superhero")) {
      const mat = (m.material as THREE.MeshStandardMaterial).clone();
      mat.map = peau; habiller(mat, tenue, r); m.material = mat;
    }
  });
  // Mise à l'échelle : même longueur de jambe pour tout le monde, pour que les pieds atteignent les pédales
  const echelle = JAMBE / (r.hanche - r.pied);
  const pivot = new THREE.Group(); pivot.rotation.y = Math.PI / 2; pivot.scale.setScalar(echelle); pivot.add(corps);
  const groupe = new THREE.Group(); groupe.add(pivot);
  // Assis : milieu des hanches juste au-dessus de la selle (dans le repère du vélo)
  const hanche = hancheRef.clone().multiplyScalar(echelle).applyEuler(pivot.rotation);
  const s = velo.points.selle;
  pivot.position.set(s.x - hanche.x - 0.02, s.y + 0.05 - hanche.y, -hanche.z);
  const repos = new Map<THREE.Bone, THREE.Quaternion>();
  for (const b of Object.values(os)) repos.set(b, b.quaternion.clone());
  // Casque, accroché à la tête (repères pris dans la pose de référence)
  groupe.updateMatrixWorld(true);
  const tete = os["Head"];
  const centreRef = corps.localToWorld(casqueRef.clone());
  const casque = new THREE.Group();
  const coque = new THREE.Mesh(new THREE.SphereGeometry(0.128, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.56), new THREE.MeshPhysicalMaterial({ color: tenue.casque, roughness: 0.3, clearcoat: 0.8 }));
  coque.scale.set(1, 0.95, 1.12); coque.castShadow = true; casque.add(coque);
  const bord = new THREE.Mesh(new THREE.TorusGeometry(0.126, 0.008, 8, 40), new THREE.MeshStandardMaterial({ color: "#1a1a1a", roughness: 0.6 }));
  bord.rotation.x = Math.PI / 2; bord.position.y = 0.022; bord.scale.set(1, 1.12, 1); casque.add(bord);
  tete.add(casque);
  casque.position.copy(tete.worldToLocal(centreRef.clone()));
  casque.quaternion.copy(tete.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(corps.getWorldQuaternion(new THREE.Quaternion())));
  // Maillet, dans le repère du vélo
  const maillet = creerMaillet(couleursMaillet, 0.95);
  groupe.add(maillet);
  const avant = new THREE.Vector3(1, 0, 0), haut = new THREE.Vector3(0, 1, 0), droite = new THREE.Vector3(0, 0, 1);
  // Sens de flexion des doigts, trouvé au premier serrage pour chaque main
  const sensDoigts: Record<string, number> = {};

  /** Serre une main autour d'une barre (point G sur l'axe, direction unitaire u, tout en monde).
   *  `dos` : direction (monde) du dos de la main, perpendiculaire à la barre ; le poignet se place de ce côté. */
  function empoigner(cote: "l" | "r", G: THREE.Vector3, u: THREE.Vector3, dos: THREE.Vector3, pole: THREE.Vector3, longMain: number) {
    // La paume se pose sur la barre : le poignet est en retrait le long de l'axe de la main
    const axeMain = dos.clone().cross(u).normalize(); // perpendiculaire à la barre et au dos : direction poignet → doigts
    const poignet = G.clone().sub(axeMain.clone().multiplyScalar(longMain * 0.5)).add(dos.clone().multiplyScalar(0.012));
    ik2(os["upperarm_" + cote], os["lowerarm_" + cote], os["hand_" + cote], poignet, pole);
    viser(os["hand_" + cote], os["middle_01_" + cote], G.clone().add(axeMain.clone().multiplyScalar(0.04)).add(dos.clone().multiplyScalar(0.008)));
    // Roulis de la main : le dos de la main du côté voulu (on fait tourner autour de l'axe de la main)
    const main = os["hand_" + cote];
    const axeActuel = pos(os["middle_01_" + cote]).sub(pos(main)).normalize();
    const travers = pos(os["index_01_" + cote]).sub(pos(os["pinky_01_" + cote])).normalize();
    const voulu = u.clone().multiplyScalar(cote === "r" ? 1 : -1);
    const tProj = travers.sub(axeActuel.clone().multiplyScalar(travers.dot(axeActuel))).normalize();
    const vProj = voulu.sub(axeActuel.clone().multiplyScalar(voulu.dot(axeActuel))).normalize();
    const ang = Math.atan2(tProj.clone().cross(vProj).dot(axeActuel), tProj.dot(vProj));
    tourner(main, axeActuel, ang);
    // Doigts enroulés autour de la barre (flexion autour de l'axe local de chaque phalange), pouce refermé
    const k = cote, ax = new THREE.Vector3(1, 0, 0), sg = 1;
    const plier = (o: THREE.Bone, a: number) => { o.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(ax, sg * a)); };
    for (const d of DOIGTS) { plier(os[`${d}_01_${k}`], 1.1); plier(os[`${d}_02_${k}`], 1.3); plier(os[`${d}_03_${k}`], 0.9); }
    plier(os[`thumb_02_${k}`], 0.5); plier(os[`thumb_03_${k}`], 0.5);
    main.updateMatrixWorld(true);
    void sensDoigts; void distDroite;
  }

  const longMain = pos(os["middle_01_r"]).distanceTo(pos(os["hand_r"])) + 0.04;

  return {
    groupe, maillet,
    poser({ pedalier, maillet: th, buste = 1.0 }) {
      for (const [b, q] of repos) b.quaternion.copy(q);
      groupe.updateMatrixWorld(true);
      const W = (v: THREE.Vector3) => groupe.localToWorld(v.clone());
      const D = (v: THREE.Vector3) => W(v).sub(W(new THREE.Vector3())).normalize();
      const axeLat = D(droite);
      // Buste penché vers l'avant depuis les hanches, tête relevée pour regarder devant
      tourner(os["pelvis"], axeLat, -buste * 0.5);
      tourner(os["spine_01"], axeLat, -buste * 0.22);
      tourner(os["spine_02"], axeLat, -buste * 0.16);
      tourner(os["spine_03"], axeLat, -buste * 0.12);
      tourner(os["neck_01"], axeLat, buste * 0.5);
      tourner(os["Head"], axeLat, buste * 0.35);
      // Jambes : chevilles au-dessus des pédales, genoux vers l'avant
      const p = velo.pedales(pedalier);
      for (const [cote, ped] of [["l", p.g], ["r", p.d]] as [string, THREE.Vector3][]) {
        const cheville = W(ped.clone().add(new THREE.Vector3(-0.06, 0.085, 0)));
        const genou = W(ped.clone().add(new THREE.Vector3(0.6, 0.6, 0)));
        ik2(os["thigh_" + cote], os["calf_" + cote], os["foot_" + cote], cheville, genou);
        viser(os["foot_" + cote], os["ball_" + cote], W(ped.clone().add(new THREE.Vector3(0.06, 0.02, 0))));
      }
      // Main gauche serrée sur la poignée gauche : barre selon z, dos de la main vers le haut et l'avant
      const g = velo.points.guidonG;
      empoigner("l", W(g.clone().add(new THREE.Vector3(0, 0, -0.01))), D(droite), D(new THREE.Vector3(0.35, 1, 0)), W(g.clone().add(new THREE.Vector3(-0.4, 0.1, -0.5))), longMain);
      // Main droite et maillet : le bras balance depuis l'épaule ; le manche prolonge le geste
      const epaule = groupe.worldToLocal(pos(os["upperarm_r"]));
      const phi = th * 0.75;
      const main = epaule.clone().add(avant.clone().multiplyScalar(Math.sin(phi) * 0.5)).add(haut.clone().multiplyScalar(-Math.cos(phi) * 0.5)).add(droite.clone().multiplyScalar(0.14));
      const L = 0.95, prise = 0.07; // la paume serre le manche à 7 cm du bouchon
      const vert = Math.min(0.999, Math.max(0.2, (main.y + prise - 0.035) / L));
      const lat = Math.sqrt(1 - vert * vert);
      const dirGeste = avant.clone().multiplyScalar(Math.sin(th)).add(haut.clone().multiplyScalar(-Math.cos(th)));
      const dir = dirGeste.multiplyScalar(vert).add(droite.clone().multiplyScalar(lat)).normalize();
      const sommet = main.clone().sub(dir.clone().multiplyScalar(prise));
      maillet.position.copy(sommet);
      maillet.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
      // Dos de la main vers l'extérieur (côté droit), perpendiculaire au manche
      const dosL = droite.clone().sub(dir.clone().multiplyScalar(droite.dot(dir))).normalize();
      empoigner("r", W(main), D(dir), D(dosL), W(main.clone().add(new THREE.Vector3(-0.3, 0.2, 0.5))), longMain);
    },
  };
}
