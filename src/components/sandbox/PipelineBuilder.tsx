"use client";

/**
 * Builder custom — compose librement une chaîne d'étapes (n'importe quelle
 * formule de tournoi) : ajoute/réordonne/duplique/supprime des étapes,
 * configure chacune et choisit d'où viennent ses équipes.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createCustomSandboxAction } from "@/app/[locale]/sandbox/actions";

type StageType = "RR" | "SWISS" | "CROSS_POOL" | "PLACEMENT" | "SE" | "DE";

type EntrySource =
  | { kind: "registration" }
  | { kind: "stageRanks"; stageOrder: number; group?: string; from: number; to: number };

type EntryRules = {
  sources: EntrySource[];
  interleaveSources?: boolean;
  groups?: number;
  groupAssign?: "snake" | "interleave" | "block" | "manual";
};

type BuilderStage = {
  key: string;
  name: string;
  type: StageType;
  config: Record<string, unknown>;
  entryRules: EntryRules;
};

let uid = 0;
const newKey = () => `s${Date.now()}_${uid++}`;

function defaultConfig(type: StageType): Record<string, unknown> {
  switch (type) {
    case "RR": return { groups: 1 };
    case "SWISS": return { rounds: 5 };
    case "CROSS_POOL": return { opponents: 1 };
    case "PLACEMENT": return { count: 2 };
    case "SE": return { thirdPlace: true };
    case "DE": return { gfReset: false };
  }
}

function defaultStage(order: number): BuilderStage {
  return {
    key: newKey(),
    name: `__default_${order}`, // placeholder, remplacé au rendu par le libellé traduit
    type: order === 0 ? "RR" : "SE",
    config: defaultConfig(order === 0 ? "RR" : "SE"),
    entryRules: order === 0
      ? { sources: [{ kind: "registration" }] }
      : { sources: [{ kind: "stageRanks", stageOrder: order - 1, from: 1, to: 8 }] },
  };
}

export function PipelineBuilder({ maxTeams }: { maxTeams: number }) {
  const t = useTranslations("sandbox");
  const router = useRouter();
  const [name, setName] = useState(t("format_name_default"));
  const [teamCount, setTeamCount] = useState(16);
  const [courtsCount, setCourtsCount] = useState(2);
  const [duration, setDuration] = useState(12);
  const [stages, setStages] = useState<BuilderStage[]>(() => {
    const s = defaultStage(0);
    s.name = t("stage_default_name", { n: 1 });
    return [s];
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const update = (i: number, patch: Partial<BuilderStage>) => {
    setStages((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  };

  const addStage = () => setStages((prev) => {
    const s = defaultStage(prev.length);
    s.name = t("stage_default_name", { n: prev.length + 1 });
    return [...prev, s];
  });
  const removeStage = (i: number) => setStages((prev) => prev.filter((_, idx) => idx !== i));
  const duplicateStage = (i: number) => setStages((prev) => {
    const copy = { ...prev[i], key: newKey(), name: `${prev[i].name} (${t("duplicate").toLowerCase()})` };
    return [...prev.slice(0, i + 1), copy, ...prev.slice(i + 1)];
  });
  const move = (i: number, dir: -1 | 1) => setStages((prev) => {
    const j = i + dir;
    if (j < 0 || j >= prev.length) return prev;
    const copy = [...prev];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    return copy;
  });

  const changeType = (i: number, type: StageType) => {
    update(i, { type, config: defaultConfig(type) });
  };

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await createCustomSandboxAction({
        name, teamCount, courtsCount, gameDurationMin: duration,
        stages: stages.map(({ name: n, type, config, entryRules }) => ({ name: n, type, config, entryRules })),
      });
      if (res.error) setError(res.error);
      else if (res.id) router.push(`/sandbox/${res.id}`);
    });
  };

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "end" }}>
        <label style={{ fontSize: 13 }}>
          {t("format_name")}<br />
          <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: 200 }} />
        </label>
        <label style={{ fontSize: 13 }}>
          {t("teams")}<br />
          <input type="number" min={2} max={64} value={teamCount} onChange={(e) => setTeamCount(Number(e.target.value))} style={{ width: 80 }} />
        </label>
        <label style={{ fontSize: 13 }}>
          {t("courts")}<br />
          <input type="number" min={1} max={4} value={courtsCount} onChange={(e) => setCourtsCount(Number(e.target.value))} style={{ width: 80 }} />
        </label>
        <label style={{ fontSize: 13 }}>
          {t("duration")}<br />
          <input type="number" min={5} max={40} value={duration} onChange={(e) => setDuration(Number(e.target.value))} style={{ width: 80 }} />
        </label>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {stages.map((stage, i) => (
          <StageCard
            key={stage.key}
            index={i}
            stage={stage}
            availablePrevStages={stages.slice(0, i).map((s, idx) => ({ order: idx, name: s.name }))}
            onChange={(patch) => update(i, patch)}
            onChangeType={(type) => changeType(i, type)}
            onRemove={stages.length > 1 ? () => removeStage(i) : undefined}
            onDuplicate={() => duplicateStage(i)}
            onMoveUp={i > 0 ? () => move(i, -1) : undefined}
            onMoveDown={i < stages.length - 1 ? () => move(i, 1) : undefined}
          />
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button className="ghost" onClick={addStage}>{t("add_stage")}</button>
        <button className="primary" disabled={pending} onClick={submit} style={{ marginLeft: "auto" }}>
          {pending ? t("creating") : t("create_custom")}
        </button>
      </div>
      {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}
    </div>
  );
}

// ─── Carte d'une étape ────────────────────────────────────────────────────────

const STAGE_TYPES: StageType[] = ["RR", "SWISS", "CROSS_POOL", "PLACEMENT", "SE", "DE"];

function StageCard({
  index, stage, availablePrevStages, onChange, onChangeType, onRemove, onDuplicate, onMoveUp, onMoveDown,
}: {
  index: number;
  stage: BuilderStage;
  availablePrevStages: Array<{ order: number; name: string }>;
  onChange: (patch: Partial<BuilderStage>) => void;
  onChangeType: (t: StageType) => void;
  onRemove?: () => void;
  onDuplicate: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const t = useTranslations("sandbox");
  const typeLabelKey: Record<StageType, string> = {
    RR: "pipeline_type_rr", SWISS: "pipeline_type_swiss", CROSS_POOL: "pipeline_type_cross_pool",
    PLACEMENT: "pipeline_type_placement", SE: "pipeline_type_se", DE: "pipeline_type_de",
  };
  const hintKey: Record<StageType, string> = {
    RR: "hint_rr", SWISS: "hint_swiss", CROSS_POOL: "hint_cross_pool",
    PLACEMENT: "hint_placement", SE: "hint_se", DE: "hint_de",
  };

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 800, fontSize: 13, color: "var(--text-muted)" }}>#{index + 1}</span>
        <input
          value={stage.name}
          onChange={(e) => onChange({ name: e.target.value })}
          style={{ fontWeight: 700, fontSize: 14, flex: "1 1 160px", minWidth: 120 }}
        />
        <select value={stage.type} onChange={(e) => onChangeType(e.target.value as StageType)}>
          {STAGE_TYPES.map((ty) => (
            <option key={ty} value={ty}>{t(typeLabelKey[ty] as never)}</option>
          ))}
        </select>
        <div style={{ display: "flex", gap: 4 }}>
          {onMoveUp && <button className="ghost" title={t("move_up")} onClick={onMoveUp}>↑</button>}
          {onMoveDown && <button className="ghost" title={t("move_down")} onClick={onMoveDown}>↓</button>}
          <button className="ghost" title={t("duplicate")} onClick={onDuplicate}>⧉</button>
          {onRemove && <button className="ghost" title={t("delete")} style={{ color: "var(--danger)" }} onClick={onRemove}>🗑</button>}
        </div>
      </div>
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 10px" }}>{t(hintKey[stage.type] as never)}</p>

      <StageConfigFields type={stage.type} config={stage.config} onChange={(config) => onChange({ config })} />

      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed var(--border)" }}>
        <EntryRulesFields
          entryRules={stage.entryRules}
          availablePrevStages={availablePrevStages}
          onChange={(entryRules) => onChange({ entryRules })}
        />
      </div>
    </div>
  );
}

// ─── Config par type ──────────────────────────────────────────────────────────

function StageConfigFields({ type, config, onChange }: { type: StageType; config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const t = useTranslations("sandbox");
  const set = (k: string, v: unknown) => onChange({ ...config, [k]: v });

  switch (type) {
    case "RR":
      return (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13 }}>
          <label>{t("cfg_groups")} <input type="number" min={1} max={8} value={Number(config.groups ?? 1)} onChange={(e) => set("groups", Number(e.target.value))} style={{ width: 60 }} /></label>
          <label>{t("cfg_max_rounds")} <input type="number" min={1} max={30} value={Number(config.maxRounds ?? "")} onChange={(e) => set("maxRounds", e.target.value ? Number(e.target.value) : undefined)} style={{ width: 60 }} /></label>
          <label><input type="checkbox" checked={!!config.doubleRound} onChange={(e) => set("doubleRound", e.target.checked)} /> {t("cfg_double_round")}</label>
        </div>
      );
    case "SWISS":
      return (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13 }}>
          <label>{t("cfg_rounds")} <input type="number" min={1} max={15} value={Number(config.rounds ?? 5)} onChange={(e) => set("rounds", Number(e.target.value))} style={{ width: 60 }} /></label>
        </div>
      );
    case "CROSS_POOL":
      return (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13 }}>
          <label>{t("cfg_opponents")} <input type="number" min={1} max={16} value={Number(config.opponents ?? 1)} onChange={(e) => set("opponents", Number(e.target.value))} style={{ width: 60 }} /></label>
        </div>
      );
    case "PLACEMENT":
      return (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13 }}>
          <label>{t("cfg_duels")} <input type="number" min={1} max={16} value={Number(config.count ?? 2)} onChange={(e) => set("count", Number(e.target.value))} style={{ width: 60 }} /></label>
        </div>
      );
    case "SE":
      return (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13 }}>
          <label><input type="checkbox" checked={!!config.thirdPlace} onChange={(e) => set("thirdPlace", e.target.checked)} /> {t("cfg_third_place")}</label>
        </div>
      );
    case "DE":
      return (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13 }}>
          <label><input type="checkbox" checked={!!config.gfReset} onChange={(e) => set("gfReset", e.target.checked)} /> {t("cfg_gf_reset")}</label>
        </div>
      );
  }
}

// ─── Sources d'entrée ─────────────────────────────────────────────────────────

function EntryRulesFields({
  entryRules, availablePrevStages, onChange,
}: {
  entryRules: EntryRules;
  availablePrevStages: Array<{ order: number; name: string }>;
  onChange: (r: EntryRules) => void;
}) {
  const t = useTranslations("sandbox");
  const isFirst = availablePrevStages.length === 0;

  const updateSource = (i: number, src: EntrySource) => {
    const sources = [...entryRules.sources];
    sources[i] = src;
    onChange({ ...entryRules, sources });
  };
  const addSource = () => {
    if (isFirst) return;
    onChange({ ...entryRules, sources: [...entryRules.sources, { kind: "stageRanks", stageOrder: availablePrevStages[0].order, from: 1, to: 4 }] });
  };
  const removeSource = (i: number) => onChange({ ...entryRules, sources: entryRules.sources.filter((_, idx) => idx !== i) });

  return (
    <div style={{ fontSize: 13 }}>
      <p style={{ fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)", marginBottom: 6 }}>
        {t("entries_title")}
      </p>

      {isFirst ? (
        <p style={{ color: "var(--text-muted)" }}>{t("entries_registration")}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {entryRules.sources.map((src, i) => (
            <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <select
                value={src.kind === "registration" ? "registration" : `stage:${src.stageOrder}`}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "registration") updateSource(i, { kind: "registration" });
                  else updateSource(i, { kind: "stageRanks", stageOrder: Number(v.split(":")[1]), from: 1, to: 4 });
                }}
              >
                <option value="registration">{t("src_registration")}</option>
                {availablePrevStages.map((s) => (
                  <option key={s.order} value={`stage:${s.order}`}>{t("src_stage", { name: s.name })}</option>
                ))}
              </select>
              {src.kind === "stageRanks" && (
                <>
                  <span>{t("ranks")}</span>
                  <input type="number" min={1} value={src.from} onChange={(e) => updateSource(i, { ...src, from: Number(e.target.value) })} style={{ width: 50 }} />
                  <span>{t("to")}</span>
                  <input type="number" min={1} value={src.to} onChange={(e) => updateSource(i, { ...src, to: Number(e.target.value) })} style={{ width: 50 }} />
                  <span>{t("group")}</span>
                  <input placeholder={t("group_ph")} value={src.group ?? ""} onChange={(e) => updateSource(i, { ...src, group: e.target.value || undefined })} style={{ width: 100 }} />
                </>
              )}
              {entryRules.sources.length > 1 && (
                <button className="ghost" style={{ color: "var(--danger)" }} onClick={() => removeSource(i)}>✕</button>
              )}
            </div>
          ))}
          <button className="ghost" style={{ fontSize: 12, alignSelf: "flex-start" }} onClick={addSource}>{t("add_source")}</button>

          {entryRules.sources.length > 1 && (
            <label style={{ fontSize: 12 }}>
              <input type="checkbox" checked={!!entryRules.interleaveSources} onChange={(e) => onChange({ ...entryRules, interleaveSources: e.target.checked })} />
              {" "}{t("interleave")}
            </label>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
        <label>{t("split_into")} <input type="number" min={1} max={8} value={entryRules.groups ?? 1} onChange={(e) => onChange({ ...entryRules, groups: Number(e.target.value) || undefined })} style={{ width: 50 }} /> {t("groups_count")}</label>
        {(entryRules.groups ?? 1) > 1 && (
          <select value={entryRules.groupAssign ?? "snake"} onChange={(e) => onChange({ ...entryRules, groupAssign: e.target.value as EntryRules["groupAssign"] })}>
            <option value="snake">{t("assign_snake")}</option>
            <option value="interleave">{t("assign_interleave")}</option>
            <option value="block">{t("assign_block")}</option>
            <option value="manual">{t("assign_manual")}</option>
          </select>
        )}
      </div>
    </div>
  );
}
