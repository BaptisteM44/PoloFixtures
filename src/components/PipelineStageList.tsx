"use client";

/**
 * Liste d'étapes composables (add / réordonner / dupliquer / supprimer /
 * changer le type / configurer). Cœur d'édition partagé entre le builder
 * sandbox et l'onglet Format du dashboard réel — un composant contrôlé :
 * l'appelant possède le tableau `stages` et reçoit ses mises à jour via
 * `onChange`.
 */
import { useTranslations } from "next-intl";
import {
  StageCard, defaultStage, defaultConfig, newKey,
  STAGE_TYPES, TYPE_LABEL_KEY,
  type BuilderStage, type StageType,
} from "@/components/sandbox/PipelineBuilder";

export type { BuilderStage } from "@/components/sandbox/PipelineBuilder";

/** Crée une étape par défaut avec un nom = libellé de son type. */
export function makeDefaultStage(order: number, typeLabel: (t: StageType) => string): BuilderStage {
  const s = defaultStage(order);
  s.name = typeLabel(s.type);
  return s;
}

export function PipelineStageList({
  stages,
  courtsCount,
  onChange,
}: {
  stages: BuilderStage[];
  courtsCount: number;
  onChange: (stages: BuilderStage[]) => void;
}) {
  const t = useTranslations("sandbox");
  const tt = useTranslations("tournament");
  const typeLabel = (ty: StageType) => tt(TYPE_LABEL_KEY[ty] as never);

  const update = (i: number, patch: Partial<BuilderStage>) =>
    onChange(stages.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  const addStage = () =>
    onChange([...stages, makeDefaultStage(stages.length, typeLabel)]);

  const removeStage = (i: number) => onChange(stages.filter((_, idx) => idx !== i));

  const duplicateStage = (i: number) => {
    const copy = { ...stages[i], key: newKey(), name: `${stages[i].name} (${t("duplicate").toLowerCase()})` };
    onChange([...stages.slice(0, i + 1), copy, ...stages.slice(i + 1)]);
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= stages.length) return;
    const copy = [...stages];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    onChange(copy);
  };

  const changeType = (i: number, type: StageType) =>
    onChange(stages.map((s, idx) => {
      if (idx !== i) return s;
      // Nom encore par défaut (libellé d'un type ou "Étape N") → suit le nouveau type.
      const isDefaultName =
        STAGE_TYPES.some((ty) => s.name === typeLabel(ty)) ||
        s.name === t("stage_default_name", { n: i + 1 });
      return { ...s, type, config: defaultConfig(type), name: isDefaultName ? typeLabel(type) : s.name };
    }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {stages.map((stage, i) => (
        <StageCard
          key={stage.key}
          index={i}
          stage={stage}
          availablePrevStages={stages.slice(0, i).map((s, idx) => ({ order: idx, name: s.name }))}
          courtsCount={courtsCount}
          onChange={(patch) => update(i, patch)}
          onChangeType={(type) => changeType(i, type)}
          onRemove={stages.length > 1 ? () => removeStage(i) : undefined}
          onDuplicate={() => duplicateStage(i)}
          onMoveUp={i > 0 ? () => move(i, -1) : undefined}
          onMoveDown={i < stages.length - 1 ? () => move(i, 1) : undefined}
        />
      ))}
      <div>
        <button className="ghost" onClick={addStage}>{t("add_stage")}</button>
      </div>
    </div>
  );
}
