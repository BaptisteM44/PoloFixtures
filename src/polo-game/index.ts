/**
 * Point d'entrée du jeu : entrées -> simulation à pas fixe -> rendu interpolé.
 * `monterJeu` installe le jeu dans un élément et renvoie la fonction de nettoyage.
 * Modes : terrain d'entraînement (M0), match 1 contre 1 contre un bot (M1), match 3 contre 3 avec deux coéquipiers bots (M2).
 */
import { creerBot, type Bot, type Niveau } from "./ai/bot";
import { creerEntrees } from "./input/clavier-souris";
import { adressesDans, chargerRessources, type AdressesRessources } from "./render/ressources";
import { creerRendu, type Instantane } from "./render/scene";
import { DT, JOUEUR, PLOTS_ENTRAINEMENT } from "./sim/constantes";
import { CONFIG_MATCH, creerMatch, DUREES, pasMatch, type Match } from "./sim/match";
import { bonusCombo, creerEtat, pas } from "./sim/pas";
import type { Balle, Commande, Etat, Joueur } from "./sim/types";
import { creerSons } from "./ui/sons";

const instantane = (e: { joueurs: Joueur[]; balle: Balle }): Instantane => ({ joueurs: e.joueurs.map((j) => ({ x: j.x, y: j.y, cap: j.cap })), balle: { x: e.balle.x, y: e.balle.y, z: e.balle.z } });
const NOM_NIVEAU: Record<Niveau, string> = { facile: "Facile", moyen: "Moyen", difficile: "Difficile" };
/** Durée de jeu gardée en mémoire pour la rediffusion, et vitesse de la rediffusion. */
const REDIFF_AVANT = 2.6, REDIFF_VITESSE = 0.55;

interface Image { joueurs: Joueur[]; balle: Balle }

export interface OptionsJeu {
  /** Si fourni, le menu propose « Quitter » (par exemple : retour à l'accueil du site). */
  quitter?: () => void;
  /** Où trouver les personnages 3D : un dossier public (par défaut `/polo-game`) ou des adresses complètes. */
  ressources?: string | AdressesRessources;
}

export function monterJeu(conteneur: HTMLElement, options: OptionsJeu = {}): () => void {
  // Deux zones : l'écran du jeu, et un panneau de commandes tactiles posé dessus (paysage)
  // ou en dessous, façon console portable (portrait).
  const ancienStyle = conteneur.getAttribute("style") ?? "";
  conteneur.style.display = "flex"; conteneur.style.flexDirection = "column"; conteneur.style.touchAction = "none";
  const ecran = document.createElement("div"); ecran.style.cssText = "position:relative;flex:1 1 auto;min-height:0;overflow:hidden";
  const panneau = document.createElement("div");
  conteneur.append(ecran, panneau);
  // Personnages 3D : chargés en arrière-plan ; en attendant, les joueurs sont dessinés en formes simples
  const chargeur = document.createElement("div");
  chargeur.style.cssText = "position:absolute;right:12px;bottom:12px;z-index:5;background:rgba(26,26,26,.78);color:#fcfbf5;border-radius:10px;padding:6px 10px;font:600 12px var(--font-space, system-ui),system-ui,sans-serif;display:flex;gap:8px;align-items:center;pointer-events:none";
  chargeur.innerHTML = '<span>Chargement des joueurs</span><span style="display:block;width:90px;height:6px;border-radius:3px;background:#fcfbf533;overflow:hidden"><span data-r="barreCharge" style="display:block;height:100%;width:0;background:#fff25a;transition:width .15s"></span></span>';
  ecran.appendChild(chargeur);
  const barreCharge = chargeur.querySelector('[data-r="barreCharge"]') as HTMLElement;
  const adresses = typeof options.ressources === "object" ? options.ressources : adressesDans(options.ressources ?? "/polo-game");
  const ressources = chargerRessources(adresses, (p) => { barreCharge.style.width = `${Math.round(p * 100)}%`; });
  ressources.then(() => chargeur.remove(), () => { chargeur.innerHTML = "<span>Joueurs simplifiés (personnages 3D indisponibles)</span>"; setTimeout(() => chargeur.remove(), 4000); });
  const rendu = creerRendu(ecran, ressources);
  const sons = creerSons();

  // --- État du jeu courant
  let mode: "menu" | "entrainement" | "match" = "menu";
  let etat: Etat = creerEtat(1, undefined, [...PLOTS_ENTRAINEMENT]);
  let match: Match | null = null, bots: Bot[] = [], niveau: Niveau = "moyen", format: 1 | 3 = 1;
  let prec = instantane(etat);

  // --- Affichage tête haute
  const hud = document.createElement("div");
  hud.style.cssText = "position:absolute;inset:0;pointer-events:none;font-family:var(--font-space, system-ui),system-ui,sans-serif;color:#fcfbf5";
  hud.innerHTML =
    '<div data-r="score" style="position:absolute;left:12px;top:12px;background:rgba(26,26,26,.72);border-radius:10px;padding:6px 12px;font-weight:700;font-size:14px"></div>' +
    '<div data-r="tableau" style="position:absolute;left:50%;top:10px;transform:translateX(-50%);display:none;align-items:stretch;border:2px solid #1a1a1a;border-radius:10px;overflow:hidden;font-weight:700;box-shadow:0 3px 0 rgba(0,0,0,.35)">' +
      '<span style="background:#2fb5bd;color:#1a1a1a;padding:5px 10px;font-size:.75em;display:flex;align-items:center">TOI</span>' +
      '<span data-r="s0" style="background:#fcfbf5;color:#1a1a1a;padding:3px 10px;font-size:1.25em;min-width:22px;text-align:center"></span>' +
      '<span data-r="chrono" style="background:#1a1a1a;color:#fff25a;padding:5px 10px;font-size:.875em;display:flex;align-items:center;font-variant-numeric:tabular-nums"></span>' +
      '<span data-r="s1" style="background:#fcfbf5;color:#1a1a1a;padding:3px 10px;font-size:1.25em;min-width:22px;text-align:center"></span>' +
      '<span data-r="nomBot" style="background:#9a6cf0;color:#fcfbf5;padding:5px 10px;font-size:.75em;display:flex;align-items:center"></span></div>' +
    '<div data-r="grand" style="position:absolute;left:50%;top:38%;transform:translate(-50%,-50%);font-weight:800;font-size:min(16vw,110px);color:#fff25a;-webkit-text-stroke:3px #1a1a1a;text-shadow:0 6px 0 #1a1a1a;display:none;letter-spacing:.02em"></div>' +
    '<div data-r="rediff" style="position:absolute;left:12px;top:56px;display:none;align-items:center;gap:8px;background:#e5484d;color:#fcfbf5;border:2px solid #1a1a1a;border-radius:8px;padding:4px 10px;font-weight:800;font-size:13px;letter-spacing:.1em">● REDIFFUSION <span style="font-weight:600;letter-spacing:0;opacity:.85">— clic ou espace pour passer</span></div>' +
    '<div data-r="msg" style="position:absolute;left:50%;top:16%;transform:translateX(-50%);background:#fff25a;color:#1a1a1a;border:2px solid #1a1a1a;border-radius:10px;padding:6px 16px;font-weight:700;font-size:18px;text-align:center;max-width:90%;display:none"></div>' +
    '<div data-r="force" style="position:absolute;left:50%;bottom:44px;transform:translateX(-50%);display:flex;gap:6px;align-items:center;background:rgba(26,26,26,.72);border-radius:10px;padding:6px 10px;font-size:12px;font-weight:700"></div>' +
    '<div data-r="aide" style="position:absolute;left:50%;bottom:10px;transform:translateX(-50%);background:rgba(26,26,26,.72);border-radius:8px;padding:4px 10px;font-size:12px;white-space:nowrap;max-width:96%;overflow:hidden;text-overflow:ellipsis"></div>';
  ecran.appendChild(hud);
  // Indicateurs en bord d'écran pour la balle et l'adversaire hors champ
  const indic = (couleur: string, texte: string) => { const d = document.createElement("div"); d.style.cssText = `position:absolute;left:0;top:0;display:none;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;background:${couleur};border:2px solid #1a1a1a;color:#1a1a1a;font:800 10px system-ui,sans-serif;pointer-events:none;box-shadow:0 2px 0 #1a1a1a`; d.innerHTML = `<span style="position:absolute;width:0;height:0;border:7px solid transparent;border-left:10px solid #1a1a1a;left:34px;top:8px"></span>${texte}`; hud.appendChild(d); return d; };
  const indBalle = indic("#ff7a2f", ""), indBot = indic("#9a6cf0", "BOT");
  function placerIndicateur(d: HTMLElement, x: number, y: number, z: number, visible: boolean) {
    if (!visible) { d.style.display = "none"; return; }
    const w = ecran.clientWidth, h = ecran.clientHeight, p = rendu.projeter(x, y, z), m = 30;
    if (p.sx > m && p.sx < w - m && p.sy > 60 && p.sy < h - m) { d.style.display = "none"; return; }
    const cx = w / 2, cy = h / 2, dx = p.sx - cx, dy = p.sy - cy;
    const k = Math.min((w / 2 - m) / Math.max(1e-6, Math.abs(dx)), (h / 2 - m - 20) / Math.max(1e-6, Math.abs(dy)));
    d.style.display = "flex"; d.style.transform = `translate(${cx + dx * k - 17}px, ${cy + 10 + dy * k - 17}px)`;
    const fl = d.firstElementChild as HTMLElement; const a = Math.atan2(dy, dx);
    fl.style.left = `${17 + Math.cos(a) * 20 - 5}px`; fl.style.top = `${17 + Math.sin(a) * 20 - 7}px`; fl.style.transform = `rotate(${a}rad)`;
  }
  const calque = document.createElement("div"); calque.style.cssText = "position:absolute;inset:0;pointer-events:none"; ecran.appendChild(calque);
  const entrees = creerEntrees(rendu.canvas, rendu.pointSol, () => etat.joueurs[0], panneau);
  const el = (r: string) => hud.querySelector(`[data-r="${r}"]`) as HTMLElement;
  const elScore = el("score"), elMsg = el("msg"), elForce = el("force"), aide = el("aide"), elTableau = el("tableau"), elGrand = el("grand"), elRediff = el("rediff");
  elForce.innerHTML = '<span style="display:block;width:200px;height:12px;border-radius:6px;border:1.5px solid #fcfbf5;overflow:hidden"><span data-r="jauge" style="display:block;height:100%;width:100%;transform-origin:left;transform:scaleX(0);background:linear-gradient(90deg,#60c9cf,#fff25a 40%,#ff7a2f 75%,#e5484d)"></span></span><span data-r="jt" style="min-width:44px;text-align:right">Force</span>';
  const jauge = el("jauge"), jaugeTexte = el("jt");
  const AIDES = {
    clavier: "ZQSD ou flèches : rouler · Espace : frein · Clic : frapper vers le point visé · Maintiens pour frapper plus fort · M : son · F : plein écran · Échap : menu",
    manette: "Stick gauche : rouler · B ou gâchette gauche : frein · Stick droit : viser · Gâchette droite maintenue : frapper",
    tactile: "Joystick : rouler · FRAPPER : maintiens pour charger, glisse pour viser · FREIN",
  } as const;

  let disposition = "";
  /** Commandes tactiles : cachées (clavier, manette), sur l'écran (paysage) ou en dessous (portrait). */
  function majDisposition() {
    const tactile = entrees.peripherique() === "tactile", portrait = conteneur.clientHeight > conteneur.clientWidth * 1.05;
    const d = !tactile ? "aucune" : portrait ? "console" : "superpose";
    if (d === disposition) return; disposition = d;
    if (d === "aucune") panneau.style.cssText = "display:none";
    else if (d === "superpose") panneau.style.cssText = "position:absolute;left:0;right:0;bottom:0;height:min(220px,48%);pointer-events:none;z-index:2";
    else panneau.style.cssText = "position:relative;flex:0 0 190px;background:#23262b;border-top:2px solid #1a1a1a;pointer-events:auto;touch-action:none";
    elForce.style.bottom = d === "superpose" ? "auto" : "44px"; elForce.style.top = d === "superpose" ? "52px" : "auto";
    aide.style.display = d === "aucune" ? "block" : "none";
    rendu.redimensionner();
  }

  // --- Boutons en haut à droite : menu, son, plein écran (icônes, pour tenir sur un téléphone)
  const ICONES = {
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    son: '<path d="M4 10v4h4l5 4V6L8 10z" fill="currentColor" stroke="none"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/>',
    muet: '<path d="M4 10v4h4l5 4V6L8 10z" fill="currentColor" stroke="none"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5"/>',
    grand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    petit: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
  } as const;
  const svg = (k: keyof typeof ICONES) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[k]}</svg>`;
  const bouton = (titre: string) => {
    const b = document.createElement("button"); b.type = "button"; b.title = titre; b.setAttribute("aria-label", titre);
    b.style.cssText = "pointer-events:auto;width:38px;height:38px;display:flex;align-items:center;justify-content:center;border:0;border-radius:10px;background:rgba(26,26,26,.72);color:#fcfbf5;cursor:pointer;padding:0";
    b.addEventListener("pointerdown", (ev) => ev.stopPropagation()); return b;
  };
  const barre = document.createElement("div"); barre.style.cssText = "position:absolute;right:10px;top:10px;display:flex;gap:6px;z-index:4"; calque.appendChild(barre);
  const btnMenu = bouton("Menu"), muet = bouton("Couper ou remettre le son"), btnEcran = bouton("Plein écran");
  btnMenu.innerHTML = svg("menu");
  barre.append(btnMenu, muet, btnEcran);
  const majMuet = () => { muet.innerHTML = svg(sons.estMuet() ? "muet" : "son"); };
  majMuet();
  muet.addEventListener("click", () => { sons.deverrouiller(); sons.basculerMuet(); majMuet(); rendu.canvas.focus(); });
  btnMenu.addEventListener("click", () => ouvrirMenu());

  // --- Plein écran : API du navigateur si elle existe (ordinateur, Android, iPad),
  // sinon « plein écran » de la page (iPhone) : le jeu recouvre tout le site.
  type DocFs = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
  type ElFs = HTMLElement & { webkitRequestFullscreen?: () => void };
  const doc = document as DocFs;
  let pseudo = false, styleAvantPseudo = "", debordementAvant = "";
  const vraiPleinEcran = () => !!(doc.fullscreenElement || doc.webkitFullscreenElement);
  const enPleinEcran = () => vraiPleinEcran() || pseudo;
  const majEcran = () => { const g = enPleinEcran(); btnEcran.innerHTML = svg(g ? "petit" : "grand"); btnEcran.title = g ? "Quitter le plein écran" : "Plein écran"; btnEcran.setAttribute("aria-label", btnEcran.title); };
  function entrerPseudo() {
    pseudo = true; styleAvantPseudo = conteneur.style.cssText; debordementAvant = document.body.style.overflow;
    conteneur.style.cssText += ";position:fixed;inset:0;width:100vw;height:100dvh;margin:0;z-index:2147483000;background:#2b3138";
    document.body.style.overflow = "hidden"; majEcran();
  }
  function quitterPseudo() { pseudo = false; conteneur.style.cssText = styleAvantPseudo; document.body.style.overflow = debordementAvant; majEcran(); }
  async function basculerPleinEcran() {
    if (pseudo) { quitterPseudo(); return; }
    if (vraiPleinEcran()) { if (document.exitFullscreen) await document.exitFullscreen().catch(() => undefined); else doc.webkitExitFullscreen?.(); return; }
    const c = conteneur as ElFs;
    try {
      if (c.requestFullscreen) { await c.requestFullscreen({ navigationUI: "hide" }); return; }
      if (c.webkitRequestFullscreen) { c.webkitRequestFullscreen(); return; }
    } catch { /* refusé : on passe au plein écran de la page */ }
    entrerPseudo();
  }
  majEcran();
  btnEcran.addEventListener("click", () => { sons.deverrouiller(); void basculerPleinEcran(); rendu.canvas.focus(); });
  document.addEventListener("fullscreenchange", majEcran); document.addEventListener("webkitfullscreenchange", majEcran);

  // --- Tableau de score : centré, ou à gauche quand l'écran est étroit (sinon il passe sous les boutons)
  let largeurPrec = 0;
  function majHautEcran() {
    const w = ecran.clientWidth; if (w === largeurPrec) return; largeurPrec = w;
    const etroit = w < 600;
    elTableau.style.left = etroit ? "10px" : "50%"; elTableau.style.transform = etroit ? "none" : "translateX(-50%)";
    elTableau.style.fontSize = etroit ? "0.85em" : "1em";
    elRediff.style.top = etroit ? "58px" : "56px";
  }

  // --- Menu et écran de fin
  const menu = document.createElement("div");
  menu.style.cssText = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(26,26,26,.55);pointer-events:auto;padding:14px;z-index:3";
  menu.addEventListener("pointerdown", (ev) => ev.stopPropagation());
  calque.appendChild(menu);
  const carte = (contenu: string) => `<div style="background:#fcfbf5;color:#1a1a1a;border:2px solid #1a1a1a;border-radius:14px;box-shadow:6px 6px 0 #1a1a1a;padding:18px 20px;max-width:420px;width:100%;max-height:100%;overflow:auto;font-family:var(--font-space, system-ui),system-ui,sans-serif">${contenu}</div>`;
  const BTN = "font:700 15px system-ui,sans-serif;border:2px solid #1a1a1a;border-radius:999px;padding:9px 16px;cursor:pointer;box-shadow:0 3px 0 #1a1a1a";
  function ouvrirMenu() {
    mode = "menu"; arreterRediffusion(); sons.charge(0);
    menu.innerHTML = carte(
      '<h2 style="margin:0 0 4px;font-size:22px;text-transform:uppercase;letter-spacing:.03em">Polo</h2>' +
      '<p style="margin:0 0 14px;font-size:14px;color:#55554f;line-height:1.45">Premier à 5 buts ou 6 minutes. Un but ne compte que sur un tir, pas en poussant la balle dans la cage. Chrono arrêté à chaque but.</p>' +
      [1, 3].map((fmt) => `<div style="font-weight:700;font-size:13px;margin-bottom:6px">Match ${fmt} contre ${fmt}${fmt === 3 ? ' <span style="font-weight:500;color:#55554f">· avec 2 coéquipiers bots, passes et combos</span>' : ""}</div>` +
        `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">${(["facile", "moyen", "difficile"] as Niveau[]).map((n) => `<button data-match="${n}" data-format="${fmt}" style="${BTN};background:${n === "facile" ? "#60c9cf" : n === "moyen" ? "#fff25a" : "#ff7f96"}">${NOM_NIVEAU[n]}</button>`).join("")}</div>`).join("") +
      `<div style="display:flex;gap:8px;flex-wrap:wrap"><button data-entrainement style="${BTN};background:#fcfbf5">Terrain d'entraînement</button>${match && match.phase !== "fin" ? `<button data-reprendre style="${BTN};background:#2fb5bd">Reprendre le match</button>` : ""}</div>` +
      (options.quitter ? `<div style="margin-top:14px;padding-top:12px;border-top:1.5px dashed #c9c6bb"><button data-quitter style="${BTN};background:#1a1a1a;color:#fcfbf5;box-shadow:0 3px 0 #55554f">Quitter le jeu</button></div>` : ""));
    menu.style.display = "flex";
  }
  function ecranFin(m: Match) {
    const gagne = m.vainqueur === 0;
    menu.innerHTML = carte(
      `<h2 style="margin:0 0 4px;font-size:26px;text-transform:uppercase">${gagne ? "Victoire !" : "Défaite"}</h2>` +
      `<p style="margin:0 0 14px;font-size:16px"><b>${format === 3 ? "Ton équipe" : "Toi"} ${m.etat.score[0]} – ${m.etat.score[1]} ${format === 3 ? "Adversaires" : "Bot"}</b> · ${NOM_NIVEAU[niveau]}${m.butEnOr ? " · but en or" : ""}</p>` +
      `<div style="display:flex;gap:8px;flex-wrap:wrap"><button data-match="${niveau}" data-format="${format}" style="${BTN};background:#fff25a">Rejouer</button><button data-menu style="${BTN};background:#fcfbf5">Menu</button>${options.quitter ? `<button data-quitter style="${BTN};background:#1a1a1a;color:#fcfbf5;box-shadow:0 3px 0 #55554f">Quitter</button>` : ""}</div>`);
    menu.style.display = "flex";
  }
  menu.addEventListener("click", (ev) => {
    const b = (ev.target as HTMLElement).closest("button"); if (!b) return;
    sons.deverrouiller();
    if (b.dataset.match) lancerMatch(b.dataset.match as Niveau, b.dataset.format === "3" ? 3 : 1);
    else if (b.hasAttribute("data-entrainement")) lancerEntrainement();
    else if (b.hasAttribute("data-menu")) ouvrirMenu();
    else if (b.hasAttribute("data-quitter")) options.quitter?.();
    else if (b.hasAttribute("data-reprendre")) { menu.style.display = "none"; mode = match ? "match" : "entrainement"; rendu.canvas.focus(); }
  });

  function lancerEntrainement() {
    rendu.vider(); arreterRediffusion();
    mode = "entrainement"; match = null; bots = [];
    etat = creerEtat((Date.now() & 0x7fffffff) || 1, undefined, [...PLOTS_ENTRAINEMENT]);
    prec = instantane(etat); couper = true; menu.style.display = "none"; rendu.canvas.focus();
  }
  function lancerMatch(n: Niveau, fmt: 1 | 3 = 1) {
    rendu.vider(); arreterRediffusion();
    niveau = n; format = fmt; mode = "match";
    const graine = (Date.now() & 0x7fffffff) || 1;
    match = creerMatch(graine, fmt, CONFIG_MATCH); etat = match.etat;
    // Joueur 0 : toi. Les autres sont des bots (en 3 contre 3 : tes 2 coéquipiers et les 3 adversaires).
    bots = etat.joueurs.slice(1).map((_, k) => creerBot(k + 1, n, (graine ^ 0x5bd1e995) + k * 7919));
    el("nomBot").textContent = fmt === 3 ? `ADV · ${NOM_NIVEAU[n]}` : `BOT · ${NOM_NIVEAU[n]}`;
    prec = instantane(etat); couper = true; finAffichee = false; menu.style.display = "none"; rendu.canvas.focus();
  }

  /**
   * Passe assistée (3 contre 3) : si tu vises près d'un coéquipier, la frappe devient une passe vers lui,
   * un peu devant pour qu'il la prenne lancé, à une vitesse qu'il peut contrôler.
   */
  function aiderPasse(c: Commande): Commande {
    if (format !== 3 || c.tir <= 0) return c;
    const moi = etat.joueurs[0], b = etat.balle;
    const ha = Math.atan2(c.viseY - b.y, c.viseX - b.x);
    let meilleur: Joueur | null = null, score = Infinity;
    for (const o of etat.joueurs) {
      if (o === moi || o.equipe !== moi.equipe || o.etat !== "actif") continue;
      const d = Math.hypot(o.x - b.x, o.y - b.y); if (d < 2 || d > 22) continue;
      const ecart = Math.abs(Math.atan2(Math.sin(Math.atan2(o.y - b.y, o.x - b.x) - ha), Math.cos(Math.atan2(o.y - b.y, o.x - b.x) - ha)));
      const pres = Math.hypot(o.x - c.viseX, o.y - c.viseY);
      const sc = Math.min(ecart * d, pres);
      if ((pres < 3.5 || ecart < 0.2) && sc < score) { score = sc; meilleur = o; }
    }
    if (!meilleur) return c;
    const d = Math.hypot(meilleur.x - b.x, meilleur.y - b.y), tv = d / Math.min(14, 4.5 + d * 0.75);
    return { ...c, passe: meilleur.id, viseX: meilleur.x + Math.cos(meilleur.cap) * meilleur.v * tv, viseY: meilleur.y + Math.sin(meilleur.cap) * meilleur.v * tv };
  }

  // --- Messages
  let msgJusqua = 0, grandJusqua = 0;
  function message(texte: string, duree: number, fond = "#fff25a") { elMsg.textContent = texte; elMsg.style.background = fond; elMsg.style.display = "block"; msgJusqua = performance.now() + duree * 1000; }
  function grand(texte: string, duree: number, couleur = "#fff25a") { elGrand.textContent = texte; elGrand.style.color = couleur; elGrand.style.display = "block"; grandJusqua = performance.now() + duree * 1000; }

  // --- Ralentis et rediffusion
  const memoire: Image[] = [];
  let rediffusion: Image[] | null = null, rediffT = 0, rediffPrevue = 0, couper = false, finAffichee = false;
  const copieImage = (e: Etat): Image => ({ joueurs: e.joueurs.map((j) => ({ ...j })), balle: { ...e.balle } });
  function arreterRediffusion() { rediffusion = null; rediffPrevue = 0; elRediff.style.display = "none"; }
  function passerRediffusion() {
    if (!rediffusion) return;
    arreterRediffusion(); couper = true;
    if (match && match.phase === "but") match.tPhase = Math.max(match.tPhase, DUREES.but - DT);
  }
  const passerClic = () => { if (rediffusion) passerRediffusion(); };
  ecran.addEventListener("pointerdown", passerClic, true);

  // --- Son : déverrouillage au premier geste ; touches globales
  const deverrouiller = () => sons.deverrouiller();
  const touches = (ev: KeyboardEvent) => {
    if (ev.repeat) return;
    if (ev.code === "KeyM") { sons.basculerMuet(); majMuet(); }
    else if (ev.code === "KeyF") void basculerPleinEcran();
    else if (ev.code === "Escape") { if (mode === "menu" && match && match.phase !== "fin") { menu.style.display = "none"; mode = "match"; } else ouvrirMenu(); }
    else if ((ev.code === "Space" || ev.code === "Enter") && rediffusion) passerRediffusion();
  };
  conteneur.addEventListener("pointerdown", deverrouiller, true); window.addEventListener("keydown", deverrouiller); window.addEventListener("keydown", touches);

  let dernier = performance.now(), cumul = 0, facteurTemps = 1, ralentiJusqua = 0, zoom = 1, raf = 0, arrete = false, images = 0, tFps = dernier, fps = 0;
  let vise = { x: 0, y: 0 };
  const fmtChrono = (s: number) => { const t = Math.ceil(s); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };

  function traiterEvenements(maintenant: number) {
    for (const ev of etat.evenements) {
      sons.evenement(ev);
      if (ev.type === "chute") message("Chute !", 2.2, "#ffa2af");
      else if (ev.type === "piedAterre" && ev.joueur === etat.joueurs[0].id) message("Pied à terre ! Hors jeu : va taper la balustrade au milieu (zone jaune)", 3, "#ffa2af");
      else if (ev.type === "tapIn" && ev.joueur === etat.joueurs[0].id) message("De retour en jeu", 1.2, "#60c9cf");
      else if (ev.type === "poteau" && ev.force > 6) { ralentiJusqua = maintenant + 500; message("Poteau !", 1.2, "#fcfbf5"); }
      else if (mode === "entrainement" && ev.type === "but") { message("BUT !", 2); ralentiJusqua = maintenant + 1100; }
      else if (mode === "entrainement" && ev.type === "butRefuse") message("Pas de but : la balle a été poussée, il faut un tir", 2.6, "#ffa2af");
      else if (ev.type === "vol" && ev.victime === etat.joueurs[0].id) message("Balle volée !", 1.2, "#ffa2af");
      else if (ev.type === "vol" && ev.joueur === etat.joueurs[0].id) message("Récupérée !", 1.1, "#60c9cf");
      else if (ev.type === "passe" && etat.joueurs.find((j) => j.id === ev.recepteur)?.equipe === 0) {
        if (ev.passes >= 2) message(ev.triangle ? `TRIANGLE ! Passe ×${ev.passes} · tir +50 %` : `Une-deux ! Passe ×${ev.passes} · tir +25 %`, 1.8, ev.triangle ? "#ff7f96" : "#fff25a");
        else if (ev.recepteur === etat.joueurs[0].id) message("Passe reçue", 0.9, "#60c9cf");
      }
      else if (ev.type === "tirCombo") {
        const nous = etat.joueurs.find((j) => j.id === ev.joueur)?.equipe === 0;
        grand(nous ? (ev.triangle ? "TRIANGLE +50 %" : "UNE-DEUX +25 %") : "COMBO ADVERSE", 1.4, nous ? "#ff7f96" : "#ffa2af");
        ralentiJusqua = maintenant + 700;
      }
    }
    if (!match) return;
    for (const ev of match.evenements) {
      if (ev.type === "compte") { grand(String(ev.n), 0.9); sons.signal("compte"); }
      else if (ev.type === "coupDEnvoi") { grand("POLO !", 1.1); sons.signal("sifflet"); }
      else if (ev.type === "but") {
        grand(ev.equipe === 0 ? "BUT !" : format === 3 ? "BUT ADVERSE" : "BUT BOT", 2.2, ev.equipe === 0 ? "#fff25a" : "#ffa2af");
        if (ev.contreSonCamp) message("Contre son camp", 2);
        ralentiJusqua = maintenant + 1300; rediffPrevue = maintenant + 1300;
      }
      else if (ev.type === "butRefuse") message("Pas de but : balle poussée sans tir. Balle à la défense.", 2.6, "#ffa2af");
      else if (ev.type === "reprise") message(ev.possession === 0 ? (format === 3 ? "Ton équipe relance" : "À toi de relancer") : (format === 3 ? "L'adversaire relance" : "Le bot relance"), 1.4, ev.possession === 0 ? "#60c9cf" : "#fcfbf5");
      else if (ev.type === "butEnOr") { grand("BUT EN OR", 1.8); message("Égalité : le prochain but gagne", 2.4); sons.signal("butEnOr"); }
      else if (ev.type === "finMatch") { sons.signal("fin"); grand(ev.vainqueur === 0 ? "VICTOIRE" : "DÉFAITE", 2, ev.vainqueur === 0 ? "#fff25a" : "#ffa2af"); }
    }
  }

  function boucle(maintenant: number) {
    if (arrete) return;
    const reel = Math.min(0.1, (maintenant - dernier) / 1000); dernier = maintenant;
    const enRalenti = maintenant < ralentiJusqua;
    facteurTemps += ((enRalenti ? 0.3 : 1) - facteurTemps) * Math.min(1, reel * 10);

    // Lancer la rediffusion du but après le ralenti
    if (rediffPrevue && maintenant >= rediffPrevue && !rediffusion) {
      rediffPrevue = 0;
      const n = Math.round(REDIFF_AVANT / DT) + 40;
      rediffusion = memoire.slice(-n); rediffT = 0; elRediff.style.display = "flex"; couper = true;
    }

    let aRendre: { e: Etat; prec: Instantane; alpha: number } | null = null;
    if (rediffusion) {
      // Rediffusion : la simulation est en pause, on rejoue les images mémorisées au ralenti
      rediffT += reel * REDIFF_VITESSE / DT;
      const i = Math.min(rediffusion.length - 1, Math.floor(rediffT)), a = rediffusion[i], p = rediffusion[Math.max(0, i - 1)];
      aRendre = { e: { ...etat, joueurs: a.joueurs, balle: a.balle }, prec: instantane(p), alpha: rediffT - Math.floor(rediffT) };
      if (rediffT >= rediffusion.length - 1) passerRediffusion();
      entrees.lire();
    } else if (mode !== "menu") {
      cumul += reel * facteurTemps;
      while (cumul >= DT) {
        prec = instantane(etat);
        const c = entrees.lire(); vise = { x: c.viseX, y: c.viseY };
        if (match && bots.length) pasMatch(match, [aiderPasse(c), ...bots.map((b) => b.decider(etat))]);
        else pas(etat, [c]);
        traiterEvenements(maintenant);
        if (match && (match.phase === "jeu" || match.phase === "but")) { memoire.push(copieImage(etat)); if (memoire.length > 600) memoire.splice(0, memoire.length - 400); }
        if (match && match.phase === "remise" && match.tPhase <= DT * 1.5) couper = true;
        cumul -= DT;
      }
      if (match && match.phase === "fin" && !finAffichee && !rediffusion && !rediffPrevue) { finAffichee = true; setTimeout(() => { if (match && match.phase === "fin" && mode === "match") ecranFin(match); }, 1600); }
    } else { entrees.lire(); cumul = 0; }

    // HUD
    const moi = etat.joueurs[0];
    if (maintenant > msgJusqua) {
      const fixe = moi.etat === "horsJeu" && mode !== "menu" ? "Hors jeu : va taper la balustrade dans une zone jaune, au milieu" : "";
      if (fixe) { elMsg.textContent = fixe; elMsg.style.background = "#fff25a"; elMsg.style.display = "block"; } else elMsg.style.display = "none";
    }
    if (maintenant > grandJusqua) elGrand.style.display = "none";
    // Alerte d'équilibre : tu es presque arrêté, bientôt pied à terre
    if (maintenant > msgJusqua && moi.etat === "actif" && moi.risque > 0.45 && !JOUEUR.chuteVirage) { elMsg.textContent = "Garde de la vitesse, sinon pied à terre !"; elMsg.style.background = "#ffa2af"; elMsg.style.display = "block"; }
    // Combo prêt : tu as la balle après une série de passes, ton prochain tir vers la cage est bonifié
    if (maintenant > msgJusqua && mode === "match" && moi.aLaBalle) {
      const { bonus, triangle } = bonusCombo(etat, moi);
      if (bonus > 1) { elMsg.textContent = triangle ? "TRIANGLE ! Tire vers la cage : +50 %" : "Une-deux ! Tire vers la cage : +25 %"; elMsg.style.background = triangle ? "#ff7f96" : "#fff25a"; elMsg.style.display = "block"; }
    }
    const f = mode === "menu" || rediffusion ? 0 : entrees.forceEnCours();
    sons.charge(f);
    const per = entrees.peripherique(); if (aide.dataset.p !== per) { aide.dataset.p = per; aide.textContent = AIDES[per]; }
    majDisposition(); majHautEcran();
    jauge.style.transform = `scaleX(${f.toFixed(3)})`;
    jaugeTexte.textContent = f > 0 ? `${Math.round(f * 100)} %` : "Force";
    elForce.style.boxShadow = f >= 1 ? "0 0 0 2px #e5484d" : "none";
    if (match) {
      elTableau.style.display = "flex"; elScore.style.display = "none";
      el("s0").textContent = String(match.etat.score[0]); el("s1").textContent = String(match.etat.score[1]);
      el("chrono").textContent = match.butEnOr ? "BUT EN OR" : fmtChrono(match.chrono);
    } else { elTableau.style.display = "none"; elScore.style.display = mode === "menu" ? "none" : "block"; elScore.textContent = `Buts : ${etat.score[0]} · ${(moi.v * 3.6).toFixed(0)} km/h`; }
    images++; if (maintenant - tFps > 500) { fps = Math.round((images * 1000) / (maintenant - tFps)); images = 0; tFps = maintenant; }

    zoom = rediffusion ? 0.7 : enRalenti ? 0.8 : mode === "menu" ? 1.25 : 1;
    const r = aRendre ?? { e: etat, prec, alpha: mode === "menu" ? 1 : cumul / DT };
    rendu.rendre(r.e, r.prec, r.alpha, { viseX: vise.x, viseY: vise.y, force: f, zoom, suivreBalle: !!rediffusion || mode === "menu", masquerVisee: !!rediffusion || mode === "menu" || moi.etat !== "actif", couper });
    couper = false;
    const enJeu = mode !== "menu" && !rediffusion;
    placerIndicateur(indBalle, r.e.balle.x, r.e.balle.y, r.e.balle.z, enJeu);
    // Indicateur : l'adversaire le plus proche de la balle
    const advs = r.e.joueurs.filter((j) => j.equipe === 1), bb = r.e.balle;
    const adv = advs.sort((p, q) => Math.hypot(p.x - bb.x, p.y - bb.y) - Math.hypot(q.x - bb.x, q.y - bb.y))[0];
    placerIndicateur(indBot, adv?.x ?? 0, adv?.y ?? 0, 0.8, enJeu && !!match && !!adv);
    raf = requestAnimationFrame(boucle);
  }
  ouvrirMenu();
  raf = requestAnimationFrame(boucle);
  rendu.canvas.focus();

  // Accès de débogage pour les essais automatiques
  (window as unknown as { __polo?: unknown }).__polo = {
    get etat() { return etat; }, get match() { return match; }, rendu, fps: () => fps,
    lancerMatch, lancerEntrainement, passerRediffusion, get rediffusion() { return !!rediffusion; },
  };

  return () => {
    arrete = true; cancelAnimationFrame(raf); entrees.detruire(); sons.detruire();
    conteneur.removeEventListener("pointerdown", deverrouiller, true); ecran.removeEventListener("pointerdown", passerClic, true);
    window.removeEventListener("keydown", deverrouiller); window.removeEventListener("keydown", touches);
    document.removeEventListener("fullscreenchange", majEcran); document.removeEventListener("webkitfullscreenchange", majEcran);
    if (pseudo) quitterPseudo(); else if (vraiPleinEcran()) void document.exitFullscreen?.().catch(() => undefined);
    rendu.detruire(); hud.remove(); calque.remove(); ecran.remove(); panneau.remove(); conteneur.setAttribute("style", ancienStyle);
    delete (window as unknown as { __polo?: unknown }).__polo;
  };
}
