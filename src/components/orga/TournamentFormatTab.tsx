"use client";

/**
 * Onglet « Format » du dashboard orga (tournois pipeline) : choisir un preset
 * en un clic ou composer un format sur mesure, puis l'enregistrer. Remplace
 * l'ancien sélecteur de formats legacy. Verrouillé dès qu'un match est joué.
 */
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { PipelineStageList, makeDefaultStage, type BuilderStage } from "@/components/PipelineStageList";
import { TYPE_LABEL_KEY, newKey, type StageType, type BuilderStage as BS } from "@/components/sandbox/PipelineBuilder";

// Clés des presets exposés (métadonnées traduites côté client ; la recette
// réelle est construite côté serveur par applyPipelinePresetAction).
const PRESET_KEYS = ["pools_se", "swiss_de", "big_apple"] as const;

type StageLite = { name: string; type: string; config: unknown; entryRules: unknown };

export function TournamentFormatTab({
  tournamentId,
  courtsCount,
  hasPlayedMatches,
  currentStages,
  applyPresetAction,
  setPipelineAction,
}: {
  tournamentId: string;
  courtsCount: number;
  hasPlayedMatches: boolean;
  currentStages: StageLite[];
  applyPresetAction: (presetKey: string) => Promise<{ ok?: boolean; error?: string }>;
  setPipelineAction: (stages: unknown) => Promise<{ ok?: boolean; error?: string }>;
}) {
  const t = useTranslations("tournament");
  const tt = useTranslations("tournament");
  const typeLabel = (ty: StageType) => tt(TYPE_LABEL_KEY[ty] as never);

  // Compo custom : initialisée depuis les étapes actuelles, ou une étape vide.
  const [stages, setStages] = useState<BuilderStage[]>(() =>
    currentStages.length > 0
      ? currentStages.map((s) => ({
          key: newKey(), name: s.name, type: s.type as StageType,
          config: (s.config ?? {}) as Record<string, unknown>,
          entryRules: (s.entryRules ?? { sources: [{ kind: "registration" }] }) as BS["entryRules"],
        }))
      : [makeDefaultStage(0, typeLabel)],
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const applyPreset = (key: string) => {
    if (!window.confirm(t("format_apply_confirm"))) return;
    setError(null); setOk(false);
    startTransition(async () => {
      const res = await applyPresetAction(key);
      if (res.error) setError(res.error);
      else { setOk(true); setTimeout(() => window.location.reload(), 600); }
    });
  };

  const saveCustom = () => {
    if (!window.confirm(t("format_apply_confirm"))) return;
    setError(null); setOk(false);
    startTransition(async () => {
      const res = await setPipelineAction(
        stages.map(({ name, type, config, entryRules }) => ({ name, type, config, entryRules })),
      );
      if (res.error) setError(res.error);
      else { setOk(true); setTimeout(() => window.location.reload(), 600); }
    });
  };

  if (hasPlayedMatches) {
    return (
      <div className="panel" style={{ padding: 20 }}>
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
          🔒 {t("format_locked_played")}
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Presets */}
      <div className="panel" style={{ padding: 20 }}>
        <p style={{ fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", margin: "0 0 12px" }}>
          {t("format_presets_title")}
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
          {PRESET_KEYS.map((key) => (
            <button key={key} type="button" className="ghost" disabled={pending}
              onClick={() => applyPreset(key)}
              style={{ textAlign: "left", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 4, height: "auto" }}>
              <strong style={{ fontSize: 14 }}>{t(`preset_${key}_label` as never)}</strong>
              <span style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.4 }}>{t(`preset_${key}_desc` as never)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Composition custom */}
      <div className="panel" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", margin: 0 }}>
          {t("format_custom_title")}
        </p>
        <PipelineStageList stages={stages} courtsCount={courtsCount} onChange={setStages} />
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button className="primary" disabled={pending} onClick={saveCustom}>
            {pending ? "…" : t("format_save")}
          </button>
          {ok && <span style={{ fontSize: 13, color: "var(--teal)", fontWeight: 700 }}>✓ {t("format_saved")}</span>}
          {error && <span style={{ fontSize: 13, color: "var(--danger)" }}>{error}</span>}
        </div>
      </div>
    </div>
  );
}
