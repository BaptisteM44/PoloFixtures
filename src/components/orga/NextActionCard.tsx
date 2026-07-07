"use client";

/**
 * Carte « Prochaine action » du dashboard orga : bande contextuelle en haut
 * qui résume l'état live et pointe vers ce que l'orga doit faire maintenant
 * (lancer une étape/un groupe, saisir des scores, terminer le tournoi…).
 * Purement informative + navigation par onglet — aucune action serveur ici,
 * elle renvoie vers l'onglet Déroulé où tout le pilotage vit déjà.
 */
import { useTranslations } from "next-intl";

type T = (k: string, v?: Record<string, string | number>) => string;

type MatchLite = {
  status: string;
  phase: string;
  groupKey?: string | null;
  roundIndex?: number;
  courtName?: string | null;
};

type StageLite = {
  order: number;
  name: string;
  status: string;
  type: string;
  entries?: Array<{ groupKey?: string | null }>;
  matches?: Array<{ status: string; groupKey?: string | null }>;
};

type Tone = "live" | "todo" | "waiting" | "done";

export function NextActionCard({
  tournament,
  matches,
  isPipeline,
  onGoToFlow,
  onComplete,
  completePending,
  completeDone,
  canComplete,
}: {
  tournament: { status: string; testMode?: boolean; stages?: StageLite[] };
  matches: MatchLite[];
  isPipeline: boolean;
  onGoToFlow: () => void;
  onComplete?: () => void;
  completePending?: boolean;
  completeDone?: boolean;
  canComplete?: boolean;
}) {
  const t = useTranslations("tournament") as unknown as T;

  const info = computeNextAction(tournament, matches, isPipeline, t);

  const toneStyle: Record<Tone, { bg: string; border: string; dot: string }> = {
    live:    { bg: "color-mix(in srgb, var(--pink) 8%, var(--surface))",   border: "var(--pink)",   dot: "var(--pink)" },
    todo:    { bg: "color-mix(in srgb, var(--teal) 8%, var(--surface))",   border: "var(--teal)",   dot: "var(--teal)" },
    waiting: { bg: "var(--surface)",                                        border: "var(--border)", dot: "var(--text-muted)" },
    done:    { bg: "color-mix(in srgb, var(--teal) 10%, var(--surface))",  border: "var(--teal)",   dot: "var(--teal)" },
  };
  const s = toneStyle[info.tone];

  return (
    <div
      className="panel"
      style={{
        marginBottom: 16, padding: "14px 18px", background: s.bg,
        border: `2px solid ${s.border}`, borderRadius: 12,
        display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "1 1 260px", minWidth: 0 }}>
        <span style={{ fontSize: 22, lineHeight: 1 }}>{info.icon}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {info.badge && (
              <span style={{
                fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em",
                padding: "2px 8px", borderRadius: 6, color: "#fff", background: s.dot,
              }}>
                {info.badge}
              </span>
            )}
            <span style={{ fontWeight: 700, fontSize: 15 }}>{info.title}</span>
          </div>
          {info.subtitle && (
            <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--text-muted)" }}>{info.subtitle}</p>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
        {info.showComplete && canComplete && !completeDone && onComplete && (
          <button type="button" className="btn btn--success" style={{ fontSize: 13, padding: "8px 16px" }}
            onClick={onComplete} disabled={completePending}>
            {completePending ? "…" : `🏁 ${t("orga_mark_completed")}`}
          </button>
        )}
        {completeDone && (
          <span style={{ fontSize: 13, color: "var(--teal)", fontWeight: 700 }}>✓ {t("orga_marked_completed")}</span>
        )}
        {info.showFlowButton && (
          <button type="button" className="primary" style={{ fontSize: 13, padding: "8px 16px", whiteSpace: "nowrap" }}
            onClick={onGoToFlow}>
            {info.flowLabel}
          </button>
        )}
      </div>
    </div>
  );
}

type ActionInfo = {
  tone: Tone;
  icon: string;
  badge?: string;
  title: string;
  subtitle?: string;
  showFlowButton: boolean;
  flowLabel: string;
  showComplete: boolean;
};

function computeNextAction(
  tournament: { status: string; stages?: StageLite[] },
  matches: MatchLite[],
  isPipeline: boolean,
  t: T,
): ActionInfo {
  const flowLabel = isPipeline ? t("orga_next_go_stages") : t("orga_next_go_planning");

  if (tournament.status === "COMPLETED") {
    return { tone: "done", icon: "🏆", title: t("orga_next_completed"), showFlowButton: false, flowLabel, showComplete: false };
  }

  // Un match en cours ? (tous formats)
  const live = matches.find((m) => m.status === "LIVE");
  if (live) {
    return {
      tone: "live", icon: "🔴", badge: t("status_live"),
      title: liveTitle(live, t),
      subtitle: live.courtName ? t("orga_next_on_court", { court: live.courtName }) : undefined,
      showFlowButton: true, flowLabel, showComplete: false,
    };
  }

  if (isPipeline) return pipelineAction(tournament, t, flowLabel);

  // Legacy : pas de pilotage fin ici, on renvoie au planning
  const anyMatches = matches.length > 0;
  const allDone = anyMatches && matches.every((m) => m.status === "FINISHED");
  if (!anyMatches) {
    return { tone: "todo", icon: "🚀", title: t("orga_next_not_launched"), subtitle: t("orga_next_not_launched_hint"), showFlowButton: true, flowLabel, showComplete: false };
  }
  if (allDone) {
    return { tone: "todo", icon: "🏁", title: t("orga_next_all_played"), subtitle: t("orga_next_all_played_hint"), showFlowButton: true, flowLabel, showComplete: true };
  }
  const remaining = matches.filter((m) => m.status !== "FINISHED" && (m as any).teamAId && (m as any).teamBId).length;
  return {
    tone: "todo", icon: "⏱", title: t("orga_next_in_progress"),
    subtitle: remaining > 0 ? t("orga_next_matches_left", { count: remaining }) : undefined,
    showFlowButton: true, flowLabel, showComplete: false,
  };
}

function liveTitle(m: MatchLite, t: T): string {
  const round = m.roundIndex ? ` · R${m.roundIndex}` : "";
  const grp = m.groupKey ? ` · ${t("pipeline_group_label", { key: m.groupKey })}` : "";
  return `${t("orga_next_match_live")}${round}${grp}`;
}

function pipelineAction(
  tournament: { status: string; stages?: StageLite[] },
  t: T,
  flowLabel: string,
): ActionInfo {
  const stages = [...(tournament.stages ?? [])].sort((a, b) => a.order - b.order);
  if (stages.length === 0) {
    return { tone: "waiting", icon: "🧩", title: t("orga_next_no_stages"), showFlowButton: true, flowLabel, showComplete: false };
  }

  const active = stages.find((s) => s.status === "ACTIVE");

  if (active) {
    // Sessions séquentielles : un groupe non lancé attend son tour ?
    const entryGroups = [...new Set((active.entries ?? []).map((e) => e.groupKey ?? ""))].filter(Boolean).sort();
    const matchGroups = new Set((active.matches ?? []).map((m) => m.groupKey ?? ""));
    const nextGroup = entryGroups.find((g) => !matchGroups.has(g));
    const launchedDone = (active.matches ?? []).length > 0 && (active.matches ?? []).every((m) => m.status === "FINISHED");

    if (nextGroup && launchedDone) {
      return {
        tone: "todo", icon: "▶️",
        title: t("orga_next_launch_group", { group: nextGroup }),
        subtitle: `${active.name} · ${t("orga_next_prev_group_done")}`,
        showFlowButton: true, flowLabel, showComplete: false,
      };
    }
    const left = (active.matches ?? []).filter((m) => m.status !== "FINISHED").length;
    return {
      tone: "todo", icon: "⏱",
      title: `${active.name} — ${t("orga_next_enter_scores")}`,
      subtitle: left > 0 ? t("orga_next_matches_left", { count: left }) : undefined,
      showFlowButton: true, flowLabel, showComplete: false,
    };
  }

  // Aucune étape active : prochaine étape à lancer, ou tout fini
  const nextPending = stages.find((s) => s.status === "PENDING");
  if (nextPending) {
    const isFirst = stages.every((s) => s.status === "PENDING");
    return {
      tone: "todo", icon: "🚀",
      title: t("orga_next_launch_stage", { name: nextPending.name }),
      subtitle: isFirst ? t("orga_next_not_launched_hint") : t("orga_next_prev_stage_done"),
      showFlowButton: true, flowLabel, showComplete: false,
    };
  }

  // Toutes les étapes DONE mais tournoi pas encore COMPLETED
  return { tone: "done", icon: "🏁", title: t("orga_next_all_stages_done"), subtitle: t("orga_next_all_played_hint"), showFlowButton: true, flowLabel, showComplete: true };
}
