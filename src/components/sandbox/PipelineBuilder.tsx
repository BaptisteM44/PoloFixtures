"use client";

/**
 * Builder custom — compose librement une chaîne d'étapes (n'importe quelle
 * formule de tournoi) : ajoute/réordonne/duplique/supprime des étapes,
 * configure chacune et choisit d'où viennent ses équipes.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCustomSandboxAction } from "@/app/[locale]/sandbox/actions";

type StageType = "RR" | "SWISS" | "CROSS_POOL" | "PLACEMENT" | "SE" | "DE";

type EntrySource =
  | { kind: "registration" }
  | { kind: "stageRanks"; stageOrder: number; group?: string; from: number; to: number };

type EntryRules = {
  sources: EntrySource[];
  interleaveSources?: boolean;
  groups?: number;
  groupAssign?: "snake" | "interleave" | "block";
};

type BuilderStage = {
  key: string;
  name: string;
  type: StageType;
  config: Record<string, unknown>;
  entryRules: EntryRules;
};

const TYPE_INFO: Record<StageType, { label: string; hint: string }> = {
  RR: { label: "Poules (Round Robin)", hint: "Chaque équipe affronte toutes les autres de son groupe." },
  SWISS: { label: "Swiss", hint: "Appariement par classement, évite les rematches." },
  CROSS_POOL: { label: "Cross-pool", hint: "Confrontations croisées entre 2 groupes, par rang." },
  PLACEMENT: { label: "Placement", hint: "Duels directs par rang (1er A vs 1er B…)." },
  SE: { label: "Élimination simple", hint: "Bracket à élimination directe, +3e place possible." },
  DE: { label: "Double élimination", hint: "Bracket winner/loser bracket, +reset de finale possible." },
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
    name: order === 0 ? "Étape 1" : `Étape ${order + 1}`,
    type: order === 0 ? "RR" : "SE",
    config: defaultConfig(order === 0 ? "RR" : "SE"),
    entryRules: order === 0
      ? { sources: [{ kind: "registration" }] }
      : { sources: [{ kind: "stageRanks", stageOrder: order - 1, from: 1, to: 8 }] },
  };
}

export function PipelineBuilder({ maxTeams }: { maxTeams: number }) {
  const router = useRouter();
  const [name, setName] = useState("Mon format custom");
  const [teamCount, setTeamCount] = useState(16);
  const [courtsCount, setCourtsCount] = useState(2);
  const [duration, setDuration] = useState(12);
  const [stages, setStages] = useState<BuilderStage[]>([defaultStage(0)]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const update = (i: number, patch: Partial<BuilderStage>) => {
    setStages((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  };

  const addStage = () => setStages((prev) => [...prev, defaultStage(prev.length)]);
  const removeStage = (i: number) => setStages((prev) => prev.filter((_, idx) => idx !== i));
  const duplicateStage = (i: number) => setStages((prev) => {
    const copy = { ...prev[i], key: newKey(), name: `${prev[i].name} (copie)` };
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
          Nom du format<br />
          <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: 200 }} />
        </label>
        <label style={{ fontSize: 13 }}>
          Équipes<br />
          <input type="number" min={2} max={64} value={teamCount} onChange={(e) => setTeamCount(Number(e.target.value))} style={{ width: 80 }} />
        </label>
        <label style={{ fontSize: 13 }}>
          Terrains<br />
          <input type="number" min={1} max={4} value={courtsCount} onChange={(e) => setCourtsCount(Number(e.target.value))} style={{ width: 80 }} />
        </label>
        <label style={{ fontSize: 13 }}>
          Durée match (min)<br />
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
            onChangeType={(t) => changeType(i, t)}
            onRemove={stages.length > 1 ? () => removeStage(i) : undefined}
            onDuplicate={() => duplicateStage(i)}
            onMoveUp={i > 0 ? () => move(i, -1) : undefined}
            onMoveDown={i < stages.length - 1 ? () => move(i, 1) : undefined}
          />
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button className="ghost" onClick={addStage}>+ Ajouter une étape</button>
        <button className="primary" disabled={pending} onClick={submit} style={{ marginLeft: "auto" }}>
          {pending ? "Création…" : "🧪 Créer ce tournoi custom"}
        </button>
      </div>
      {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}
    </div>
  );
}

// ─── Carte d'une étape ────────────────────────────────────────────────────────

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
          {(Object.keys(TYPE_INFO) as StageType[]).map((t) => (
            <option key={t} value={t}>{TYPE_INFO[t].label}</option>
          ))}
        </select>
        <div style={{ display: "flex", gap: 4 }}>
          {onMoveUp && <button className="ghost" title="Monter" onClick={onMoveUp}>↑</button>}
          {onMoveDown && <button className="ghost" title="Descendre" onClick={onMoveDown}>↓</button>}
          <button className="ghost" title="Dupliquer" onClick={onDuplicate}>⧉</button>
          {onRemove && <button className="ghost" title="Supprimer" style={{ color: "var(--danger)" }} onClick={onRemove}>🗑</button>}
        </div>
      </div>
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 10px" }}>{TYPE_INFO[stage.type].hint}</p>

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
  const set = (k: string, v: unknown) => onChange({ ...config, [k]: v });

  switch (type) {
    case "RR":
      return (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13 }}>
          <label>Groupes <input type="number" min={1} max={8} value={Number(config.groups ?? 1)} onChange={(e) => set("groups", Number(e.target.value))} style={{ width: 60 }} /></label>
          <label>Rounds max (optionnel) <input type="number" min={1} max={30} value={Number(config.maxRounds ?? "")} onChange={(e) => set("maxRounds", e.target.value ? Number(e.target.value) : undefined)} style={{ width: 60 }} /></label>
          <label><input type="checkbox" checked={!!config.doubleRound} onChange={(e) => set("doubleRound", e.target.checked)} /> Aller-retour</label>
        </div>
      );
    case "SWISS":
      return (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13 }}>
          <label>Rounds <input type="number" min={1} max={15} value={Number(config.rounds ?? 5)} onChange={(e) => set("rounds", Number(e.target.value))} style={{ width: 60 }} /></label>
        </div>
      );
    case "CROSS_POOL":
      return (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13 }}>
          <label>Adversaires par équipe <input type="number" min={1} max={16} value={Number(config.opponents ?? 1)} onChange={(e) => set("opponents", Number(e.target.value))} style={{ width: 60 }} /></label>
        </div>
      );
    case "PLACEMENT":
      return (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13 }}>
          <label>Nombre de duels <input type="number" min={1} max={16} value={Number(config.count ?? 2)} onChange={(e) => set("count", Number(e.target.value))} style={{ width: 60 }} /></label>
        </div>
      );
    case "SE":
      return (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13 }}>
          <label><input type="checkbox" checked={!!config.thirdPlace} onChange={(e) => set("thirdPlace", e.target.checked)} /> Match pour la 3e place</label>
        </div>
      );
    case "DE":
      return (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13 }}>
          <label><input type="checkbox" checked={!!config.gfReset} onChange={(e) => set("gfReset", e.target.checked)} /> Reset de la grande finale</label>
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
        D&apos;où viennent les équipes
      </p>

      {isFirst ? (
        <p style={{ color: "var(--text-muted)" }}>Équipes inscrites au tournoi (seed initial).</p>
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
                <option value="registration">Inscriptions</option>
                {availablePrevStages.map((s) => (
                  <option key={s.order} value={`stage:${s.order}`}>Résultats — {s.name}</option>
                ))}
              </select>
              {src.kind === "stageRanks" && (
                <>
                  <span>rangs</span>
                  <input type="number" min={1} value={src.from} onChange={(e) => updateSource(i, { ...src, from: Number(e.target.value) })} style={{ width: 50 }} />
                  <span>à</span>
                  <input type="number" min={1} value={src.to} onChange={(e) => updateSource(i, { ...src, to: Number(e.target.value) })} style={{ width: 50 }} />
                  <span>groupe</span>
                  <input placeholder="A, B… (vide=tous)" value={src.group ?? ""} onChange={(e) => updateSource(i, { ...src, group: e.target.value || undefined })} style={{ width: 100 }} />
                </>
              )}
              {entryRules.sources.length > 1 && (
                <button className="ghost" style={{ color: "var(--danger)" }} onClick={() => removeSource(i)}>✕</button>
              )}
            </div>
          ))}
          <button className="ghost" style={{ fontSize: 12, alignSelf: "flex-start" }} onClick={addSource}>+ Ajouter une source</button>

          {entryRules.sources.length > 1 && (
            <label style={{ fontSize: 12 }}>
              <input type="checkbox" checked={!!entryRules.interleaveSources} onChange={(e) => onChange({ ...entryRules, interleaveSources: e.target.checked })} />
              {" "}Entrelacer les sources (A1,B1,A2,B2…) au lieu de les mettre bout à bout
            </label>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
        <label>Répartir en <input type="number" min={1} max={8} value={entryRules.groups ?? 1} onChange={(e) => onChange({ ...entryRules, groups: Number(e.target.value) || undefined })} style={{ width: 50 }} /> groupe(s)</label>
        {(entryRules.groups ?? 1) > 1 && (
          <select value={entryRules.groupAssign ?? "snake"} onChange={(e) => onChange({ ...entryRules, groupAssign: e.target.value as EntryRules["groupAssign"] })}>
            <option value="snake">Répartition serpentin (équilibrée)</option>
            <option value="interleave">Alternée (1→A,2→B,3→A…)</option>
            <option value="block">Par blocs (les meilleurs ensemble)</option>
          </select>
        )}
      </div>
    </div>
  );
}
