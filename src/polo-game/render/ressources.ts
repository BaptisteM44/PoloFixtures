/**
 * Chargement des ressources 3D du jeu : personnages (homme, femme) et leurs textures de peau (claire, foncée).
 * Les adresses peuvent être des fichiers (`/polo-game/cycliste-h.glb`) ou des données intégrées (`data:...;base64,...`),
 * utile pour une page de test autonome.
 */
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

export type Genre = "h" | "f";
export type Peau = "claire" | "foncee";

export interface AdressesRessources { modeles: Record<Genre, string>; peaux: Record<Genre, Record<Peau, string>> }
export interface Ressources { modeles: Record<Genre, GLTF>; peaux: Record<Genre, Record<Peau, THREE.Texture>> }

/** Adresses par défaut, sous un dossier public (ex. `/polo-game`). */
export function adressesDans(dossier: string): AdressesRessources {
  const d = dossier.replace(/\/$/, "");
  return {
    modeles: { h: `${d}/cycliste-h.glb`, f: `${d}/cycliste-f.glb` },
    peaux: { h: { claire: `${d}/peau-h-claire.jpg`, foncee: `${d}/peau-h-foncee.jpg` }, f: { claire: `${d}/peau-f-claire.jpg`, foncee: `${d}/peau-f-foncee.jpg` } },
  };
}

/** Lit un fichier binaire en suivant la progression (en octets) ; décode directement les données intégrées. */
async function lireBinaire(url: string, progres: (recus: number, total: number) => void): Promise<ArrayBuffer> {
  if (url.startsWith("data:")) {
    const b64 = url.slice(url.indexOf(",") + 1), octets = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    progres(octets.length, octets.length); return octets.buffer;
  }
  const rep = await fetch(url);
  if (!rep.ok || !rep.body) throw new Error(`Chargement impossible : ${url} (${rep.status})`);
  const total = Number(rep.headers.get("content-length")) || 0, morceaux: Uint8Array[] = [];
  const lecteur = rep.body.getReader(); let recus = 0;
  for (;;) { const { done, value } = await lecteur.read(); if (done) break; morceaux.push(value); recus += value.length; progres(recus, total || recus); }
  const tout = new Uint8Array(recus); let i = 0; for (const m of morceaux) { tout.set(m, i); i += m.length; }
  return tout.buffer;
}

function lireTexture(url: string): Promise<THREE.Texture> {
  return new Promise((ok, ko) => new THREE.TextureLoader().load(url, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; ok(t); }, undefined, ko));
}

/** Charge tout ; `progression` reçoit un nombre de 0 à 1. */
export async function chargerRessources(a: AdressesRessources, progression: (p: number) => void = () => {}): Promise<Ressources> {
  const etat: Record<string, [number, number]> = { h: [0, 1], f: [0, 1] };
  let textures = 0;
  const maj = () => { const r = etat.h[0] + etat.f[0], t = Math.max(r, etat.h[1] + etat.f[1]); progression(Math.min(1, (r / t) * 0.9 + (textures / 4) * 0.1)); };
  const lireModele = async (g: Genre) => {
    const buf = await lireBinaire(a.modeles[g], (r, t) => { etat[g] = [r, t]; maj(); });
    return new Promise<GLTF>((ok, ko) => new GLTFLoader().parse(buf, "", ok, ko));
  };
  const tex = (u: string) => lireTexture(u).then((t) => { textures++; maj(); return t; });
  const [h, f, hc, hf, fc, ff] = await Promise.all([lireModele("h"), lireModele("f"), tex(a.peaux.h.claire), tex(a.peaux.h.foncee), tex(a.peaux.f.claire), tex(a.peaux.f.foncee)]);
  progression(1);
  return { modeles: { h, f }, peaux: { h: { claire: hc, foncee: hf }, f: { claire: fc, foncee: ff } } };
}
