/**
 * Aperçu d'un format (fonction pure, utilisable côté client) : pour un nombre
 * d'équipes donné, ce que chaque étape va recevoir, jouer et transmettre —
 * avec les incohérences détectables AVANT le tournoi (plage de rangs qui
 * dépasse l'effectif, Swiss trop long, équipe prise par deux étapes…).
 *
 * Sert à l'orga (onglet Étapes / éditeur de format) et aux joueurs (« Comment
 * se joue le tournoi »).
 */
import type { EntryRules } from "./transitions";

export type PreviewStageInput = {
  name: string;
  type: "RR" | "SWISS" | "CROSS_POOL" | "PLACEMENT" | "SE" | "DE";
  config: Record<string, unknown>;
  entryRules: EntryRules;
};

export type PreviewWarning =
  | { kind: "range_beyond"; source: string; group: string | null; from: number; to: number; size: number }
  | { kind: "range_empty"; source: string; group: string | null; from: number; size: number }
  | { kind: "swiss_too_long"; rounds: number; maxRounds: number }
  | { kind: "overlap"; source: string; group: string | null; from: number; to: number; other: string }
  | { kind: "too_small"; teams: number; min: number }
  | { kind: "cross_pool_groups" };

export type PreviewOutflow = { to: string; group: string | null; from: number; to_: number };

export type PreviewStage = {
  name: string;
  type: PreviewStageInput["type"];
  teams: number;
  groupSizes: number[]; // une entrée par groupe ([n] si mono-groupe)
  rounds: number | null; // rounds par équipe (RR/Swiss/cross-pool), null pour un tableau
  matches: number; // estimation
  outflows: PreviewOutflow[]; // qui part où ensuite
  warnings: PreviewWarning[];
};

const GROUP_KEYS = ["A", "B", "C", "D", "E", "F", "G", "H"];

/** Tailles des groupes pour n équipes en g groupes (serpentin : écart ≤ 1). */
function split(n: number, g: number): number[] {
  const groups = Math.max(1, g);
  return Array.from({ length: groups }, (_, i) => Math.floor(n / groups) + (i < n % groups ? 1 : 0));
}

export function previewPipeline(stages: PreviewStageInput[], teamCount: number): PreviewStage[] {
  const out: PreviewStage[] = [];
  // Plages déjà prises, par (étape source, groupe) → pour détecter les doublons.
  const taken = new Map<string, Array<{ from: number; to: number; by: string }>>();

  stages.forEach((st) => {
    const warnings: PreviewWarning[] = [];
    let teams = 0;
    const perSourceCounts: number[] = [];
    for (const src of st.entryRules.sources) {
      if (src.kind === "registration") { teams += teamCount; perSourceCounts.push(teamCount); continue; }
      const prev = out[src.stageOrder];
      if (!prev) continue;
      const gIdx = src.group ? GROUP_KEYS.indexOf(src.group) : -1;
      const size = src.group ? (prev.groupSizes[gIdx] ?? 0) : prev.teams;
      // Sans groupe précisé sur une étape à groupes : rangs X-Y de CHAQUE groupe ? Non —
      // le moteur prend le classement général. On reste fidèle au moteur.
      const label = prev.name;
      if (src.from > size) {
        warnings.push({ kind: "range_empty", source: label, group: src.group ?? null, from: src.from, size });
        perSourceCounts.push(0);
        continue;
      }
      if (src.to > size) warnings.push({ kind: "range_beyond", source: label, group: src.group ?? null, from: src.from, to: src.to, size });
      const n = Math.min(src.to, size) - src.from + 1;
      teams += n;
      perSourceCounts.push(n);
      // Doublons : la même plage d'une même étape/groupe prise deux fois
      const key = `${src.stageOrder}|${src.group ?? "*"}`;
      const list = taken.get(key) ?? [];
      const clash = list.find((r) => r.from <= Math.min(src.to, size) && src.from <= r.to);
      if (clash) warnings.push({ kind: "overlap", source: label, group: src.group ?? null, from: src.from, to: src.to, other: clash.by });
      list.push({ from: src.from, to: Math.min(src.to, size), by: st.name });
      taken.set(key, list);
      prev.outflows.push({ to: st.name, group: src.group ?? null, from: src.from, to_: Math.min(src.to, size) });
    }

    // Groupes
    let groupSizes: number[];
    if (st.type === "CROSS_POOL") {
      const srcs = st.entryRules.sources;
      if (srcs.length > 1) groupSizes = perSourceCounts.filter((n) => n > 0);
      else {
        const src = srcs[0];
        const prev = src?.kind === "stageRanks" ? out[src.stageOrder] : undefined;
        groupSizes = prev && prev.groupSizes.length > 1 && src?.kind === "stageRanks" && !src.group
          ? prev.groupSizes.map((g) => Math.max(0, Math.min(src.to, g) - src.from + 1))
          : split(teams, st.entryRules.groups ?? 1);
        if (prev && prev.groupSizes.length > 1 && src?.kind === "stageRanks" && !src.group) teams = groupSizes.reduce((a, b) => a + b, 0);
      }
      if (groupSizes.length < 2) warnings.push({ kind: "cross_pool_groups" });
    } else if (st.entryRules.groupAssign === "source" && perSourceCounts.length > 1) {
      // Une source = un groupe (ex : les 1ers-2es de la poule A restent ensemble).
      groupSizes = perSourceCounts.filter((n) => n > 0);
    } else {
      groupSizes = split(teams, st.entryRules.groups ?? 1);
    }

    // Rounds / matchs
    let rounds: number | null = null;
    let matches = 0;
    const cfg = st.config;
    if (st.type === "RR") {
      // Par groupe de n : n-1 rounds (n si impair, BYE tournant), n/2 matchs par round.
      const perGroup = (n: number) => {
        const base = n % 2 === 0 ? n - 1 : n;
        const all = cfg.doubleRound ? base * 2 : base;
        const r = cfg.maxRounds ? Math.min(Number(cfg.maxRounds), all) : all;
        return { r, m: r * Math.floor(n / 2) };
      };
      rounds = Math.max(...groupSizes.map((n) => perGroup(n).r));
      matches = groupSizes.reduce((sum, n) => sum + perGroup(n).m, 0);
    } else if (st.type === "SWISS") {
      rounds = Number(cfg.rounds ?? 5);
      matches = groupSizes.reduce((sum, n) => sum + rounds! * Math.floor(n / 2), 0);
      const smallest = Math.min(...groupSizes);
      // Avec un cumul de points, les adversaires des étapes précédentes sont aussi « déjà joués » : on reste prudent.
      if (smallest > 1 && rounds > smallest - 1) warnings.push({ kind: "swiss_too_long", rounds, maxRounds: smallest - 1 });
    } else if (st.type === "CROSS_POOL") {
      const n = Math.max(...groupSizes, 0);
      rounds = Math.min(Number(cfg.opponents ?? 1), n);
      matches = rounds * Math.min(...groupSizes, n);
    } else if (st.type === "PLACEMENT") {
      matches = Math.min(Number(cfg.count ?? Math.floor(teams / 2)), Math.floor(teams / 2));
    } else if (st.type === "SE") {
      matches = Math.max(0, teams - 1) + (cfg.thirdPlace && teams >= 4 ? 1 : 0);
    } else if (st.type === "DE") {
      matches = Math.max(0, 2 * teams - 2);
    }

    const min = st.type === "DE" ? 3 : 2;
    if (teams < min) warnings.push({ kind: "too_small", teams, min });

    out.push({ name: st.name, type: st.type, teams, groupSizes, rounds, matches, outflows: [], warnings });
  });
  return out;
}

/** Total de matchs estimé et nombre d'avertissements, pour un résumé en une ligne. */
export function previewTotals(p: PreviewStage[]): { matches: number; warnings: number } {
  return { matches: p.reduce((s, x) => s + x.matches, 0), warnings: p.reduce((s, x) => s + x.warnings.length, 0) };
}
