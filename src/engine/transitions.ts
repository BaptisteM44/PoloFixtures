/**
 * Moteur de transitions — résout "qui entre dans cette étape et dans quel ordre"
 * à partir de règles déclaratives (stockées dans Stage.entryRules).
 *
 * Exemples :
 *   - Big Apple Swiss : rangs 3-8 du groupe A + rangs 3-8 du groupe B du stage 0
 *   - Split Swiss bracket : rangs 1-8 de A et de B, entrelacés A1,B1,A2,B2…
 *   - SE final : rangs 1-4 du placement + rangs 1-4 du Swiss
 *
 * Fonctions pures : le contexte fournit les classements, le moteur ne touche
 * pas à la DB.
 */

export type EntrySource =
  | { kind: "registration" } // seeds initiaux du tournoi (équipes sélectionnées triées)
  | { kind: "stageRanks"; stageOrder: number; group?: string; from: number; to: number }; // rangs 1-based inclusifs

export type GroupAssign = "snake" | "interleave" | "block" | "manual";

export type EntryRules = {
  /** Sources concaténées dans l'ordre = ordre de seed du stage. */
  sources: EntrySource[];
  /** Entrelacer les sources (A1,B1,A2,B2…) au lieu de les concaténer. */
  interleaveSources?: boolean;
  /** Découpage en groupes (défaut 1 = mono-groupe, groupKey ""). */
  groups?: number;
  /** Mode de répartition en groupes (défaut "snake"). */
  groupAssign?: GroupAssign;
  /**
   * Composition manuelle des groupes (groupAssign="manual") : teamId → lettre
   * de groupe ("A", "B", …). Renseignée par l'orga avant le lancement de
   * l'étape. Les équipes non assignées sont réparties en serpentin sur les
   * groupes les moins remplis.
   */
  manualAssignments?: Record<string, string>;
};

export type ResolvedEntry = { groupKey: string; slot: number; teamId: string };

export type ResolveOptions = {
  /**
   * Une source = un groupe (source 0 → A, source 1 → B…). Utilisé par le
   * cross-pool, qui oppose intrinsèquement deux poules : chaque source garde
   * son origine comme groupe, quel que soit le champ `groups`. Ignoré s'il
   * n'y a qu'une seule source (comportement mono-groupe habituel).
   */
  sourcesAsGroups?: boolean;
};

export type TransitionContext = {
  /** Équipes sélectionnées du tournoi, triées par seed initial. */
  registrationSeeds: string[];
  /** Classement d'un stage (teamIds triés, meilleur d'abord), par groupe éventuel. */
  stageStandings: (stageOrder: number, group?: string) => string[];
};

const GROUP_KEYS = ["A", "B", "C", "D", "E", "F", "G", "H"];

export function resolveEntries(rules: EntryRules, ctx: TransitionContext, opts?: ResolveOptions): ResolvedEntry[] {
  // 1. Résoudre chaque source en liste ordonnée
  const lists: string[][] = rules.sources.map((src) => {
    if (src.kind === "registration") return [...ctx.registrationSeeds];
    const ranked = ctx.stageStandings(src.stageOrder, src.group);
    return ranked.slice(src.from - 1, src.to);
  });

  // Cas cross-pool : une source = un groupe (A, B, …), en préservant l'ordre
  // de classement de chaque poule. Dédoublonnage par groupe.
  if (opts?.sourcesAsGroups && lists.length > 1) {
    const out: ResolvedEntry[] = [];
    const seen = new Set<string>();
    lists.forEach((list, gi) => {
      let slot = 1;
      for (const teamId of list) {
        if (seen.has(teamId)) continue;
        seen.add(teamId);
        out.push({ groupKey: GROUP_KEYS[gi] ?? String(gi), slot: slot++, teamId });
      }
    });
    return out;
  }

  // 2. Concaténer ou entrelacer
  let ordered: string[];
  if (rules.interleaveSources && lists.length > 1) {
    ordered = [];
    const maxLen = Math.max(...lists.map((l) => l.length));
    for (let i = 0; i < maxLen; i++) {
      for (const list of lists) {
        if (i < list.length) ordered.push(list[i]);
      }
    }
  } else {
    ordered = lists.flat();
  }

  // Garde : une équipe ne peut entrer qu'une fois
  const seen = new Set<string>();
  ordered = ordered.filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  // 3. Répartir en groupes
  const groups = Math.max(rules.groups ?? 1, 1);
  if (groups === 1) {
    return ordered.map((teamId, i) => ({ groupKey: "", slot: i + 1, teamId }));
  }

  const assign = rules.groupAssign ?? "snake";
  const buckets: string[][] = Array.from({ length: groups }, () => []);

  if (assign === "manual") {
    // Composition manuelle : l'orga a choisi le groupe de chaque équipe.
    // Les non-assignées vont dans les groupes les moins remplis (ordre de seed).
    const manual = rules.manualAssignments ?? {};
    const letters = GROUP_KEYS.slice(0, groups);
    const unassigned: string[] = [];
    for (const teamId of ordered) {
      const idx = letters.indexOf(manual[teamId] ?? "");
      if (idx >= 0) buckets[idx].push(teamId);
      else unassigned.push(teamId);
    }
    for (const teamId of unassigned) {
      let min = 0;
      for (let g = 1; g < groups; g++) if (buckets[g].length < buckets[min].length) min = g;
      buckets[min].push(teamId);
    }
  } else {
    ordered.forEach((teamId, i) => {
      let g: number;
      if (assign === "interleave") {
        g = i % groups; // 1→A, 2→B, 3→A, 4→B…
      } else if (assign === "block") {
        g = Math.floor(i / Math.ceil(ordered.length / groups)); // premiers ensemble
      } else {
        // snake : A B B A A B B A…
        const round = Math.floor(i / groups);
        const pos = i % groups;
        g = round % 2 === 0 ? pos : groups - 1 - pos;
      }
      buckets[Math.min(g, groups - 1)].push(teamId);
    });
  }

  const out: ResolvedEntry[] = [];
  buckets.forEach((bucket, g) => {
    bucket.forEach((teamId, i) => {
      out.push({ groupKey: GROUP_KEYS[g] ?? String(g), slot: i + 1, teamId });
    });
  });
  return out;
}
