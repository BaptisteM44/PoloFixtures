"use client";

/**
 * Pilotage du pipeline d'étapes (refonte formats) : timeline des étapes,
 * lancement (étape ou groupe), édition des étapes non lancées, horaires,
 * composition manuelle des groupes, resets.
 * Utilisé par le dashboard orga ET par l'onglet Étapes (réservé orga) de la
 * page publique du tournoi.
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  StageConfigFields, EntryRulesFields, defaultConfig,
  STAGE_TYPES, TYPE_LABEL_KEY,
  type StageType as PipelineStageType, type EntryRules as PipelineEntryRules,
} from "@/components/sandbox/PipelineBuilder";
import { zonedToUtc } from "@/engine/scheduler";

// ─── PipelinePlanning (nouveau système de stages, refonte formats) ───────────

const STAGE_STATUS_COLOR: Record<string, string> = {
  PENDING: "var(--text-muted)",
  ACTIVE: "var(--amber, #f59e0b)",
  DONE: "var(--teal)",
  SKIPPED: "var(--text-muted)",
};
const GROUP_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

// UTC ISO → valeur d'un <input type="datetime-local"> exprimée dans le fuseau du tournoi.
function utcToLocalInput(iso: string | null | undefined, tz: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

// Valeur d'un <input type="datetime-local"> (heure murale du tournoi) → ISO UTC.
function localInputToUtc(value: string, tz: string): string | null {
  if (!value) return null;
  const [dateStr, timeStr] = value.split("T");
  if (!dateStr || !timeStr) return null;
  return zonedToUtc(dateStr, timeStr, tz).toISOString();
}

/** Éditeur d'une étape non lancée (onglet Étapes) — mêmes briques que le builder. */
function StageEditor({
  stage, allStages, timezone, courtsCount, pending, onSave, onCancel,
}: {
  stage: any;
  allStages: any[];
  timezone: string;
  courtsCount: number;
  pending: boolean;
  onSave: (patch: { name: string; type: string; config: Record<string, unknown>; entryRules: unknown; startAt: string | null }) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("tournament");
  const tt = useTranslations("tournament");
  const [name, setName] = useState<string>(stage.name);
  const [type, setType] = useState<PipelineStageType>(stage.type);
  const [config, setConfig] = useState<Record<string, unknown>>((stage.config as Record<string, unknown>) ?? {});
  const [entryRules, setEntryRules] = useState<PipelineEntryRules>((stage.entryRules as PipelineEntryRules) ?? { sources: [{ kind: "registration" }] });
  const [startLocal, setStartLocal] = useState<string>(utcToLocalInput(stage.startAt, timezone));

  const groupCount = Math.max(entryRules.groups ?? 1, 1);
  const groupStartAt = (config.groupStartAt ?? {}) as Record<string, string>;
  const availablePrevStages = [...allStages].sort((a, b) => a.order - b.order)
    .filter((s) => s.order < stage.order)
    .map((s) => ({ order: s.order, name: s.name }));

  const changeType = (ty: PipelineStageType) => {
    setType(ty);
    setConfig(defaultConfig(ty));
    if (STAGE_TYPES.some((x) => name === tt(TYPE_LABEL_KEY[x] as never))) setName(tt(TYPE_LABEL_KEY[ty] as never));
  };

  const setGroupStart = (letter: string, value: string) => {
    const iso = localInputToUtc(value, timezone);
    const next = { ...groupStartAt };
    if (iso) next[letter] = iso; else delete next[letter];
    setConfig({ ...config, groupStartAt: Object.keys(next).length > 0 ? next : undefined });
  };

  return (
    <div style={{ marginTop: 12, borderTop: "1px dashed var(--border)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input value={name} onChange={(e) => setName(e.target.value)} style={{ fontWeight: 700, flex: "1 1 160px", minWidth: 120 }} />
        <select value={type} onChange={(e) => changeType(e.target.value as PipelineStageType)}>
          {STAGE_TYPES.map((ty) => (
            <option key={ty} value={ty}>{tt(TYPE_LABEL_KEY[ty] as never)}</option>
          ))}
        </select>
      </div>

      <StageConfigFields type={type} config={config} groupCount={groupCount} courtsCount={courtsCount}
        onChange={setConfig} />

      <div style={{ borderTop: "1px dashed var(--border)", paddingTop: 10 }}>
        <EntryRulesFields entryRules={entryRules} availablePrevStages={availablePrevStages}
          onChange={setEntryRules} />
      </div>

      {/* Horaires */}
      <div style={{ borderTop: "1px dashed var(--border)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {t("pipeline_start_time")}
          <input type="datetime-local" value={startLocal} onChange={(e) => setStartLocal(e.target.value)} />
          {startLocal && <button className="ghost" style={{ fontSize: 12 }} type="button" onClick={() => setStartLocal("")}>✕</button>}
          {!startLocal && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("pipeline_start_auto")}</span>}
        </label>
        {(type === "RR" || type === "SWISS") && groupCount > 1 && (
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {GROUP_LETTERS.slice(0, groupCount).map((letter) => (
              <label key={letter} style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                {t("pipeline_group_start", { group: letter })}
                <input type="datetime-local" value={utcToLocalInput(groupStartAt[letter], timezone)}
                  onChange={(e) => setGroupStart(letter, e.target.value)} />
              </label>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button className="primary" style={{ fontSize: 13 }} disabled={pending}
          onClick={() => onSave({ name, type, config, entryRules, startAt: localInputToUtc(startLocal, timezone) })}>
          {t("pipeline_editor_save")}
        </button>
        <button className="ghost" style={{ fontSize: 13 }} onClick={onCancel}>{t("pipeline_compose_cancel")}</button>
      </div>
    </div>
  );
}

export function PipelinePlanning({
  tournament,
  stages,
  launchStageAction,
  resetStagesAction,
  simulateStageAction,
  previewEntriesAction,
  setManualGroupsAction,
  updateStageAction,
  launchGroupAction,
  addStageAction,
  removeStageAction,
  moveStageAction,
}: {
  tournament: any;
  stages: any[];
  launchStageAction?: (order: number) => Promise<{ ok?: boolean; error?: string }>;
  resetStagesAction?: (fromOrder: number) => Promise<{ ok?: boolean; error?: string }>;
  simulateStageAction?: () => Promise<{ ok?: boolean; error?: string }>;
  previewEntriesAction?: (order: number) => Promise<{ entries?: Array<{ teamId: string; name: string; groupKey: string; slot: number }>; groups?: number; error?: string }>;
  setManualGroupsAction?: (order: number, assignments: Record<string, string>) => Promise<{ ok?: boolean; error?: string }>;
  updateStageAction?: (order: number, patch: { name: string; type: string; config: Record<string, unknown>; entryRules: unknown; startAt: string | null }) => Promise<{ ok?: boolean; error?: string }>;
  launchGroupAction?: (order: number) => Promise<{ ok?: boolean; error?: string; group?: string }>;
  addStageAction?: (def: { name: string; type: string; config: Record<string, unknown>; entryRules: unknown }) => Promise<{ ok?: boolean; error?: string }>;
  removeStageAction?: (order: number) => Promise<{ ok?: boolean; error?: string }>;
  moveStageAction?: (order: number, dir: -1 | 1) => Promise<{ ok?: boolean; error?: string }>;
}) {
  const t = useTranslations("tournament");
  const ts = useTranslations("sandbox"); // libellés des modes de répartition des terrains
  const timezone: string = (tournament as any).timezone ?? "Europe/Brussels";
  const courtsCount: number = Math.max((tournament as any).courtsCount ?? 1, 1);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editOrder, setEditOrder] = useState<number | null>(null);
  const [openOrder, setOpenOrder] = useState<number | null>(
    stages.find((s) => s.status === "ACTIVE")?.order ?? stages.find((s) => s.status === "PENDING")?.order ?? 0
  );
  // Composition manuelle des groupes (étape en attente)
  const [composeOrder, setComposeOrder] = useState<number | null>(null);
  const [composeEntries, setComposeEntries] = useState<Array<{ teamId: string; name: string; groupKey: string }>>([]);
  const [composeGroups, setComposeGroups] = useState(2);

  const sorted = [...stages].sort((a, b) => a.order - b.order);
  const nextPending = sorted.find((s) => s.status === "PENDING" &&
    sorted.every((p) => p.order >= s.order || p.status === "DONE" || p.status === "SKIPPED"));

  const statusLabel = (status: string) => t(`pipeline_status_${status.toLowerCase()}` as never);
  const typeLabel = (type: string) => t(`pipeline_type_${type.toLowerCase()}` as never);

  const act = async (fn: () => Promise<{ ok?: boolean; error?: string }> | undefined) => {
    if (!fn) return;
    setPending(true);
    setError(null);
    const res = await fn();
    if (res?.error) setError(res.error);
    setPending(false);
  };

  const openCompose = async (stage: any) => {
    if (!previewEntriesAction) return;
    setPending(true);
    setError(null);
    const res = await previewEntriesAction(stage.order);
    setPending(false);
    if (res.error) { setError(res.error); return; }
    setComposeEntries((res.entries ?? []).map((e) => ({ teamId: e.teamId, name: e.name, groupKey: e.groupKey || "A" })));
    setComposeGroups(Math.max(res.groups ?? 2, 2));
    setComposeOrder(stage.order);
  };

  const saveCompose = async () => {
    if (composeOrder === null || !setManualGroupsAction) return;
    const assignments = Object.fromEntries(composeEntries.map((e) => [e.teamId, e.groupKey]));
    await act(() => setManualGroupsAction(composeOrder, assignments));
    setComposeOrder(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {simulateStageAction && (
        <div style={{ background: "repeating-linear-gradient(45deg, #f59e0b22, #f59e0b22 10px, transparent 10px, transparent 20px)", border: "1px solid #f59e0b", borderRadius: 10, padding: "8px 14px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 800 }}>{t("pipeline_test_banner")}</span>
          <button className="ghost" style={{ fontSize: 12, marginLeft: "auto" }} disabled={pending}
            onClick={() => act(simulateStageAction)}>
            {t("pipeline_simulate_stage")}
          </button>
        </div>
      )}
      {error && <p style={{ color: "var(--danger)", fontSize: 12, padding: "8px 0" }}>{error}</p>}
      {sorted.map((stage) => {
        const color = STAGE_STATUS_COLOR[stage.status] ?? STAGE_STATUS_COLOR.PENDING;
        const isOpen = openOrder === stage.order;
        const doneMatches = (stage.matches ?? []).filter((m: any) => m.status === "FINISHED").length;
        const totalMatches = (stage.matches ?? []).length;
        const isNextLaunchable = stage.status === "PENDING" && nextPending?.order === stage.order;
        const hasGroups = ((stage.entryRules as any)?.groups ?? 1) > 1;
        const isComposing = composeOrder === stage.order;
        const isEditing = editOrder === stage.order;
        const isPendingStage = stage.status === "PENDING";
        const prevStage = sorted.find((s) => s.order === stage.order - 1);
        const nextStage = sorted.find((s) => s.order === stage.order + 1);

        return (
          <div key={stage.id} className="panel" style={{ borderLeft: `3px solid ${color}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", flexWrap: "wrap" }} onClick={() => setOpenOrder(isOpen ? null : stage.order)}>
              <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text-muted)" }}>{stage.order + 1}</span>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{stage.name}</span>
              <span style={{ fontSize: 11, padding: "1px 8px", borderRadius: 6, border: "1px solid var(--border)", color: "var(--text-muted)" }}>
                {typeLabel(stage.type)}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color }}>{statusLabel(stage.status)}</span>
              {stage.startAt && (
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  🕐 {utcToLocalInput(stage.startAt, timezone).replace("T", " ")}
                </span>
              )}
              <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-muted)" }}>
                {totalMatches > 0 ? t("pipeline_matches_done", { done: doneMatches, total: totalMatches }) : ""} {isOpen ? "▾" : "▸"}
              </span>
            </div>

            {/* Récap de config visible sans ouvrir l'éditeur */}
            {(() => {
              const cfg = (stage.config ?? {}) as Record<string, unknown>;
              const groupCount = (stage.entryRules as any)?.groups ?? 1;
              const bits: string[] = [];
              if (stage.type === "SWISS") bits.push(t("pipeline_summary_rounds", { count: Number(cfg.rounds ?? 5) }));
              if (stage.type === "RR" && cfg.maxRounds) bits.push(t("pipeline_summary_rounds", { count: Number(cfg.maxRounds) }));
              if (groupCount > 1) {
                bits.push(t("pipeline_summary_groups", { count: groupCount }));
                bits.push(ts(`court_${(cfg.courtMode as string) ?? "sequential"}` as never));
                const gsa = (cfg.groupStartAt ?? {}) as Record<string, string>;
                const times = GROUP_LETTERS.slice(0, groupCount)
                  .filter((letter) => gsa[letter])
                  .map((letter) => `${letter} ${utcToLocalInput(gsa[letter], timezone).slice(11, 16)}`);
                if (times.length > 0) bits.push(`🕐 ${times.join(" · ")}`);
              }
              return bits.length > 0 ? (
                <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "6px 0 0" }}>{bits.join(" · ")}</p>
              ) : null;
            })()}

            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              {isNextLaunchable && (
                <button className="primary" style={{ fontSize: 13 }} disabled={pending}
                  onClick={(e) => { e.stopPropagation(); act(() => launchStageAction?.(stage.order)); }}>
                  {t("pipeline_launch_stage")}
                </button>
              )}
              {/* Sessions séquentielles : groupes suivants à lancer un par un */}
              {stage.status === "ACTIVE" && launchGroupAction && (stage.type === "RR" || stage.type === "SWISS") && (() => {
                const entryGroups = [...new Set((stage.entries ?? []).map((e: any) => e.groupKey ?? ""))].sort() as string[];
                const matchGroups = new Set((stage.matches ?? []).map((m: any) => m.groupKey ?? ""));
                const nextGroup = entryGroups.find((g) => g && !matchGroups.has(g));
                if (!nextGroup) return null;
                const launchedDone = (stage.matches ?? []).length > 0 && (stage.matches ?? []).every((m: any) => m.status === "FINISHED");
                return (
                  <button className={launchedDone ? "primary" : "ghost"} style={{ fontSize: 13 }} disabled={pending}
                    onClick={(e) => { e.stopPropagation(); act(() => launchGroupAction(stage.order)); }}>
                    ▶ {t("pipeline_launch_group", { group: nextGroup })}
                  </button>
                );
              })()}
              {isPendingStage && updateStageAction && !isEditing && (
                <button className="ghost" style={{ fontSize: 13 }} disabled={pending}
                  onClick={(e) => { e.stopPropagation(); setComposeOrder(null); setEditOrder(stage.order); setOpenOrder(stage.order); }}>
                  ✎ {t("pipeline_edit_stage")}
                </button>
              )}
              {isNextLaunchable && hasGroups && previewEntriesAction && setManualGroupsAction && !isComposing && (
                <button className="ghost" style={{ fontSize: 13 }} disabled={pending}
                  onClick={(e) => { e.stopPropagation(); setEditOrder(null); openCompose(stage); }}>
                  {t("pipeline_compose_groups")}
                </button>
              )}
              {addStageAction && (
                <button className="ghost" style={{ fontSize: 13 }} disabled={pending} title={t("pipeline_duplicate_stage")}
                  onClick={(e) => {
                    e.stopPropagation();
                    act(() => addStageAction({
                      name: `${stage.name} (2)`,
                      type: stage.type,
                      config: stage.config ?? {},
                      entryRules: stage.entryRules ?? { sources: [{ kind: "registration" }] },
                    }));
                  }}>⧉ {t("pipeline_duplicate_stage")}</button>
              )}
              {isPendingStage && moveStageAction && prevStage?.status === "PENDING" && (
                <button className="ghost" style={{ fontSize: 13 }} disabled={pending} title={t("pipeline_move_up")}
                  onClick={(e) => { e.stopPropagation(); act(() => moveStageAction(stage.order, -1)); }}>↑</button>
              )}
              {isPendingStage && moveStageAction && nextStage?.status === "PENDING" && (
                <button className="ghost" style={{ fontSize: 13 }} disabled={pending} title={t("pipeline_move_down")}
                  onClick={(e) => { e.stopPropagation(); act(() => moveStageAction(stage.order, 1)); }}>↓</button>
              )}
              {isPendingStage && removeStageAction && sorted.length > 1 && (
                <button className="ghost" style={{ fontSize: 12, color: "var(--danger)" }} disabled={pending}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(t("pipeline_delete_stage_confirm", { name: stage.name }))) act(() => removeStageAction(stage.order));
                  }}>
                  🗑 {t("pipeline_delete_stage")}
                </button>
              )}
              {(stage.status === "ACTIVE" || stage.status === "DONE") && (
                <button className="ghost" style={{ fontSize: 12, color: "var(--danger)" }} disabled={pending}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(t("pipeline_reset_confirm", { name: stage.name }))) act(() => resetStagesAction?.(stage.order));
                  }}>
                  {t("pipeline_reset_from_here")}
                </button>
              )}
            </div>

            {/* Éditeur d'étape (étape non lancée) */}
            {isEditing && updateStageAction && (
              <StageEditor
                stage={stage}
                allStages={sorted}
                timezone={timezone}
                courtsCount={courtsCount}
                pending={pending}
                onCancel={() => setEditOrder(null)}
                onSave={async (patch) => {
                  setPending(true);
                  setError(null);
                  const res = await updateStageAction(stage.order, patch);
                  setPending(false);
                  if (res?.error) { setError(res.error); return; }
                  setEditOrder(null);
                }}
              />
            )}

            {/* Composition manuelle des groupes */}
            {isComposing && (
              <div style={{ marginTop: 12, borderTop: "1px dashed var(--border)", paddingTop: 12 }}>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)", marginBottom: 8 }}>
                  {t("pipeline_compose_title")}
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 6 }}>
                  {composeEntries.map((e, i) => (
                    <div key={e.teamId} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                      <span style={{ flex: 1 }}>{e.name}</span>
                      <select value={e.groupKey}
                        onChange={(ev) => setComposeEntries((prev) => prev.map((x, xi) => xi === i ? { ...x, groupKey: ev.target.value } : x))}>
                        {GROUP_LETTERS.slice(0, composeGroups).map((l) => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
                {/* Aperçu des effectifs par groupe */}
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
                  {GROUP_LETTERS.slice(0, composeGroups).map((l) => `${l}: ${composeEntries.filter((e) => e.groupKey === l).length}`).join(" · ")}
                </p>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button className="primary" style={{ fontSize: 13 }} disabled={pending} onClick={saveCompose}>
                    {t("pipeline_compose_save")}
                  </button>
                  <button className="ghost" style={{ fontSize: 13 }} onClick={() => setComposeOrder(null)}>
                    {t("pipeline_compose_cancel")}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {addStageAction && (
        <div>
          <button className="ghost" style={{ fontSize: 13 }} disabled={pending}
            onClick={() => {
              const last = sorted[sorted.length - 1];
              act(() => addStageAction({
                name: typeLabel("SE"),
                type: "SE",
                config: { thirdPlace: true },
                entryRules: last
                  ? { sources: [{ kind: "stageRanks", stageOrder: last.order, from: 1, to: 8 }] }
                  : { sources: [{ kind: "registration" }] },
              }));
            }}>
            + {t("pipeline_add_stage")}
          </button>
        </div>
      )}
    </div>
  );
}

