/**
 * Presets de pipelines — des formats complets exprimés comme recettes de
 * briques génériques. C'est la démonstration du système : Big Apple tient
 * en 4 étapes déclaratives (vs ~800 lignes de code dédié en legacy).
 */
import type { StageDef } from "./pipeline-server";

export type PipelinePreset = {
  key: string;
  label: string;
  description: string;
  minTeams: number;
  build: (teamCount: number) => StageDef[];
};

export const PIPELINE_PRESETS: PipelinePreset[] = [
  {
    key: "pools_se",
    label: "2 poules → SE 8",
    description: "Round robin en 2 poules, puis élimination simple des 8 meilleurs (+3e place).",
    minTeams: 8,
    build: () => [
      {
        name: "Poules",
        type: "RR",
        config: {},
        entryRules: { sources: [{ kind: "registration" }], groups: 2, groupAssign: "snake" },
      },
      {
        name: "Bracket final",
        type: "SE",
        config: { thirdPlace: true },
        entryRules: {
          sources: [
            { kind: "stageRanks", stageOrder: 0, group: "A", from: 1, to: 4 },
            { kind: "stageRanks", stageOrder: 0, group: "B", from: 1, to: 4 },
          ],
          interleaveSources: true, // A1,B1,A2,B2… = seeds 1-8
        },
      },
    ],
  },
  {
    key: "swiss_de",
    label: "Swiss 5 → DE 8",
    description: "5 rounds suisses, puis double élimination des 8 meilleurs (GF reset).",
    minTeams: 8,
    build: () => [
      {
        name: "Swiss",
        type: "SWISS",
        config: { rounds: 5 },
        entryRules: { sources: [{ kind: "registration" }] },
      },
      {
        name: "Double élimination",
        type: "DE",
        config: { gfReset: true },
        entryRules: { sources: [{ kind: "stageRanks", stageOrder: 0, from: 1, to: 8 }] },
      },
    ],
  },
  {
    key: "big_apple",
    label: "🍎 Big Apple",
    description: "RR 2×8 → Swiss 12 (rangs 3-8, points hérités) + placement des 1ers/2es → SE 8.",
    minTeams: 12,
    build: (n) => {
      const perGroup = Math.floor(n / 2);
      return [
        {
          name: "Poules samedi",
          type: "RR",
          config: {},
          entryRules: { sources: [{ kind: "registration" }], groups: 2, groupAssign: "snake" },
        },
        {
          name: "Swiss dimanche (3-8)",
          type: "SWISS",
          // carryPoints (en plus d'inheritFrom) est indispensable : sans lui,
          // le Swiss ignore les duels déjà joués en poule et peut réapparier
          // deux équipes qui se sont déjà rencontrées — leur confrontation RR
          // est alors comptée une 2e fois via inheritFrom (points + victoire
          // fantômes, nombre de matchs incohérent).
          config: { rounds: 3, inheritFrom: 0, carryPoints: true },
          // Un seul groupe fusionné de 12 (rangs 3-8 de A + rangs 3-8 de B),
          // pas 2 groupes séparés de 6 : avec 12 équipes il y a bien plus
          // d'adversaires "frais" disponibles pour les 3 rounds, donc moins
          // de rematchs forcés qu'avec 2×6 (confirmé auprès de l'organisateur
          // à l'origine du format — la demande initiale était un seul groupe).
          entryRules: {
            sources: [
              { kind: "stageRanks", stageOrder: 0, group: "A", from: 3, to: perGroup },
              { kind: "stageRanks", stageOrder: 0, group: "B", from: 3, to: perGroup },
            ],
          },
        },
        {
          name: "Placement 1ers/2es",
          type: "PLACEMENT",
          config: { count: 2 },
          entryRules: {
            // A1,B1,A2,B2 → paires (A1vB1) places 1/2, (A2vB2) places 3/4
            sources: [
              { kind: "stageRanks", stageOrder: 0, group: "A", from: 1, to: 2 },
              { kind: "stageRanks", stageOrder: 0, group: "B", from: 1, to: 2 },
            ],
            interleaveSources: true,
          },
        },
        {
          name: "Bracket final",
          type: "SE",
          config: { thirdPlace: true },
          entryRules: {
            sources: [
              { kind: "stageRanks", stageOrder: 2, from: 1, to: 4 }, // placement → seeds 1-4
              { kind: "stageRanks", stageOrder: 1, from: 1, to: 4 }, // swiss → seeds 5-8
            ],
          },
        },
      ];
    },
  },
  {
    key: "monster_demo",
    label: "🧪 Démo monstre",
    description: "Swiss 3 → cross-pool haut/bas → 4 groupes × 2 tours → DE 8. L'exemple « tout est possible ».",
    minTeams: 16,
    build: (n) => {
      const half = Math.floor(n / 2);
      return [
        {
          name: "Swiss d'ouverture",
          type: "SWISS",
          config: { rounds: 3 },
          entryRules: { sources: [{ kind: "registration" }] },
        },
        {
          name: "Cross-pool haut/bas",
          type: "CROSS_POOL",
          config: { opponents: 1 },
          entryRules: {
            sources: [{ kind: "stageRanks", stageOrder: 0, from: 1, to: n }],
            groups: 2,
            groupAssign: "block", // rangs 1-8 = groupe A, 9-16 = groupe B
          },
        },
        {
          name: "4 groupes, 2 tours",
          type: "RR",
          config: { maxRounds: 2 },
          entryRules: {
            sources: [{ kind: "stageRanks", stageOrder: 0, from: 1, to: n }],
            groups: 4,
            groupAssign: "snake",
          },
        },
        {
          name: "Double élimination finale",
          type: "DE",
          config: { gfReset: false },
          entryRules: { sources: [{ kind: "stageRanks", stageOrder: 2, from: 1, to: Math.min(8, half) }] },
        },
      ];
    },
  },
];

export function getPreset(key: string): PipelinePreset | undefined {
  return PIPELINE_PRESETS.find((p) => p.key === key);
}
