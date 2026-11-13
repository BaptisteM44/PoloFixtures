/**
 * Entrées -> commande abstraite pour la simulation. Trois façons de jouer, utilisables ensemble :
 * - clavier + souris : ZQSD/flèches, espace pour freiner, on vise et on frappe à la souris ;
 * - manette (API Gamepad) : stick gauche, stick droit pour viser, gâchette droite pour frapper, B ou gâchette gauche pour freiner ;
 * - tactile : joystick virtuel à gauche, bouton de frein, on touche le terrain pour viser et frapper.
 * Le déplacement est relatif à l'écran (vue iso). La force vient de la durée de l'appui (jauge continue).
 * Les touches sont lues par position physique (`code`) : ZQSD sur AZERTY = WASD sur QWERTY.
 */
import { forceDepuisDuree } from "../sim/constantes";
import type { Commande } from "../sim/types";

const R2 = Math.SQRT1_2;
/** Vecteurs « droite de l'écran » et « haut de l'écran » exprimés sur le terrain (voir la caméra iso). */
const ECRAN_DROITE = { x: R2, y: R2 };
const ECRAN_HAUT = { x: R2, y: -R2 };
const versTerrain = (ex: number, eh: number) => ({ x: ECRAN_DROITE.x * ex + ECRAN_HAUT.x * eh, y: ECRAN_DROITE.y * ex + ECRAN_HAUT.y * eh });

export type Peripherique = "clavier" | "manette" | "tactile";

export interface Entrees {
  /** Commande du pas courant. `tir` n'est renvoyé qu'une fois, au relâchement. */
  lire(): Commande;
  /** Force en cours de dosage : 0 si on n'appuie pas, sinon entre 0 et 1. */
  forceEnCours(): number;
  /** Dernier périphérique utilisé (pour adapter l'aide affichée). */
  peripherique(): Peripherique;
  detruire(): void;
}

export interface Ancre { x: number; y: number; cap: number }

export function creerEntrees(cible: HTMLElement, pointSol: (clientX: number, clientY: number) => { x: number; y: number } | null, ancre: () => Ancre, calqueTactile: HTMLElement): Entrees {
  const touches = new Set<string>();
  let vise = { x: 0, y: 0 };
  let appuiDepuis = -1, pointeurVisee = -1;
  let tirEnAttente = 0;
  let dernier: Peripherique = matchMedia("(pointer: coarse)").matches ? "tactile" : "clavier";
  const JEU = ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"];
  const maintenant = () => performance.now();
  const relacher = () => { if (appuiDepuis < 0) return; tirEnAttente = forceDepuisDuree((maintenant() - appuiDepuis) / 1000); appuiDepuis = -1; };

  // --- Clavier
  const kd = (e: KeyboardEvent) => { if (JEU.includes(e.code)) { touches.add(e.code); e.preventDefault(); dernier = "clavier"; } };
  const ku = (e: KeyboardEvent) => { touches.delete(e.code); };
  // --- Souris et doigt sur le terrain : viser, maintenir, relâcher
  const viser = (e: PointerEvent) => { if (pointeurVisee >= 0 && e.pointerId !== pointeurVisee) return; const p = pointSol(e.clientX, e.clientY); if (p) vise = p; if (e.pointerType === "mouse") dernier = "clavier"; };
  const pd = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pointeurVisee = e.pointerId; dernier = e.pointerType === "touch" ? "tactile" : "clavier"; viser(e);
    appuiDepuis = maintenant(); try { cible.setPointerCapture(e.pointerId); } catch { /* sans gravité */ } e.preventDefault();
  };
  const pu = (e: PointerEvent) => { if (e.pointerId !== pointeurVisee) return; viser(e); relacher(); pointeurVisee = -1; };
  const perdu = () => { touches.clear(); appuiDepuis = -1; pointeurVisee = -1; joy.actif = -1; joy.x = joy.y = 0; visee.actif = -1; freinTactile = false; };
  const menu = (e: Event) => e.preventDefault();
  window.addEventListener("keydown", kd); window.addEventListener("keyup", ku); window.addEventListener("blur", perdu);
  cible.addEventListener("pointermove", viser); cible.addEventListener("pointerdown", pd); cible.addEventListener("pointerup", pu);
  cible.addEventListener("pointercancel", perdu); cible.addEventListener("contextmenu", menu);

  // --- Tactile : joystick à gauche ; à droite FRAPPER (maintenir = charger, glisser = viser) et FREIN.
  // Les éléments sont posés dans `calqueTactile` ; c'est `index.ts` qui place ce calque sur le jeu ou en dessous.
  const joy = { actif: -1, cx: 0, cy: 0, x: 0, y: 0 };
  const visee = { actif: -1, cx: 0, cy: 0, x: 0, y: 0 };
  let freinTactile = false;
  const mk = (css: string, texte = "") => { const d = document.createElement("div"); d.style.cssText = css; d.textContent = texte; return d; };
  const POLICE = "font:700 13px var(--font-chakra, system-ui),system-ui,sans-serif;letter-spacing:.06em;color:#fcfbf5;user-select:none;-webkit-user-select:none";
  const zoneJoy = mk("position:absolute;left:0;bottom:0;width:50%;height:100%;touch-action:none;pointer-events:auto");
  const baseJoy = mk("position:absolute;left:22px;bottom:22px;width:130px;height:130px;border-radius:50%;border:2px solid rgba(252,251,245,.55);background:rgba(26,26,26,.35);pointer-events:none");
  const boutonJoy = mk("position:absolute;left:41px;top:41px;width:48px;height:48px;border-radius:50%;background:rgba(252,251,245,.85);box-shadow:0 2px 0 rgba(0,0,0,.3);pointer-events:none");
  baseJoy.appendChild(boutonJoy); zoneJoy.appendChild(baseJoy);
  const frapper = mk(`position:absolute;right:22px;bottom:30px;width:96px;height:96px;border-radius:50%;border:2px solid #1a1a1a;background:#ff7f96;box-shadow:0 4px 0 #1a1a1a;display:flex;align-items:center;justify-content:center;touch-action:none;pointer-events:auto;${POLICE}`, "FRAPPER");
  const fleche = mk("position:absolute;left:50%;top:50%;width:0;height:4px;background:#fcfbf5;border-radius:2px;transform-origin:0 50%;pointer-events:none;opacity:.9");
  frapper.appendChild(fleche);
  const frein = mk(`position:absolute;right:132px;bottom:18px;width:66px;height:66px;border-radius:50%;border:2px solid #1a1a1a;background:#60c9cf;box-shadow:0 4px 0 #1a1a1a;display:flex;align-items:center;justify-content:center;touch-action:none;pointer-events:auto;${POLICE}`, "FREIN");
  calqueTactile.append(zoneJoy, frapper, frein);
  const R = 56, RV = 60;
  /**
   * Branche un contrôle tactile. Sur les appareils tactiles, on écoute les événements « touch » (fiables sur iPhone,
   * y compris dans une page intégrée à une autre application, où les événements « pointer » peuvent être annulés
   * par le défilement de la page parente) ; ailleurs, les événements « pointer ».
   */
  interface Appui { id: number; x: number; y: number; souris: boolean }
  const aTouch = typeof window !== "undefined" && "ontouchstart" in window;
  const nettoyages: (() => void)[] = [];
  function brancher(el: HTMLElement, debut: (a: Appui) => void, bouge: (a: Appui) => void, fin: (a: Appui) => void) {
    const touches = (ev: TouchEvent, f: (a: Appui) => void) => {
      ev.preventDefault(); ev.stopPropagation(); dernier = "tactile";
      for (const t of Array.from(ev.changedTouches)) f({ id: 1000 + t.identifier, x: t.clientX, y: t.clientY, souris: false });
    };
    const ts = (ev: TouchEvent) => touches(ev, debut), tm = (ev: TouchEvent) => touches(ev, bouge), te = (ev: TouchEvent) => touches(ev, fin);
    const pointeur = (ev: PointerEvent, f: (a: Appui) => void, depart: boolean) => {
      if (aTouch && ev.pointerType === "touch") { ev.preventDefault(); ev.stopPropagation(); return; } // déjà traité par les événements « touch »
      ev.stopPropagation(); if (depart) { ev.preventDefault(); try { el.setPointerCapture(ev.pointerId); } catch { /* sans gravité */ } }
      f({ id: ev.pointerId, x: ev.clientX, y: ev.clientY, souris: ev.pointerType === "mouse" });
    };
    const pd = (ev: PointerEvent) => pointeur(ev, debut, true), pm = (ev: PointerEvent) => pointeur(ev, bouge, false), pu = (ev: PointerEvent) => pointeur(ev, fin, false);
    const opt = { passive: false } as AddEventListenerOptions;
    el.addEventListener("touchstart", ts, opt); el.addEventListener("touchmove", tm, opt); el.addEventListener("touchend", te, opt); el.addEventListener("touchcancel", te, opt);
    el.addEventListener("pointerdown", pd); el.addEventListener("pointermove", pm); el.addEventListener("pointerup", pu); el.addEventListener("pointercancel", pu);
    nettoyages.push(() => {
      el.removeEventListener("touchstart", ts); el.removeEventListener("touchmove", tm); el.removeEventListener("touchend", te); el.removeEventListener("touchcancel", te);
      el.removeEventListener("pointerdown", pd); el.removeEventListener("pointermove", pm); el.removeEventListener("pointerup", pu); el.removeEventListener("pointercancel", pu);
    });
  }
  // Joystick
  brancher(zoneJoy, (a) => {
    if (a.souris || joy.actif >= 0) return; dernier = "tactile";
    const r = baseJoy.getBoundingClientRect(); joy.actif = a.id; joy.cx = r.left + r.width / 2; joy.cy = r.top + r.height / 2; deplacerJoy(a);
  }, (a) => deplacerJoy(a), (a) => { if (a.id !== joy.actif) return; joy.actif = -1; joy.x = joy.y = 0; boutonJoy.style.transform = ""; });
  function deplacerJoy(a: Appui) {
    if (a.id !== joy.actif) return;
    let dx = (a.x - joy.cx) / R, dy = (a.y - joy.cy) / R; const n = Math.hypot(dx, dy); if (n > 1) { dx /= n; dy /= n; }
    joy.x = dx; joy.y = dy; boutonJoy.style.transform = `translate(${dx * R}px, ${dy * R}px)`;
  }
  // FRAPPER : maintenir pour charger, glisser dans une direction pour viser, relâcher pour frapper
  brancher(frapper, (a) => {
    if (visee.actif >= 0) return; dernier = "tactile"; const r = frapper.getBoundingClientRect();
    visee.actif = a.id; visee.cx = r.left + r.width / 2; visee.cy = r.top + r.height / 2; visee.x = visee.y = 0;
    appuiDepuis = maintenant(); frapper.style.transform = "translateY(3px)"; frapper.style.boxShadow = "0 1px 0 #1a1a1a";
  }, (a) => {
    if (a.id !== visee.actif) return;
    let dx = (a.x - visee.cx) / RV, dy = (a.y - visee.cy) / RV; const n = Math.hypot(dx, dy); if (n > 1) { dx /= n; dy /= n; }
    visee.x = dx; visee.y = dy;
    const m = Math.hypot(dx, dy); fleche.style.width = `${m * RV}px`; fleche.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
  }, (a) => {
    if (a.id !== visee.actif) return;
    majViseeTactile(); relacher(); visee.actif = -1; fleche.style.width = "0"; frapper.style.transform = ""; frapper.style.boxShadow = "0 4px 0 #1a1a1a";
  });
  /** Visée tactile : dans la direction glissée depuis FRAPPER, sinon droit devant le joueur. */
  function majViseeTactile() {
    if (visee.actif < 0) return;
    const a = ancre(), m = Math.hypot(visee.x, visee.y);
    if (m > 0.3) { const d = versTerrain(visee.x / m, -visee.y / m), dist = 3 + m * 13; vise = { x: a.x + d.x * dist, y: a.y + d.y * dist }; }
    else vise = { x: a.x + Math.cos(a.cap) * 8, y: a.y + Math.sin(a.cap) * 8 };
  }
  // FREIN
  let freinId = -1;
  brancher(frein, (a) => { freinId = a.id; freinTactile = true; dernier = "tactile"; frein.style.transform = "translateY(3px)"; frein.style.boxShadow = "0 1px 0 #1a1a1a"; },
    () => {}, (a) => { if (a.id !== freinId) return; freinId = -1; freinTactile = false; frein.style.transform = ""; frein.style.boxShadow = "0 4px 0 #1a1a1a"; });

  // --- Manette
  let gachettePrec = false;
  const ZM = 0.22;
  function lireManette() {
    const pads = typeof navigator.getGamepads === "function" ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const ax = (i: number) => (Math.abs(p.axes[i] ?? 0) > ZM ? p.axes[i] : 0);
      const btn = (i: number) => { const b = p.buttons[i]; return b ? b.pressed || b.value > 0.4 : false; };
      const lx = ax(0), ly = ax(1), rx = ax(2), ry = ax(3);
      const gachette = btn(7) || btn(0);
      const actif = lx || ly || rx || ry || gachette || btn(1) || btn(6);
      if (actif) dernier = "manette";
      if (dernier !== "manette") return null;
      // Visée : dans la direction du stick droit, plus loin quand on le pousse à fond ; sinon droit devant.
      const a = ancre(), m = Math.min(1, Math.hypot(rx, ry));
      if (m > 0.3) { const d = versTerrain(rx / m, -ry / m), dist = 3 + m * 13; vise = { x: a.x + d.x * dist, y: a.y + d.y * dist }; }
      else if (!gachette) vise = { x: a.x + Math.cos(a.cap) * 8, y: a.y + Math.sin(a.cap) * 8 };
      if (gachette && !gachettePrec) appuiDepuis = maintenant();
      if (!gachette && gachettePrec) relacher();
      gachettePrec = gachette;
      return { dep: versTerrain(lx, -ly), frein: btn(1) || btn(6) };
    }
    return null;
  }

  return {
    lire() {
      const manette = lireManette();
      majViseeTactile();
      const kx = (touches.has("KeyD") || touches.has("ArrowRight") ? 1 : 0) - (touches.has("KeyA") || touches.has("ArrowLeft") ? 1 : 0);
      const ky = (touches.has("KeyW") || touches.has("ArrowUp") ? 1 : 0) - (touches.has("KeyS") || touches.has("ArrowDown") ? 1 : 0);
      let d = versTerrain(kx, ky);
      if (!kx && !ky && manette && (manette.dep.x || manette.dep.y)) d = manette.dep;
      if (!kx && !ky && joy.actif >= 0) d = versTerrain(joy.x, -joy.y);
      let { x: dx, y: dy } = d;
      const n = Math.hypot(dx, dy); if (n > 1) { dx /= n; dy /= n; }
      const tir = tirEnAttente; tirEnAttente = 0;
      return { dx, dy, frein: touches.has("Space") || freinTactile || !!manette?.frein, viseX: vise.x, viseY: vise.y, tir };
    },
    forceEnCours() { return appuiDepuis < 0 ? 0 : forceDepuisDuree((maintenant() - appuiDepuis) / 1000); },
    peripherique: () => dernier,
    detruire() {
      window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); window.removeEventListener("blur", perdu);
      cible.removeEventListener("pointermove", viser); cible.removeEventListener("pointerdown", pd); cible.removeEventListener("pointerup", pu);
      cible.removeEventListener("pointercancel", perdu); cible.removeEventListener("contextmenu", menu);
      for (const n of nettoyages) n();
      zoneJoy.remove(); frapper.remove(); frein.remove();
    },
  };
}
