/**
 * Validation zod des pipelines composés côté client (builder custom).
 * Miroir strict des types StageDef/EntryRules/StageConfigByType de
 * pipeline-server.ts — à maintenir synchronisé si ces types évoluent.
 */
import { z } from "zod";
import type { StageDef } from "./pipeline-server";

const entrySourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("registration") }),
  z.object({
    kind: z.literal("stageRanks"),
    stageOrder: z.number().int().min(0),
    group: z.string().max(1).optional(),
    from: z.number().int().min(1),
    to: z.number().int().min(1),
  }),
]);

const entryRulesSchema = z.object({
  sources: z.array(entrySourceSchema).min(1, "Au moins une source d'équipes requise."),
  interleaveSources: z.boolean().optional(),
  groups: z.number().int().min(1).max(8).optional(),
  groupAssign: z.enum(["snake", "interleave", "block", "manual"]).optional(),
  manualAssignments: z.record(z.string(), z.string().max(1)).optional(),
});

const stageConfigSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("RR"),
    config: z.object({
      groups: z.number().int().min(1).max(8).optional(),
      doubleRound: z.boolean().optional(),
      maxRounds: z.number().int().min(1).max(30).optional(),
      courtMode: z.enum(["sequential", "dedicated", "mixed"]).optional(),
      groupStartAt: z.record(z.string().max(1), z.string().datetime()).optional(),
    }),
  }),
  z.object({
    type: z.literal("SWISS"),
    config: z.object({
      rounds: z.number().int().min(1).max(15),
      inheritFrom: z.number().int().min(0).optional(),
      courtMode: z.enum(["sequential", "dedicated", "mixed"]).optional(),
      groupStartAt: z.record(z.string().max(1), z.string().datetime()).optional(),
    }),
  }),
  z.object({
    type: z.literal("CROSS_POOL"),
    config: z.object({ opponents: z.number().int().min(1).max(16) }),
  }),
  z.object({
    type: z.literal("PLACEMENT"),
    config: z.object({ count: z.number().int().min(1).max(16).optional() }),
  }),
  z.object({
    type: z.literal("SE"),
    config: z.object({ thirdPlace: z.boolean().optional() }),
  }),
  z.object({
    type: z.literal("DE"),
    config: z.object({ gfReset: z.boolean().optional() }),
  }),
]);

const stageDefSchema = z.object({
  name: z.string().min(1).max(80),
  entryRules: entryRulesSchema,
}).and(stageConfigSchema);

export const customPipelineSchema = z.array(stageDefSchema)
  .min(1, "Le pipeline doit contenir au moins une étape.")
  .max(12, "Maximum 12 étapes.")
  .superRefine((stages, ctx) => {
    stages.forEach((s, i) => {
      for (const src of s.entryRules.sources) {
        if (src.kind !== "stageRanks") continue;
        // Une étape ne peut référencer que des étapes STRICTEMENT antérieures
        if (src.stageOrder >= i) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Étape ${i + 1} ("${s.name}") : ne peut référencer que des étapes précédentes (0 à ${i - 1}).`,
            path: [i, "entryRules"],
          });
        }
        // 'to' doit être ≥ 'from' (contrôlé ici, hors discriminatedUnion pour rester typé)
        if (src.to < src.from) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Étape ${i + 1} ("${s.name}") : 'to' doit être ≥ 'from'.`,
            path: [i, "entryRules"],
          });
        }
      }
    });
  });

export type CustomPipelineInput = z.infer<typeof customPipelineSchema>;

export function validateCustomPipeline(input: unknown): { ok: true; stages: StageDef[] } | { ok: false; error: string } {
  const parsed = customPipelineSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join(" · ") };
  }
  return { ok: true, stages: parsed.data as unknown as StageDef[] };
}
