/**
 * « Prochaine action » pendant le tournoi (LIVE) : ce que l'orga doit faire
 * maintenant (lancer une étape/un groupe, saisir des scores, clôturer…).
 * Utilisé par la frise du dashboard (OrgaJourney) pour les étapes Jour J / Après.
 */

export type T = (k: string, v?: Record<string, string | number>) => string;

export type MatchLite = {
  status: string;
  phase: string;
  groupKey?: string | null;
  roundIndex?: number;
  courtName?: string | null;
};

export type StageLite = {
  order: number;
  name: string;
  status: string;
  type: string;
  entries?: Array<{ groupKey?: string | null }>;
  matches?: Array<{ status: string; groupKey?: string | null }>;
};

export type Tone = "live" | "todo" | "waiting" | "done";

export type ActionInfo = {
  tone: Tone;
  icon: string;
  badge?: string;
  title: string;
  subtitle?: string;
  showFlowButton: boolean;
  flowLabel: string;
  showComplete: boolean;
};

export function computeNextAction(
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

  // Legacy : pas de pilotage fin ici, on renvoie au planning.
  // Tant que le tournoi n'est pas LIVE, il n'a PAS démarré : on affiche « pas
  // encore lancé », même si des matchs FINISHED existent (cas d'un tournoi de
  // test/simulé dont les matchs sont restés en base) — sinon on proposait à tort
  // « tous les matchs joués / clôturer » sur un tournoi UPCOMING.
  const anyMatches = matches.length > 0;
  const allDone = tournament.status === "LIVE" && anyMatches && matches.every((m) => m.status === "FINISHED");
  if (tournament.status !== "LIVE" || !anyMatches) {
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

  // Tant que le tournoi n'est pas LIVE, il n'a pas démarré : on n'affiche jamais
  // « toutes les étapes terminées / clôturer » (cas d'un tournoi de test dont les
  // étapes/matchs sont restés en base sans passage en LIVE).
  if (tournament.status !== "LIVE") {
    return { tone: "todo", icon: "🚀", title: t("orga_next_not_launched"), subtitle: t("orga_next_not_launched_hint"), showFlowButton: true, flowLabel, showComplete: false };
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
