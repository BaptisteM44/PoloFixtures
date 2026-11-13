/**
 * Modèles du jeu construits en code (jalon M0bis) : vélo de polo et maillet détaillés.
 * Unités : mètres. Le vélo regarde vers +x, roues au sol (y = 0). Côté droit du cycliste = +z
 * (transmission et maillet), côté gauche = -z (levier de frein).
 * Tout est recolorable (couleurs de club) et partage ses matériaux pour limiter les appels de dessin.
 */
import * as THREE from "three";

export interface CouleursVelo {
  cadre: string;
  /** Flasques (couvre-roues) avant et arrière, et couleur du motif. */
  flasqueAv: string;
  flasqueAr: string;
  motif: string;
  /** Texte ou initiales du club peint sur les flasques. */
  sigle?: string;
}

export interface Velo {
  groupe: THREE.Group;
  /** À faire tourner (axe local z) pour animer. */
  roueAv: THREE.Object3D;
  roueAr: THREE.Object3D;
  pedalier: THREE.Object3D;
  /** Guidon (pivote autour de l'axe de direction). */
  direction: THREE.Object3D;
  /** Points utiles pour placer le cycliste (repère du vélo). */
  points: { selle: THREE.Vector3; guidonG: THREE.Vector3; guidonD: THREE.Vector3; pedalier: THREE.Vector3 };
  /** Positions des pédales dans le repère du vélo, selon l'angle du pédalier. */
  pedales(angle: number): { g: THREE.Vector3; d: THREE.Vector3 };
  liberer(): void;
}

const V = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);

/** Tube entre deux points, avec des rotules aux extrémités pour des jonctions propres. */
function tube(a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material, rotules = true, r2 = r): THREE.Object3D {
  const g = new THREE.Group();
  const len = a.distanceTo(b);
  const c = new THREE.Mesh(new THREE.CylinderGeometry(r2, r, len, 14, 1), m);
  c.position.copy(a).add(b).multiplyScalar(0.5);
  c.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
  g.add(c);
  if (rotules) for (const [p, rr] of [[a, r], [b, r2]] as [THREE.Vector3, number][]) { const s = new THREE.Mesh(new THREE.SphereGeometry(rr * 1.02, 12, 8), m); s.position.copy(p); g.add(s); }
  g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
  return g;
}
/** Tube courbe le long de points (fourche, haubans cintrés, chaîne). */
function tubeCourbe(pts: THREE.Vector3[], r: number, m: THREE.Material, seg = 24): THREE.Mesh {
  const me = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, 10, false), m);
  me.castShadow = true; me.receiveShadow = true; return me;
}

/** Texture de flasque : disque coloré, motif en quartiers, sigle au centre. */
function textureFlasque(fond: string, motif: string, sigle: string): THREE.CanvasTexture {
  const c = document.createElement("canvas"); c.width = c.height = 512;
  const g = c.getContext("2d")!;
  g.fillStyle = fond; g.fillRect(0, 0, 512, 512);
  // Quartiers façon flasque peinte à la main
  g.save(); g.translate(256, 256);
  g.fillStyle = motif;
  for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 260, (i * Math.PI) / 2, (i * Math.PI) / 2 + Math.PI / 6); g.closePath(); g.fill(); }
  // Anneau extérieur et intérieur
  g.lineWidth = 18; g.strokeStyle = "#1a1a1a"; g.beginPath(); g.arc(0, 0, 238, 0, Math.PI * 2); g.stroke();
  // Moyeu au centre, sigle du club sur une étiquette dans le bas de la flasque
  g.fillStyle = "#fcfbf5"; g.beginPath(); g.arc(0, 0, 46, 0, Math.PI * 2); g.fill(); g.lineWidth = 8; g.stroke();
  const fs = sigle.length > 3 ? 46 : 60; g.font = `800 ${fs}px system-ui, sans-serif`;
  const lw = g.measureText(sigle).width + 36;
  g.fillStyle = "#fcfbf5"; g.lineWidth = 7; g.beginPath(); if (g.roundRect) g.roundRect(-lw / 2, 92, lw, fs + 22, 14); else g.rect(-lw / 2, 92, lw, fs + 22); g.fill(); g.stroke();
  g.fillStyle = "#1a1a1a"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(sigle, 0, 92 + (fs + 22) / 2 + 3);
  // Usure : petites rayures
  g.globalAlpha = 0.18; g.strokeStyle = "#ffffff"; g.lineWidth = 2;
  for (let i = 0; i < 40; i++) { const a = Math.random() * Math.PI * 2, r0 = 110 + Math.random() * 120; g.beginPath(); g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); g.lineTo(Math.cos(a + 0.05) * (r0 + 14), Math.sin(a + 0.05) * (r0 + 14)); g.stroke(); }
  g.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

/** Roue : pneu sculpté, jante, moyeu, et deux flasques légèrement bombées. */
function roue(flasque: THREE.Texture, mats: Record<string, THREE.Material>, rayon = 0.33): THREE.Group {
  const g = new THREE.Group();
  const pneu = new THREE.Mesh(new THREE.TorusGeometry(rayon - 0.026, 0.026, 12, 56), mats.pneu); g.add(pneu);
  // Crampons discrets sur la bande de roulement
  const cramp = new THREE.InstancedMesh(new THREE.BoxGeometry(0.008, 0.005, 0.026), mats.pneu, 48);
  const o = new THREE.Object3D();
  for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; o.position.set(Math.cos(a) * (rayon - 0.002), Math.sin(a) * (rayon - 0.002), 0); o.rotation.set(0, 0, a); o.updateMatrix(); cramp.setMatrixAt(i, o.matrix); }
  g.add(cramp);
  const jante = new THREE.Mesh(new THREE.TorusGeometry(rayon - 0.055, 0.011, 8, 56), mats.alu); g.add(jante);
  // Flasques : disques légèrement bombés, un par côté. Le disque de base regarde vers +z (texture à l'endroit) ;
  // celui de l'autre côté est tourné d'un demi-tour autour de y, ce qui le garde lisible depuis -z.
  const Rf = rayon - 0.055;
  const geoF = new THREE.CircleGeometry(Rf, 48, 0, Math.PI * 2);
  const pos = geoF.attributes.position;
  for (let i = 0; i < pos.count; i++) { const r = Math.hypot(pos.getX(i), pos.getY(i)) / Rf; pos.setZ(i, 0.022 * (1 - r * r)); }
  geoF.computeVertexNormals();
  const matF = new THREE.MeshPhysicalMaterial({ map: flasque, roughness: 0.55, clearcoat: 0.35, clearcoatRoughness: 0.4 });
  for (const s of [1, -1]) { const f = new THREE.Mesh(geoF, matF); if (s === -1) f.rotation.y = Math.PI; f.position.z = s * 0.006; f.castShadow = true; g.add(f); }
  const moyeu = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.075, 16), mats.alu); moyeu.rotation.x = Math.PI / 2; g.add(moyeu);
  g.traverse((x) => { x.castShadow = true; });
  return g;
}

export function creerVelo(c: CouleursVelo): Velo {
  const groupe = new THREE.Group();
  const mats = {
    cadre: new THREE.MeshPhysicalMaterial({ color: c.cadre, roughness: 0.35, metalness: 0.15, clearcoat: 0.8, clearcoatRoughness: 0.2 }),
    alu: new THREE.MeshStandardMaterial({ color: "#c9ccd1", roughness: 0.32, metalness: 0.85 }),
    noir: new THREE.MeshStandardMaterial({ color: "#1d1d20", roughness: 0.6, metalness: 0.2 }),
    pneu: new THREE.MeshStandardMaterial({ color: "#1a1a1c", roughness: 0.9, metalness: 0 }),
    selle: new THREE.MeshStandardMaterial({ color: "#232326", roughness: 0.75 }),
    chaine: new THREE.MeshStandardMaterial({ color: "#6d6f75", roughness: 0.45, metalness: 0.8 }),
  };
  // Géométrie d'un vélo de polo : empattement court, boîtier bas, roues de 26 pouces
  const R = 0.33;
  const AR = V(-0.49, R), AV = V(0.68, R), BB = V(0, 0.29);
  const ST = V(-0.13, 0.78), HT_H = V(0.45, 0.8), HT_B = V(0.5, 0.66);
  const zc = 0.065; // écartement des bases et haubans
  // Cadre
  groupe.add(tube(BB, ST, 0.017, mats.cadre), tube(HT_H, ST, 0.016, mats.cadre), tube(BB, HT_B, 0.02, mats.cadre, true, 0.018), tube(HT_B, HT_H, 0.021, mats.cadre));
  for (const s of [1, -1]) {
    groupe.add(tube(V(BB.x - 0.02, BB.y, s * 0.03), V(AR.x, AR.y, s * zc), 0.011, mats.cadre));
    groupe.add(tube(V(ST.x + 0.01, ST.y - 0.04, s * 0.012), V(AR.x, AR.y, s * zc), 0.009, mats.cadre));
  }
  groupe.add(tube(V(AR.x + 0.06, AR.y + 0.09, -zc), V(AR.x + 0.06, AR.y + 0.09, zc), 0.006, mats.cadre, false)); // pont de haubans
  // Tige de selle et selle
  const tige = tube(ST, V(ST.x - 0.04, ST.y + 0.15), 0.0135, mats.alu, false); groupe.add(tige);
  const formeSelle = new THREE.Shape();
  formeSelle.moveTo(-0.13, -0.075); formeSelle.quadraticCurveTo(-0.15, 0, -0.13, 0.075); formeSelle.quadraticCurveTo(-0.02, 0.07, 0.05, 0.03);
  formeSelle.lineTo(0.13, 0.018); formeSelle.quadraticCurveTo(0.15, 0, 0.13, -0.018); formeSelle.lineTo(0.05, -0.03); formeSelle.quadraticCurveTo(-0.02, -0.07, -0.13, -0.075);
  const selle = new THREE.Mesh(new THREE.ExtrudeGeometry(formeSelle, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 3, curveSegments: 10 }), mats.selle);
  selle.rotation.x = -Math.PI / 2; selle.position.set(ST.x - 0.03, ST.y + 0.16, 0); selle.castShadow = true; groupe.add(selle);
  // Direction : fourche cintrée, potence courte, cintre plat avec poignées et levier de frein à gauche
  const direction = new THREE.Group(); direction.position.copy(HT_B); groupe.add(direction);
  const axe = HT_H.clone().sub(HT_B).normalize();
  const L = (p: THREE.Vector3) => p.clone().sub(HT_B);
  for (const s of [1, -1]) direction.add(tubeCourbe([L(V(HT_B.x, HT_B.y - 0.02, s * 0.03)), L(V(0.58, 0.5, s * 0.048)), L(V(AV.x - 0.005, AV.y + 0.02, s * 0.052)), L(V(AV.x, AV.y, s * 0.052))], 0.011, mats.cadre, 16));
  const pivot = L(HT_H).add(axe.clone().multiplyScalar(0.05));
  direction.add(tube(L(HT_H), pivot, 0.016, mats.noir, false));
  const potence = pivot.clone().add(V(-0.01, 0.08, 0));
  direction.add(tube(pivot, potence, 0.016, mats.noir));
  direction.add(tube(V(potence.x, potence.y, -0.29), V(potence.x, potence.y, 0.29), 0.011, mats.alu, false));
  for (const s of [1, -1]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.0165, 0.0165, 0.12, 12), mats.noir); p.rotation.x = Math.PI / 2; p.position.set(potence.x, potence.y, s * 0.24); p.castShadow = true; direction.add(p);
  }
  direction.add(tube(V(potence.x, potence.y, -0.19), V(potence.x + 0.11, potence.y - 0.03, -0.2), 0.006, mats.alu)); // levier de frein, à gauche
  // Roues
  const roueAr = roue(textureFlasque(c.flasqueAr, c.motif, c.sigle ?? "BBP"), mats, R); roueAr.position.copy(AR); groupe.add(roueAr);
  const roueAvPivot = new THREE.Group(); roueAvPivot.position.copy(L(AV)); direction.add(roueAvPivot);
  const roueAv = roue(textureFlasque(c.flasqueAv, c.motif, c.sigle ?? "BBP"), mats, R); roueAvPivot.add(roueAv);
  // Transmission : plateau, pignon, chaîne (côté droit = +z), manivelles et pédales
  const pedalier = new THREE.Group(); pedalier.position.copy(BB); groupe.add(pedalier);
  const plateau = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.004, 32), mats.alu); plateau.rotation.x = Math.PI / 2; plateau.position.z = 0.045; pedalier.add(plateau);
  const pignon = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.004, 20), mats.alu); pignon.rotation.x = Math.PI / 2; pignon.position.set(AR.x, AR.y, 0.045); groupe.add(pignon);
  for (const s of [1, -1]) groupe.add(tube(V(BB.x, BB.y + s * 0.086, 0.045), V(AR.x, AR.y + s * 0.033, 0.045), 0.004, mats.chaine, false));
  const pedales: THREE.Object3D[] = [];
  for (const s of [1, -1]) {
    const bras = new THREE.Group(); bras.rotation.z = s === 1 ? 0 : Math.PI; pedalier.add(bras);
    const m = tube(V(0, 0, s * 0.06), V(0, -0.165, s * 0.07), 0.009, mats.alu); bras.add(m);
    const ped = new THREE.Group(); ped.position.set(0, -0.165, s * 0.11); bras.add(ped);
    const plat = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.018, 0.09), mats.noir); plat.castShadow = true; ped.add(plat);
    pedales.push(ped);
  }
  const p0 = new THREE.Vector3();
  return {
    groupe, roueAv, roueAr, pedalier, direction,
    points: { selle: V(ST.x - 0.04, ST.y + 0.2), guidonG: V(HT_B.x + potence.x, HT_B.y + potence.y, -0.24), guidonD: V(HT_B.x + potence.x, HT_B.y + potence.y, 0.24), pedalier: BB.clone() },
    pedales(angle: number) {
      // Angle 0 : pédale droite en bas. Le pédalier tourne avec rotation.z = -angle.
      const d = V(BB.x - Math.sin(angle) * 0.165, BB.y - Math.cos(angle) * 0.165, 0.11);
      const g = V(BB.x + Math.sin(angle) * 0.165, BB.y + Math.cos(angle) * 0.165, -0.11);
      void p0; return { g, d };
    },
    liberer() { groupe.traverse((o) => { const me = o as THREE.Mesh; me.geometry?.dispose(); const ma = me.material as THREE.Material | THREE.Material[] | undefined; if (Array.isArray(ma)) ma.forEach((x) => x.dispose()); else ma?.dispose(); }); },
  };
}

export interface CouleursMaillet { manche: string; tete: string; scotch: string }

/** Maillet de polo : manche alu, grip, tête en tube (ouverte d'un côté), vis de serrage. Origine en haut du grip, manche vers -y. */
export function creerMaillet(c: CouleursMaillet, longueur = 0.95): THREE.Group {
  const g = new THREE.Group();
  const alu = new THREE.MeshStandardMaterial({ color: c.manche, roughness: 0.3, metalness: 0.75 });
  const grip = new THREE.MeshStandardMaterial({ color: "#1d1d20", roughness: 0.85 });
  const tete = new THREE.MeshStandardMaterial({ color: c.tete, roughness: 0.55, metalness: 0.02 });
  const scotch = new THREE.MeshStandardMaterial({ color: c.scotch, roughness: 0.7 });
  const L = longueur, rt = 0.031, lt = 0.13;
  g.add(tube(V(0, 0), V(0, -L + rt), 0.0105, alu, false, 0.0085));
  const gr = new THREE.Mesh(new THREE.CylinderGeometry(0.0145, 0.0135, 0.26, 14), grip); gr.position.y = -0.13; g.add(gr);
  for (let i = 0; i < 8; i++) { const a = new THREE.Mesh(new THREE.TorusGeometry(0.0145, 0.0018, 6, 16), grip); a.rotation.x = Math.PI / 2; a.position.y = -0.02 - i * 0.03; g.add(a); }
  const bouchon = new THREE.Mesh(new THREE.SphereGeometry(0.016, 12, 8), grip); bouchon.scale.y = 0.5; g.add(bouchon);
  // Tête : tube horizontal ouvert, dans l'axe de frappe (x)
  const prof = [new THREE.Vector2(rt, -lt / 2), new THREE.Vector2(rt, lt / 2), new THREE.Vector2(rt - 0.005, lt / 2), new THREE.Vector2(rt - 0.005, -lt / 2)];
  const teteM = new THREE.Mesh(new THREE.LatheGeometry(prof, 28), tete); teteM.rotation.z = Math.PI / 2; teteM.position.y = -L; g.add(teteM);
  const fond = new THREE.Mesh(new THREE.CircleGeometry(rt, 28), tete); fond.rotation.y = -Math.PI / 2; fond.position.set(-lt / 2, -L, 0); g.add(fond);
  const bande = new THREE.Mesh(new THREE.CylinderGeometry(rt + 0.0015, rt + 0.0015, 0.03, 28, 1, true), scotch); bande.rotation.z = Math.PI / 2; bande.position.set(0.035, -L, 0); g.add(bande);
  const vis = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.012, 8), alu); vis.position.set(0, -L + rt + 0.004, 0); g.add(vis);
  g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
  return g;
}
