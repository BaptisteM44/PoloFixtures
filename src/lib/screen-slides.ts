/**
 * Écran de salle : les diapos possibles et le diaporama automatique.
 * Fonctions pures (client et serveur).
 *
 * Une diapo est identifiée par une clé texte, stable et lisible :
 *   court:1            match en cours / à venir sur le terrain 1
 *   overview           vue d'ensemble : terrains + prochains matchs + classement + résultats, en tuiles
 *   courts             tous les terrains en mosaïque
 *   standings:0:A      classement de l'étape d'ordre 0, groupe A ("-" = sans groupe)
 *   bracket:2          tableau de l'étape d'ordre 2
 *   upcoming           prochains matchs
 *   referees           prochains arbitrages (qui arbitre quel match)
 *   results            derniers résultats
 *   sponsors           sponsors
 *   qr                 « suis le tournoi » (QR vers la page publique)
 */

export type SlideKey = string;
export type SlideEntry = { key: SlideKey; seconds?: number };

export type ScreenConfig = {
  slug: string;
  name: string;
  mode: "court" | "slideshow";
  court: number;
  theme: "dark" | "light";
  clockPosition: "top" | "bottom";
  /** Mode terrain : équipes gauche/droite inversées par rapport à l'arbitre (la TV voit le terrain de l'autre côté). */
  swapSides: boolean;
  slides: SlideEntry[] | null; // null = automatique
  slideSeconds: number;
  paused: boolean;
  pinnedSlide: string | null;
  announcement: string | null;
};

/** Ce qu'il faut savoir du tournoi pour proposer / choisir les diapos. */
export type SlideContext = {
  courtsCount: number;
  stages: Array<{
    order: number;
    name: string;
    type: string;
    status: string; // PENDING | ACTIVE | DONE
    groups: string[]; // clés de groupes ([] si un seul groupe)
    hasMatches: boolean;
    hasPending?: boolean; // des matchs encore à jouer (en cours / à venir)
  }>;
  hasScheduled: boolean;
  hasReferees: boolean;
  hasFinished: boolean;
  hasSponsors: boolean;
};

const POINTS_TYPES = new Set(["RR", "SWISS", "CROSS_POOL"]);
const BRACKET_TYPES = new Set(["SE", "DE", "PLACEMENT"]);

export function parseSlideKey(key: SlideKey):
  | { kind: "court"; court: number }
  | { kind: "courts" }
  | { kind: "overview" }
  | { kind: "standings"; stageOrder: number; group: string | null }
  | { kind: "bracket"; stageOrder: number }
  | { kind: "upcoming" | "referees" | "results" | "sponsors" | "qr" }
  | null {
  const [kind, a, b] = key.split(":");
  switch (kind) {
    case "court": return { kind, court: Math.max(1, Number(a) || 1) };
    case "standings": return { kind, stageOrder: Number(a) || 0, group: b && b !== "-" ? b : null };
    case "bracket": return { kind, stageOrder: Number(a) || 0 };
    case "courts": case "overview": case "upcoming": case "referees": case "results": case "sponsors": case "qr": return { kind };
    default: return null;
  }
}

/** Toutes les diapos proposables pour ce tournoi (pour composer un diaporama). */
export function slideCatalog(ctx: SlideContext): SlideKey[] {
  const keys: SlideKey[] = [];
  keys.push("overview");
  if (ctx.courtsCount > 1) keys.push("courts");
  for (let c = 1; c <= ctx.courtsCount; c++) keys.push(`court:${c}`);
  keys.push("upcoming", "referees", "results");
  for (const s of ctx.stages) {
    if (POINTS_TYPES.has(s.type)) {
      if (s.groups.length > 1) s.groups.forEach((g) => keys.push(`standings:${s.order}:${g}`));
      else keys.push(`standings:${s.order}:-`);
    } else if (BRACKET_TYPES.has(s.type)) {
      keys.push(`bracket:${s.order}`);
    }
  }
  keys.push("sponsors", "qr");
  return keys;
}

/**
 * Diaporama automatique : suit l'état du tournoi, sans réglage.
 * Terrains → prochains matchs → prochains arbitres → classements de l'étape en cours (ou de la
 * dernière jouée) → tableau en cours → résultats → sponsors → QR.
 */
export function autoSlides(ctx: SlideContext): SlideKey[] {
  const keys: SlideKey[] = [];
  keys.push(ctx.courtsCount > 1 ? "courts" : "court:1");
  if (ctx.hasScheduled) keys.push("upcoming");
  if (ctx.hasReferees) keys.push("referees");

  const focus = focusStages(ctx.stages);
  for (const s of focus) {
    if (POINTS_TYPES.has(s.type)) {
      if (s.groups.length > 1) s.groups.forEach((g) => keys.push(`standings:${s.order}:${g}`));
      else keys.push(`standings:${s.order}:-`);
    } else if (BRACKET_TYPES.has(s.type)) {
      keys.push(`bracket:${s.order}`);
    }
  }
  if (ctx.hasFinished) keys.push("results");
  if (ctx.hasSponsors) keys.push("sponsors");
  keys.push("qr");
  return keys;
}

/**
 * L'étape « d'actualité » : celle(s) en cours (statut ACTIVE ou matchs encore à
 * jouer), sinon la dernière jouée. Jamais une étape passée quand une autre
 * est en cours (ex. pas le classement du Swiss pendant l'élimination directe).
 */
export function focusStages<S extends { status: string; hasMatches: boolean; hasPending?: boolean }>(stages: S[]): S[] {
  const played = stages.filter((s) => s.hasMatches);
  const current = played.filter((s) => s.status === "ACTIVE" || s.hasPending);
  return current.length > 0 ? current : played.slice(-1);
}

/** Slug d'URL à partir d'un nom (« Écran bar » → « ecran-bar »). */
export function screenSlug(name: string): string {
  return name
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 40) || "ecran";
}

/** Écrans virtuels, disponibles sans rien configurer : diaporama auto + un par terrain. */
export function defaultScreens(courtsCount: number): ScreenConfig[] {
  const base = { theme: "dark" as const, clockPosition: "top" as const, swapSides: false, slides: null, slideSeconds: 12, paused: false, pinnedSlide: null, announcement: null };
  return [
    { ...base, slug: "diaporama", name: "", mode: "slideshow", court: 1 },
    // Tout d'un coup, sans rotation : une seule diapo « vue d'ensemble ».
    { ...base, slug: "vue-d-ensemble", name: "", mode: "slideshow", court: 1, slides: [{ key: "overview" }] },
    ...Array.from({ length: courtsCount }, (_, i) => ({ ...base, slug: `terrain-${i + 1}`, name: "", mode: "court" as const, court: i + 1 })),
  ];
}
