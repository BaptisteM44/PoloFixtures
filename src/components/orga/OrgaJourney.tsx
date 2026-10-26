"use client";

/**
 * Frise du dashboard orga : le tournoi vu comme un parcours en 6 étapes
 * (Fiche → Format → Inscriptions → Sélection → Jour J → Après). Chaque étape a
 * un état (fait / en cours / à venir) ; la carte dessous dit quoi faire et
 * emmène au bon endroit (onglet + section). Remplace l'ancienne carte
 * « Prochaine action » qui ne connaissait que le jour J.
 */
import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { computeNextAction, type MatchLite, type StageLite, type T } from "./next-action";

export type JourneyTab = "config" | "stages" | "planning" | "teams" | "dday" | "orga";
export type StepId = "info" | "format" | "registration" | "selection" | "dday" | "after";
type StepState = "done" | "current" | "todo" | "warn";

type JourneyTournament = {
  status: string;
  submissionStatus?: "PENDING" | "APPROVED" | "REJECTED";
  dateStart: string;
  timezone?: string;
  registrationStart: string | null;
  registrationEnd: string | null;
  externalRegistrationUrl?: string | null;
  maxTeams: number;
  venueName?: string | null;
  bannerPath?: string | null;
  selectionLocked?: boolean;
  locked?: boolean;
  stages?: StageLite[];
};

type Btn = { label: string; onClick: () => void; primary?: boolean; disabled?: boolean };
type Card = { icon: string; title: string; lines: string[]; buttons: Btn[]; tone: "todo" | "done" | "waiting" | "live" };

export function OrgaJourney({
  tournament,
  teams,
  matches,
  isPipeline,
  activeTab,
  onGo,
  onComplete,
  completePending,
  completeDone,
  setRegistrationClosedAction,
}: {
  tournament: JourneyTournament;
  teams: Array<{ selected?: boolean | null }>;
  matches: MatchLite[];
  isPipeline: boolean;
  activeTab: string;
  onGo: (tab: JourneyTab, anchor?: string) => void;
  onComplete?: () => void;
  completePending?: boolean;
  completeDone?: boolean;
  setRegistrationClosedAction?: (closed: boolean) => Promise<{ ok?: boolean; error?: string }>;
}) {
  const t = useTranslations("orga_journey");
  const tt = useTranslations("tournament") as unknown as T;
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const now = Date.now();
  const fmtDate = (iso: string) =>
    new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: tournament.timezone }).format(new Date(iso));

  const stages = [...(tournament.stages ?? [])].sort((a, b) => a.order - b.order);
  const teamCount = teams.length;
  const max = tournament.maxTeams;
  const approved = (tournament.submissionStatus ?? "APPROVED") === "APPROVED";
  const flowTab: JourneyTab = isPipeline ? "stages" : "planning";

  // ── État de chaque étape ──
  const missing = [
    !tournament.venueName ? t("missing_venue") : null,
    !tournament.bannerPath ? t("missing_banner") : null,
  ].filter(Boolean) as string[];
  const infoDone = !!tournament.venueName;

  const formatDone = isPipeline ? stages.length > 0 : !!tournament.locked || matches.length > 0;

  const external = !!tournament.externalRegistrationUrl;
  const regStart = tournament.registrationStart ? new Date(tournament.registrationStart).getTime() : null;
  const regEnd = tournament.registrationEnd ? new Date(tournament.registrationEnd).getTime() : null;
  const regClosed = regEnd != null && now > regEnd;
  const regNotYet = regStart != null && now < regStart;
  const regDone = external || regClosed || tournament.status !== "UPCOMING";

  const selectionDone = !!tournament.selectionLocked || tournament.status !== "UPCOMING";
  const started = tournament.status !== "UPCOMING";
  const completed = tournament.status === "COMPLETED";
  const allStagesDone = isPipeline && stages.length > 0 && stages.every((s) => s.status === "DONE");
  const ddayDone = completed || (tournament.status === "LIVE" && allStagesDone);

  const order: StepId[] = ["info", "format", "registration", "selection", "dday", "after"];
  const done: Record<StepId, boolean> = {
    info: infoDone || started,
    format: formatDone || started,
    registration: regDone,
    selection: selectionDone,
    dday: ddayDone,
    after: completed,
  };
  // Une fiche incomplète (lieu pas encore connu…) ne bloque pas le parcours :
  // dès qu'une étape suivante est faite, on passe à la suite et la fiche garde
  // juste un rappel « ! ».
  const laterDone = order.slice(1).some((s) => done[s]);
  const current = order.find((s) => !done[s] && !(s === "info" && laterDone)) ?? "after";
  const [selected, setSelected] = useState<StepId | null>(null);
  const shown = selected ?? current;
  const stateOf = (s: StepId): StepState => (done[s] ? "done" : s === current ? "current" : s === "info" && laterDone ? "warn" : "todo");

  const go = (tab: JourneyTab, anchor?: string): Btn["onClick"] => () => onGo(tab, anchor);
  const goBtn = (label: string, tab: JourneyTab, anchor?: string, primary = true): Btn | null =>
    // Pas de bouton « aller à l'onglet X » quand on y est déjà (sauf pour viser une section).
    activeTab === tab && !anchor ? null : { label, onClick: go(tab, anchor), primary };

  const setClosed = (closed: boolean) => {
    if (closed && !window.confirm(t("reg_confirm_close"))) return;
    setError(null);
    startTransition(async () => {
      const res = await setRegistrationClosedAction?.(closed);
      if (res?.error) setError(res.error);
    });
  };

  // ── Carte de l'étape affichée ──
  function card(step: StepId): Card {
    switch (step) {
      case "info": {
        const lines = [t("info_desc")];
        if (missing.length) lines.push(t("info_missing", { list: missing.join(", ") }));
        return {
          icon: "📝", tone: missing.length ? "todo" : "done",
          title: missing.length ? t("info_todo_title") : t("info_done_title"),
          lines,
          buttons: [
            { label: t("info_btn"), onClick: go("config", !tournament.venueName ? "edit-venues" : !tournament.bannerPath ? "edit-banner" : "edit-general"), primary: missing.length > 0 },
          ],
        };
      }
      case "format": {
        if (!formatDone) {
          return {
            icon: "🧩", tone: "todo", title: t("format_todo_title"), lines: [t("format_todo_desc")],
            buttons: [goBtn(t("format_btn"), flowTab)].filter(Boolean) as Btn[],
          };
        }
        return {
          icon: "🧩", tone: "done",
          title: isPipeline ? t("format_done_title", { chain: stages.map((s) => s.name).join(" → ") }) : t("format_done_title_legacy"),
          lines: [t("format_done_desc")],
          buttons: [goBtn(t("format_btn_done"), flowTab, undefined, false)].filter(Boolean) as Btn[],
        };
      }
      case "registration": {
        if (external) {
          return {
            icon: "🔗", tone: "done", title: t("reg_external_title"), lines: [t("reg_external_desc")],
            buttons: [{ label: t("reg_btn_settings"), onClick: go("config", "edit-registration") }, goBtn(t("reg_btn_teams"), "teams", undefined, false)].filter(Boolean) as Btn[],
          };
        }
        if (!approved && tournament.status === "UPCOMING") {
          return {
            icon: "⏳", tone: "waiting", title: t("reg_waiting_approval_title"), lines: [t("reg_waiting_approval_desc")],
            buttons: [{ label: t("reg_btn_settings"), onClick: go("config", "edit-registration"), primary: false }],
          };
        }
        if (regClosed || started) {
          return {
            icon: "✅", tone: "done", title: t("reg_closed_title", { count: teamCount }), lines: [],
            buttons: [
              goBtn(t("reg_btn_teams"), "teams", undefined, false),
              !started && setRegistrationClosedAction ? { label: t("reg_btn_reopen"), onClick: () => setClosed(false), disabled: pending } : null,
            ].filter(Boolean) as Btn[],
          };
        }
        if (regNotYet) {
          return {
            icon: "🗓", tone: "waiting", title: t("reg_not_yet_title", { date: fmtDate(tournament.registrationStart!) }), lines: [t("reg_not_yet_desc")],
            buttons: [{ label: t("reg_btn_settings"), onClick: go("config", "edit-registration"), primary: false }],
          };
        }
        const lines: string[] = [regEnd ? t("reg_open_until", { date: fmtDate(tournament.registrationEnd!) }) : t("reg_open_no_end")];
        if (teamCount > max) lines.push(t("reg_over", { count: teamCount - max }));
        return {
          icon: "📬", tone: "todo", title: t("reg_open_title", { count: teamCount, max }), lines,
          buttons: [
            goBtn(t("reg_btn_teams"), "teams"),
            { label: t("reg_btn_settings"), onClick: go("config", "edit-registration"), primary: false },
            setRegistrationClosedAction ? { label: t("reg_btn_close"), onClick: () => setClosed(true), disabled: pending } : null,
          ].filter(Boolean) as Btn[],
        };
      }
      case "selection": {
        if (selectionDone) {
          const inCount = teams.filter((x) => x.selected !== false).length;
          return {
            icon: "🔒", tone: "done", title: t("sel_done_title", { count: inCount }), lines: [t("sel_done_desc")],
            buttons: [goBtn(t("sel_btn_view"), "teams", undefined, false)].filter(Boolean) as Btn[],
          };
        }
        const lines = [teamCount > max ? t("sel_desc_over", { count: teamCount, max }) : t("sel_desc_fit", { count: teamCount, max })];
        if (!regDone) lines.push(t("sel_waiting"));
        return {
          icon: "🎯", tone: regDone ? "todo" : "waiting", title: t("sel_todo_title"), lines,
          buttons: [goBtn(t("sel_btn"), "teams", undefined, regDone)].filter(Boolean) as Btn[],
        };
      }
      case "dday": {
        if (started) {
          const info = computeNextAction(tournament, matches, isPipeline, tt);
          return {
            icon: info.icon, tone: info.tone === "live" ? "live" : info.tone === "done" ? "done" : "todo",
            title: info.title, lines: info.subtitle ? [info.subtitle] : [],
            buttons: [
              goBtn(info.flowLabel, flowTab),
              info.showComplete && onComplete && !completeDone ? { label: `🏁 ${tt("orga_mark_completed")}`, onClick: onComplete, disabled: completePending } : null,
              goBtn(t("dday_btn_tools"), "dday", undefined, false),
            ].filter(Boolean) as Btn[],
          };
        }
        const days = Math.ceil((new Date(tournament.dateStart).getTime() - now) / 86_400_000);
        const blockers = [
          !formatDone ? t("blocker_format") : null,
          !selectionDone ? t("blocker_selection") : null,
        ].filter(Boolean) as string[];
        const lines = [days > 0 ? t("dday_countdown", { days }) : t("dday_today")];
        lines.push(blockers.length ? t("dday_blockers", { list: blockers.join(", ") }) : t("dday_ready_desc"));
        return {
          icon: "🎬", tone: blockers.length ? "waiting" : "todo",
          title: blockers.length ? t("dday_title_prep") : t("dday_title_ready"), lines,
          buttons: [
            goBtn(t("dday_btn_tools"), "dday", undefined, !blockers.length),
            goBtn(t("dday_btn_launch"), flowTab, undefined, false),
          ].filter(Boolean) as Btn[],
        };
      }
      case "after": {
        if (completed) {
          return { icon: "🏆", tone: "done", title: t("after_done_title"), lines: [t("after_done_desc")], buttons: [] };
        }
        return {
          icon: "🏁", tone: allStagesDone ? "todo" : "waiting", title: t("after_todo_title"), lines: [t("after_todo_desc")],
          buttons: allStagesDone && onComplete && !completeDone
            ? [{ label: `🏁 ${tt("orga_mark_completed")}`, onClick: onComplete, disabled: completePending, primary: true }]
            : [],
        };
      }
    }
  }

  const c = card(shown);

  return (
    <section className="orga-journey">
      {!approved && tournament.submissionStatus === "PENDING" && (
        <p className="orga-journey__approval">⏳ {t("approval_pending")}</p>
      )}
      {tournament.submissionStatus === "REJECTED" && (
        <p className="orga-journey__approval orga-journey__approval--rejected">✋ {t("approval_rejected")}</p>
      )}
      <ol className="orga-journey__steps">
        {order.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              className={`orga-journey__step is-${stateOf(s)}${shown === s ? " is-shown" : ""}`}
              onClick={() => setSelected(s === current ? null : s)}
              aria-current={s === current ? "step" : undefined}
            >
              <span className="orga-journey__dot">{done[s] ? "✓" : stateOf(s) === "warn" ? "!" : i + 1}</span>
              <span className="orga-journey__label">{t(`step_${s}`)}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className={`orga-journey__card tone-${c.tone}`}>
        <span className="orga-journey__icon" aria-hidden>{c.icon}</span>
        <div className="orga-journey__body">
          <strong>{c.title}</strong>
          {c.lines.map((l, i) => <p key={i}>{l}</p>)}
          {error && <p className="orga-journey__error">{error}</p>}
          {completeDone && shown !== "info" && <p className="orga-journey__ok">✓ {tt("orga_marked_completed")}</p>}
        </div>
        {c.buttons.length > 0 && (
          <div className="orga-journey__actions">
            {c.buttons.map((b, i) => (
              <button key={i} type="button" className={b.primary ? "primary" : "ghost"} onClick={b.onClick} disabled={b.disabled}>
                {b.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
