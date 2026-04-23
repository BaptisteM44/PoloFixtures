"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { TournamentEditForm } from "@/components/TournamentEditForm";
import { UnifiedTeamManager } from "@/components/UnifiedTeamManager";
import { PoolAssignment } from "@/components/PoolAssignment";
import { FreeAgentList } from "@/components/FreeAgentList";
import { CrossPoolActions } from "@/components/CrossPoolActions";
import { BracketActions } from "@/components/BracketActions";
import { FridayGroupAssignment } from "@/components/FridayGroupAssignment";
import { BerlinMixedActions } from "@/components/BerlinMixedActions";
import { SponsorManager } from "@/components/SponsorManager";
import { CoOrganizerManager } from "@/components/CoOrganizerManager";
import { RefereeManager } from "@/components/RefereeManager";
import ConfirmFormButton from "@/components/ConfirmFormButton";
import { PoolScheduleEditor } from "@/components/PoolScheduleEditor";
import { OrgaTaskBoard } from "@/components/OrgaTaskBoard";
import { OrgaNoteBoard } from "@/components/OrgaNoteBoard";
import { OrgaLinkBoard } from "@/components/OrgaLinkBoard";
import { SelectionManager } from "@/components/SelectionManager";
import { DrawPanel } from "@/components/DrawPanel";
import { AccommodationManager } from "@/components/AccommodationManager";


// ─── GrazPlanning ────────────────────────────────────────────────────────────

type GrazTab = "samedi" | "dimanche";

function GrazPlanning({
  tournament,
  pools,
  matches,
  launchGrazPoolBAction,
  launchGrazSundayRRAction,
  launchGrazRegroupAction,
  launchGrazSEAction,
  resetGrazPhaseAction,
}: {
  tournament: any;
  pools: any[];
  matches: any[];
  launchGrazPoolBAction?: () => Promise<{ ok?: boolean; error?: string }>;
  launchGrazSundayRRAction?: () => Promise<{ ok?: boolean; error?: string }>;
  launchGrazRegroupAction?: () => Promise<{ ok?: boolean; error?: string }>;
  launchGrazSEAction?: () => Promise<{ ok?: boolean; error?: string }>;
  resetGrazPhaseAction?: (phase: "SUNDAY_RR" | "REGROUP" | "SE") => Promise<{ ok?: boolean; error?: string }>;
}) {
  const t = useTranslations("tournament");
  const [tab, setTab] = useState<GrazTab>("samedi");
  const [pendingB, setPendingB] = useState(false);
  const [pendingSun, setPendingSun] = useState(false);
  const [pendingRegroup, setPendingRegroup] = useState(false);
  const [pendingSE, setPendingSE] = useState(false);
  const [pendingReset, setPendingReset] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const poolAId = pools.find((p: any) => p.name === "Pool A")?.id;
  const poolBId = pools.find((p: any) => p.name === "Pool B")?.id;

  const rrMatches = matches.filter((m: any) => m.phase === "GRAZ_RR");
  const poolADay1 = rrMatches.filter((m: any) => m.dayIndex === "SAT" && m.poolId === poolAId);
  const poolBDay1 = rrMatches.filter((m: any) => m.dayIndex === "SAT" && m.poolId === poolBId);
  const sundayRR = rrMatches.filter((m: any) => m.dayIndex === "SUN");
  const regroupMatches = matches.filter((m: any) => m.phase === "GRAZ_REGROUP");
  const seMatches = matches.filter((m: any) => m.phase === "GRAZ_SE");

  const poolADay1Done = poolADay1.length > 0 && poolADay1.every((m: any) => m.status === "FINISHED");
  const poolBDay1Done = poolBDay1.length > 0 && poolBDay1.every((m: any) => m.status === "FINISHED");
  const sundayRRDone = sundayRR.length > 0 && sundayRR.every((m: any) => m.status === "FINISHED");

  const canLaunchPoolB = poolADay1.length > 0 && poolBDay1.length === 0;
  const canLaunchSundayRR = poolADay1.length > 0 && poolBDay1.length > 0 && sundayRR.length === 0;

  const matchCount = (arr: any[]) => ({ done: arr.filter((m: any) => m.status === "FINISHED").length, total: arr.length });

  function StatusLine({ arr }: { arr: any[] }) {
    const { done, total } = matchCount(arr);
    if (total === 0) return <p className="meta">{t("orga_matches_not_generated")}</p>;
    return (
      <p style={{ fontSize: 13, margin: 0, color: done === total ? "var(--teal)" : "var(--text)" }}>
        {t("orga_matches_finished_count", { done, total })}{done === total ? " ✓" : ""}
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <div className="tabs-bar" style={{ marginTop: 0 }}>
        <div className="tabs">
          {(["samedi", "dimanche"] as GrazTab[]).map((v) => (
            <button key={v} type="button" onClick={() => setTab(v)} className={`tab${tab === v ? " active" : ""}`}>
              {v === "samedi" ? t("orga_day1_label") : t("orga_day2_label")}
            </button>
          ))}
        </div>
      </div>

      {error && <p style={{ color: "var(--danger)", fontSize: 12, padding: "8px 0" }}>{error}</p>}

      {tab === "samedi" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Pool A — matin */}
          <div className="panel">
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 8 }}>
              {t("graz_pool_a_day1" as any)}
            </p>
            <StatusLine arr={poolADay1} />
          </div>

          {/* Pool B — après-midi */}
          <div className="panel">
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 8 }}>
              {t("graz_pool_b_day1" as any)}
            </p>
            <StatusLine arr={poolBDay1} />
            {canLaunchPoolB && launchGrazPoolBAction && (
              <button
                className="primary"
                style={{ marginTop: 10, fontSize: 13 }}
                disabled={pendingB}
                onClick={async () => {
                  setPendingB(true);
                  setError(null);
                  const res = await launchGrazPoolBAction();
                  if (res?.error) setError(res.error);
                  setPendingB(false);
                }}
              >
                {pendingB ? "..." : t("graz_launch_pool_b" as any)}
              </button>
            )}
          </div>
        </div>
      )}

      {tab === "dimanche" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Rounds 6-7 alternés */}
          <div className="panel">
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 8 }}>
              {t("graz_sunday_rr" as any)}
            </p>
            <StatusLine arr={sundayRR} />
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              {canLaunchSundayRR && launchGrazSundayRRAction && (
                <button className="primary" style={{ fontSize: 13 }} disabled={pendingSun}
                  onClick={async () => { setPendingSun(true); setError(null); const res = await launchGrazSundayRRAction(); if (res?.error) setError(res.error); setPendingSun(false); }}>
                  {pendingSun ? "..." : t("graz_launch_sunday_rr" as any)}
                </button>
              )}
              {sundayRR.length > 0 && resetGrazPhaseAction && (
                <button className="ghost" style={{ fontSize: 12, color: "var(--danger)" }} disabled={pendingReset === "SUNDAY_RR"}
                  onClick={async () => { if (!window.confirm("Reset Rounds 6-7 + Regroup + SE ?")) return; setPendingReset("SUNDAY_RR"); setError(null); const res = await resetGrazPhaseAction("SUNDAY_RR"); if (res?.error) setError(res.error); setPendingReset(null); }}>
                  {pendingReset === "SUNDAY_RR" ? "..." : "↺ Reset"}
                </button>
              )}
            </div>
          </div>

          {/* Regroup */}
          <div className="panel">
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 8 }}>
              {t("graz_regroup" as any)}
            </p>
            <StatusLine arr={regroupMatches} />
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              {regroupMatches.length === 0 && sundayRRDone && launchGrazRegroupAction && (
                <button className="primary" style={{ fontSize: 13 }} disabled={pendingRegroup}
                  onClick={async () => { setPendingRegroup(true); setError(null); const res = await launchGrazRegroupAction(); if (res?.error) setError(res.error); setPendingRegroup(false); }}>
                  {pendingRegroup ? "..." : t("graz_launch_regroup" as any)}
                </button>
              )}
              {regroupMatches.length > 0 && resetGrazPhaseAction && (
                <button className="ghost" style={{ fontSize: 12, color: "var(--danger)" }} disabled={pendingReset === "REGROUP"}
                  onClick={async () => { if (!window.confirm("Reset Regroup + SE ?")) return; setPendingReset("REGROUP"); setError(null); const res = await resetGrazPhaseAction("REGROUP"); if (res?.error) setError(res.error); setPendingReset(null); }}>
                  {pendingReset === "REGROUP" ? "..." : "↺ Reset"}
                </button>
              )}
            </div>
          </div>

          {/* SE */}
          <div className="panel">
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 8 }}>
              {t("graz_se" as any)}
            </p>
            <StatusLine arr={seMatches} />
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              {seMatches.length === 0 && regroupMatches.length > 0 && regroupMatches.every((m: any) => m.status === "FINISHED") && launchGrazSEAction && (
                <button className="primary" style={{ fontSize: 13 }} disabled={pendingSE}
                  onClick={async () => { setPendingSE(true); setError(null); const res = await launchGrazSEAction(); if (res?.error) setError(res.error); setPendingSE(false); }}>
                  {pendingSE ? "..." : t("graz_launch_se" as any)}
                </button>
              )}
              {seMatches.length > 0 && resetGrazPhaseAction && (
                <button className="ghost" style={{ fontSize: 12, color: "var(--danger)" }} disabled={pendingReset === "SE"}
                  onClick={async () => { if (!window.confirm("Reset SE ?")) return; setPendingReset("SE"); setError(null); const res = await resetGrazPhaseAction("SE"); if (res?.error) setError(res.error); setPendingReset(null); }}>
                  {pendingReset === "SE" ? "..." : "↺ Reset"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── BerlinMixedPlanning ─────────────────────────────────────────────────────

type BerlinTab = "groupes" | "vendredi" | "samedi" | "dimanche" | "brackets";

type BerlinTabDef = { value: BerlinTab; key: string };

const BERLIN_TABS: BerlinTabDef[] = [
  { value: "groupes",   key: "berlin_tab_groupes" },
  { value: "vendredi",  key: "berlin_tab_vendredi" },
  { value: "samedi",    key: "berlin_tab_samedi" },
  { value: "dimanche",  key: "berlin_tab_dimanche" },
  { value: "brackets",  key: "berlin_tab_brackets" },
];

function BerlinMixedPlanning({ tournament, teams, matches }: { tournament: any; teams: any[]; matches: any[] }) {
  const t = useTranslations("tournament");
  const [berlinTab, setBerlinTab] = useState<BerlinTab>("groupes");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Onglets Berlin — mêmes classes CSS que les onglets de la page publique */}
      <div className="tabs-bar" style={{ marginTop: 0 }}>
        <div className="tabs">
          {BERLIN_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setBerlinTab(tab.value)}
              className={`tab${berlinTab === tab.value ? " active" : ""}`}
            >
              {t(tab.key as any)}
            </button>
          ))}
        </div>
      </div>

      {/* Contenu */}
      {berlinTab === "groupes" && (
        <div className="panel">
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 12 }}>
            {t("berlin_friday_ab_label")}
          </p>
          <FridayGroupAssignment
            tournamentId={tournament.id}
            teams={teams.map((t) => ({ id: t.id, name: t.name, seed: t.seed, fridayGroup: t.fridayGroup }))}
            isLocked={false}
          />
        </div>
      )}

      {berlinTab === "vendredi" && (
        <div className="panel">
          <BerlinMixedActions
            tournamentId={tournament.id}
            teams={teams}
            matches={matches}
            tournament={tournament}
            phase="vendredi"
          />
        </div>
      )}

      {berlinTab === "samedi" && (
        <div className="panel">
          <BerlinMixedActions
            tournamentId={tournament.id}
            teams={teams}
            matches={matches}
            tournament={tournament}
            phase="samedi"
          />
        </div>
      )}

      {berlinTab === "dimanche" && (
        <div className="panel">
          <BerlinMixedActions
            tournamentId={tournament.id}
            teams={teams}
            matches={matches}
            tournament={tournament}
            phase="dimanche"
          />
        </div>
      )}

      {berlinTab === "brackets" && (
        <div className="panel">
          <BerlinMixedActions
            tournamentId={tournament.id}
            teams={teams}
            matches={matches}
            tournament={tournament}
            phase="brackets"
          />
        </div>
      )}
    </div>
  );
}

// ─── Types ───────────────────────────────────────────────────────────────────

type OrgaDashboardProps = {
  tournament: any;
  teams: any[];
  freeAgents: any[];
  pools: any[];
  matches: any[];
  sponsors: any[];
  coOrganizers: any[];
  // Derived flags
  isCreator: boolean;
  isAdmin: boolean;
  isOrgaForThis: boolean;
  // Server actions (passed as props from Server Component)
  updateAction: (formData: FormData) => Promise<{ ok?: boolean; error?: unknown }>;
  toggleLockAction: (id: string, confirmReset?: boolean) => Promise<{ ok?: boolean; locked?: boolean; confirm?: boolean; message?: string; error?: string }>;
  importAction: (formData: FormData) => Promise<void>;
  addSponsorAction: (...args: any[]) => Promise<any>;
  deleteSponsorAction: (...args: any[]) => Promise<any>;
  deleteFreeAgentAction: (...args: any[]) => Promise<any>;
  renameTeamAction: (...args: any[]) => Promise<any>;
  deleteTeamAction: (...args: any[]) => Promise<any>;
  removePlayerAction: (...args: any[]) => Promise<any>;
  addPlayerAction: (...args: any[]) => Promise<any>;
  launchAction: (formData: FormData) => Promise<void>;
  resetAction: (formData: FormData) => Promise<void>;
  resetMatchesAction: (formData: FormData) => Promise<void>;
  launchGrazPoolBAction?: () => Promise<{ ok?: boolean; error?: string }>;
  launchGrazSundayRRAction?: () => Promise<{ ok?: boolean; error?: string }>;
  launchGrazRegroupAction?: () => Promise<{ ok?: boolean; error?: string }>;
  launchGrazSEAction?: () => Promise<{ ok?: boolean; error?: string }>;
  resetGrazPhaseAction?: (phase: "SUNDAY_RR" | "REGROUP" | "SE") => Promise<{ ok?: boolean; error?: string }>;
  // Orga tab data
  orgaTasks: Array<{ id: string; title: string; description: string | null; deadline: string | null; completed: boolean; priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT"; assignees: Array<{ player: { id: string; name: string } }>; createdBy: { id: string; name: string }; createdAt: string }>;
  orgaNotes: Array<{ id: string; content: string; author: { id: string; name: string }; createdAt: string; updatedAt: string }>;
  orgaLinks: Array<{ id: string; label: string; url: string; addedBy: { id: string; name: string }; createdAt: string }>;
  currentPlayerId: string;
  toggleTeamSelectedAction: (teamId: string, tId: string, selected: boolean) => Promise<any>;
  drawTeamsAction: (tId: string, count: number, preDrawnIds?: string[]) => Promise<any>;
  guaranteeTeamAction: (teamId: string, tId: string, guaranteed: boolean) => Promise<any>;
  drawOneTeamAction: (tId: string, candidateIds: string[]) => Promise<any>;
  drawOneWaitlistAction: (tId: string, candidateIds: string[]) => Promise<any>;
  removeFromWaitlistAction: (tId: string, teamId: string) => Promise<any>;
  createTeamAction: (...args: any[]) => Promise<any>;
  accommodationHosts?: Array<{
    id: string; playerId: string | null; name: string; contact: string | null; notes: string | null;
    player: { id: string; name: string; photoPath: string | null } | null;
    guests: Array<{ id: string; notes: string | null; teamPlayer: { id: string; player: { id: string; name: string; photoPath: string | null }; team: { id: string; name: string } } }>;
  }>;
};

type Tab = "teams" | "config" | "planning" | "orga" | "orgateam" | "hebergement";

// ─── Tab label helper ─────────────────────────────────────────────────────────

const TAB_KEYS: Record<Tab, string> = {
  teams:        "orga_tab_teams",
  config:       "orga_tab_config",
  planning:     "orga_tab_planning",
  orga:         "orga_tab_orga",
  orgateam:     "orga_tab_orgateam",
  hebergement:  "orga_tab_hebergement",
};

// ─── Main component ───────────────────────────────────────────────────────────

export function OrgaDashboard({
  tournament,
  teams,
  freeAgents,
  pools,
  matches,
  sponsors,
  coOrganizers,
  isCreator,
  isAdmin,
  isOrgaForThis,
  updateAction,
  toggleLockAction,
  importAction,
  addSponsorAction,
  deleteSponsorAction,
  deleteFreeAgentAction,
  renameTeamAction,
  deleteTeamAction,
  removePlayerAction,
  addPlayerAction,
  launchAction,
  resetAction,
  resetMatchesAction,
  launchGrazPoolBAction,
  launchGrazSundayRRAction,
  launchGrazRegroupAction,
  launchGrazSEAction,
  resetGrazPhaseAction,
  orgaTasks,
  orgaNotes,
  orgaLinks,
  currentPlayerId,
  toggleTeamSelectedAction,
  drawTeamsAction,
  guaranteeTeamAction,
  drawOneTeamAction,
  drawOneWaitlistAction,
  removeFromWaitlistAction,
  createTeamAction,
  accommodationHosts = [],
}: OrgaDashboardProps) {
  const t = useTranslations("tournament");

  const tabStorageKey = `orga_tab_${tournament.id}`;
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(tabStorageKey);
      if (saved === "teams" || saved === "config" || saved === "planning" || saved === "orga" || saved === "orgateam" || saved === "hebergement") return saved;
    }
    return "config";
  });

  useEffect(() => {
    localStorage.setItem(tabStorageKey, activeTab);
  }, [activeTab, tabStorageKey]);

  // Derived match state
  const poolMatches = matches.filter((m) => m.phase === "POOL" || m.phase === "SWISS");
  const poolMatchesFinished = poolMatches.length > 0 && poolMatches.every((m) => m.status === "FINISHED");
  const crossPoolMatches = matches.filter((m) => m.phase === "CROSS_POOL");
  const crossPoolGenerated = crossPoolMatches.length > 0;
  const crossPoolFinished = crossPoolGenerated && crossPoolMatches.every((m) => m.status === "FINISHED");
  const bracketMatches = matches.filter((m) => m.phase === "BRACKET");
  const seGenerated = bracketMatches.length > 0;
  const seRound1 = bracketMatches.filter((m) => m.roundIndex === 1);
  const seRound1Finished = seRound1.length > 0 && seRound1.every((m) => m.status === "FINISHED");
  const deGenerated = bracketMatches.some((m: any) => m.bracketSide === "L");
  const hasAnyMatches = matches.length > 0;
  const hasBracketMatches = bracketMatches.length > 0;
  const canLaunch = (tournament.status === "UPCOMING" || (tournament.status === "LIVE" && matches.length === 0)) && teams.some((t) => t.selected === true);
  const isLive = tournament.status === "LIVE";

  // All bracket matches finished → show "mark as completed" button
  const allBracketFinished = bracketMatches.length > 0 && bracketMatches.every((m) => m.status === "FINISHED");
  const [completePending, setCompletePending] = useState(false);
  const [completeDone, setCompleteDone] = useState(false);

  const handleMarkCompleted = async () => {
    setCompletePending(true);
    try {
      const res = await fetch(`/api/tournaments/${tournament.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED" }),
      });
      if (res.ok) {
        setCompleteDone(true);
        setTimeout(() => window.location.reload(), 800);
      }
    } finally {
      setCompletePending(false);
    }
  };

  // KPIs
  const selectedTeams = (isLive || tournament.status === "COMPLETED") && teams.filter((t) => t.selected !== false).length > 0
    ? teams.filter((t) => t.selected !== false).length
    : teams.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {/* ── Status ── */}
      <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span className={`status ${tournament.status.toLowerCase()}`}>{tournament.status}</span>
        {isLive && allBracketFinished && !completeDone && (
          <button
            type="button"
            className="btn btn--success"
            onClick={handleMarkCompleted}
            disabled={completePending}
            style={{ fontSize: 13, padding: "6px 14px" }}
          >
            {completePending ? "…" : `🏁 ${t("orga_mark_completed")}`}
          </button>
        )}
        {completeDone && (
          <span style={{ fontSize: 13, color: "var(--success, #3a9a5c)", fontWeight: 600 }}>
            ✓ {t("orga_marked_completed")}
          </span>
        )}
      </div>

      {/* ── KPI bar ── */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <div className="panel" style={{ textAlign: "center", padding: 16 }}>
          <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "var(--font-display)" }}>
            {selectedTeams}<span style={{ fontSize: 14, color: "var(--text-muted)", marginLeft: 2 }}>/{tournament.maxTeams}</span>
          </div>
          <p className="meta">{t("edit_kpi_teams")}</p>
        </div>
        <div className="panel" style={{ textAlign: "center", padding: 16 }}>
          <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "var(--font-display)" }}>{freeAgents.length}</div>
          <p className="meta">{t("edit_kpi_free_agents")}</p>
        </div>
        <div className="panel" style={{ textAlign: "center", padding: 16 }}>
          <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "var(--font-display)" }}>{teams.reduce((acc, t) => acc + t.players.length, 0)}</div>
          <p className="meta">{t("edit_kpi_players")}</p>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="tabs-bar" style={{ marginTop: 0 }}>
        <div className="tabs">
          {(["config", "teams", "planning", "orga", "orgateam", ...(tournament.accommodationAvailable ? ["hebergement"] : [])] as Tab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`tab${activeTab === tab ? " active" : ""}`}
            >
              {t(TAB_KEYS[tab] as any)}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab: Config ── */}
      {activeTab === "config" && (
        <>
          <TournamentEditForm
            tournament={tournament}
            action={updateAction}
            toggleLockAction={toggleLockAction}
          />
        </>
      )}

      {/* ── Tab: Équipes ── */}
      {activeTab === "teams" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <UnifiedTeamManager
            tournamentId={tournament.id}
            teams={teams}
            locked={tournament.locked}
            format={tournament.format}
            showPayment={true}
            showRecap={true}
            feePerTeam={tournament.registrationFeePerTeam ?? 0}
            feeCurrency={tournament.registrationFeeCurrency ?? "EUR"}
            maxTeams={tournament.maxTeams}
            renameAction={renameTeamAction}
            deleteTeamAction={deleteTeamAction}
            removePlayerAction={removePlayerAction}
            addPlayerAction={addPlayerAction}
            createTeamAction={createTeamAction}
          />

          {freeAgents.length > 0 && (
            <div className="panel">
              <h3 style={{ marginBottom: 12 }}>{t("edit_free_agents_title", { count: freeAgents.length })}</h3>
              <FreeAgentList
                agents={freeAgents}
                canDelete
                deleteAction={deleteFreeAgentAction}
                title=""
              />
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Planning ── */}
      {activeTab === "planning" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Pool Schedule Editor — éditer les horaires de chaque poule */}
          <PoolScheduleEditor
            tournamentId={tournament.id}
            gameDurationMin={tournament.gameDurationMin}
            poolAStart={(tournament as any).saturdayPoolAStart}
            poolBStart={(tournament as any).saturdayPoolBStart}
            poolCount={tournament.poolCount ?? 1}
            tournamentDateStart={tournament.dateStart}
          />

          {/* Pool Assignment (pour cross-pool format) */}
          {(tournament.poolCount ?? 1) > 1 && !isLive && (
            <div className="panel">
              <PoolAssignment
                tournamentId={tournament.id}
                teams={teams.filter((t) => t.selected).map((t) => ({ id: t.id, name: t.name, seed: t.seed }))}
                pools={pools}
                poolCount={tournament.poolCount ?? 1}
                isLocked={false}
              />
            </div>
          )}

          {/* Explication du format actuel */}
          <div className="panel" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 8 }}>
              {t("orga_planning_format_configured")}
            </p>
            {tournament.saturdayFormat === "GRAZ" ? (
              <>
                <p style={{ fontSize: 13, margin: 0 }}>
                  <strong>{t("orga_format_graz_title")}</strong> — {t("orga_format_graz_days")}
                </p>
                <p style={{ fontSize: 12, margin: "4px 0 0", color: "var(--text-muted)" }}>
                  {t("orga_format_graz_desc")}
                </p>
              </>
            ) : tournament.saturdayFormat === "BERLIN_MIXED" ? (
              <>
                <p style={{ fontSize: 13, margin: 0 }}>
                  <strong>{t("orga_format_berlin_mixed_title")}</strong> — {t("orga_format_berlin_mixed_days")}
                </p>
                <p style={{ fontSize: 12, margin: "4px 0 0", color: "var(--text-muted)" }}>
                  {t("orga_format_berlin_mixed_friday", { fridayRounds: tournament.fridayRounds ?? 5 })}
                  · {t("orga_format_berlin_mixed_saturday", { saturdayRounds: tournament.saturdayRounds ?? 5 })}
                  · {t("orga_format_berlin_mixed_sunday", { sundayRounds: tournament.sundayRounds ?? 2 })}
                </p>
              </>
            ) : (
              <>
                <p style={{ fontSize: 13, margin: 0 }}>
                  <strong>{t("orga_day1_label")} :</strong>{" "}
                  {tournament.saturdayFormat === "SWISS"
                    ? t("orga_format_swiss", { rounds: tournament.swissRounds ?? 5 })
                    : tournament.saturdayFormat === "SPLIT_POOLS"
                      ? t("orga_format_split_pools", { count: tournament.poolCount ?? 2 })
                      : t("orga_format_single_pool")}
                  {tournament.crossPool ? t("orga_format_cross_pool") : ""}
                </p>
                <p style={{ fontSize: 13, margin: "4px 0 0" }}>
                  <strong>{t("orga_day2_label")} :</strong>{" "}
                  {tournament.sundayFormat === "DE" ? t("orga_format_de") : tournament.sundayFormat === "SE" ? t("orga_format_se") : t("orga_format_rr")}
                  {tournament.thirdPlaceMatch ? t("orga_format_3rd") : ""}
                  {tournament.gfReset ? t("orga_format_gf_reset") : ""}
                </p>
              </>
            )}
            {!tournament.locked && (
              <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8, marginBottom: 0 }}
                dangerouslySetInnerHTML={{ __html: t("orga_planning_format_locked_warning") }}
              />
            )}

            {/* Preview : estimation matchs & durée */}
            {(() => {
              const n = selectedTeams;
              const dur = tournament.gameDurationMin ?? 12;
              const pause = 4;
              const slot = dur + pause;
              const courts = tournament.courtsCount ?? 1;

              let day1Matches = 0;
              let day2Matches = 0;

              if (tournament.saturdayFormat === "BERLIN_MIXED") {
                const half = Math.ceil(n / 2);
                const fridayRounds = tournament.fridayRounds ?? 5;
                const saturdayRounds = tournament.saturdayRounds ?? 5;
                const sundayRounds = tournament.sundayRounds ?? 2;
                day1Matches = fridayRounds * Math.floor(half / 2) * 2;
                day2Matches = saturdayRounds * Math.floor(half / 2) * 2 + sundayRounds * Math.floor(n / 2);
              } else if (tournament.saturdayFormat === "GRAZ") {
                const poolSize = Math.ceil(n / 2);
                const matchesPerRound = Math.floor(poolSize / 2);
                // Day 1: 5 rounds × 2 pools
                day1Matches = 5 * matchesPerRound * 2;
                // Day 2: 2 remaining RR rounds + phase 2 (2 new matches/team = n matches) + SE 7 matches
                const day2RR = 2 * matchesPerRound * 2;
                const phase2 = n; // each team plays 2 new matches, n/2 pairs per group × 4 groups ≈ n
                const se = 7; // QF×4 + SF×2 + F×1
                day2Matches = day2RR + phase2 + se;
              } else if (tournament.saturdayFormat === "SWISS") {
                const rounds = tournament.swissRounds ?? 5;
                day1Matches = rounds * Math.floor(n / 2);
              } else {
                // Pool RR
                const poolCount = tournament.poolCount ?? 1;
                const perPool = Math.ceil(n / poolCount);
                day1Matches = poolCount * (perPool * (perPool - 1) / 2);
              }

              if (tournament.saturdayFormat !== "BERLIN_MIXED" && tournament.saturdayFormat !== "GRAZ") {
                const bracketSize = tournament.bracketSize ?? 16;
                const qualified = Math.min(bracketSize, n);
                if (tournament.sundayFormat === "DE") {
                  day2Matches = 2 * qualified - 2 + (tournament.gfReset ? 1 : 0);
                } else if (tournament.sundayFormat === "SE") {
                  day2Matches = qualified - 1 + (tournament.thirdPlaceMatch ? 1 : 0);
                } else {
                  day2Matches = qualified * (qualified - 1) / 2;
                }
                if (tournament.crossPool) {
                  day2Matches += Math.floor(n / 2);
                }
              }

              const totalMatches = Math.round(day1Matches + day2Matches);
              const day1Dur = Math.ceil(day1Matches / courts) * slot;
              const day2Dur = Math.ceil(day2Matches / courts) * slot;
              const fmtTime = (mins: number) => `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, "0")}`;

              return (
                <div style={{ marginTop: 12, padding: "10px 12px", background: "var(--bg-muted)", borderRadius: 8, fontSize: 12 }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 6 }}>
                    {t("orga_preview_title")}
                  </p>
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                    <span>📊 <strong>{totalMatches}</strong> {t("orga_preview_matches")}</span>
                    <span>📅 {t("orga_day1_label")}: <strong>{Math.round(day1Matches)}</strong> ({fmtTime(day1Dur)})</span>
                    <span>📅 {t("orga_day2_label")}: <strong>{Math.round(day2Matches)}</strong> ({fmtTime(day2Dur)})</span>
                    <span>⏱ {t("orga_preview_slot")}: {slot}min ({dur}+{pause})</span>
                    {courts > 1 && <span>🏟 {courts} {t("orga_preview_courts")}</span>}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Lancer / Reset */}
          {canLaunch && (
            <ConfirmFormButton
              action={launchAction}
              confirmMessage={t("edit_launch_confirm")}
              className="primary"
              style={{ width: "100%", padding: "16px 24px", fontSize: 16, fontFamily: "var(--font-display)", fontWeight: 700, justifyContent: "center", display: "flex", alignItems: "center", gap: 10 }}
            >
              🚀 {t("edit_launch_tournament")}
            </ConfirmFormButton>
          )}

          {isLive && (
            <ConfirmFormButton
              action={resetAction}
              confirmMessage={t("edit_reset_confirm")}
              className="ghost"
              style={{ fontSize: 12, padding: "6px 14px", color: "var(--danger)" }}
            >
              {t("edit_reset_tournament")}
            </ConfirmFormButton>
          )}

          {isLive && (
            <ConfirmFormButton
              action={resetMatchesAction}
              confirmMessage={t("edit_reset_matches_confirm")}
              className="ghost"
              style={{ fontSize: 12, padding: "6px 14px", color: "var(--warning)" }}
            >
              {t("edit_reset_matches")}
            </ConfirmFormButton>
          )}

          {/* ── Berlin Mixed Format planning ── */}
          {tournament.saturdayFormat === "BERLIN_MIXED" && (isLive || tournament.status === "COMPLETED") && (
            <BerlinMixedPlanning
              tournament={tournament}
              teams={teams.filter((t) => t.selected !== false)}
              matches={matches}
            />
          )}

          {/* ── Graz Format planning ── */}
          {tournament.saturdayFormat === "GRAZ" && (isLive || tournament.status === "COMPLETED") && (
            <GrazPlanning
              tournament={tournament}
              pools={pools}
              matches={matches}
              launchGrazPoolBAction={launchGrazPoolBAction}
              launchGrazSundayRRAction={launchGrazSundayRRAction}
              launchGrazRegroupAction={launchGrazRegroupAction}
              launchGrazSEAction={launchGrazSEAction}
              resetGrazPhaseAction={resetGrazPhaseAction}
            />
          )}

          {/* ── Planning standard (non-Berlin, non-Graz) ── */}
          {tournament.saturdayFormat !== "BERLIN_MIXED" && tournament.saturdayFormat !== "GRAZ" && (
            <>
              {/* Pools — séparés par pool pour format multi-poule */}
              {hasAnyMatches && (tournament.poolCount ?? 1) > 1 && (
                <>
                  {pools.map((pool: any) => {
                    const poolTeamIds = new Set(pool.teams.map((pt: any) => pt.team.id));
                    const matchesInPool = poolMatches.filter((m) => poolTeamIds.has(m.teamAId) || poolTeamIds.has(m.teamBId));

                    return (
                      <div key={pool.id} className="panel">
                        <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 10 }}>
                          {t("orga_day1_label")} — {pool.name}
                        </p>
                        {matchesInPool.length === 0 ? (
                          <p className="meta">{t("orga_matches_not_generated")}</p>
                        ) : (
                          <p style={{ fontSize: 13, margin: 0, color: matchesInPool.every((m) => m.status === "FINISHED") ? "var(--teal)" : "var(--text)" }}>
                            {t("orga_matches_finished_count", { done: matchesInPool.filter((m) => m.status === "FINISHED").length, total: matchesInPool.length })}
                            {matchesInPool.every((m) => m.status === "FINISHED") ? " ✓" : ""}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </>
              )}

              {/* Jour 1 — matchs pool (format simple ou Swiss) */}
              {hasAnyMatches && (tournament.poolCount ?? 1) === 1 && (
                <div className="panel">
                  <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 10 }}>
                    {t("orga_day1_label")} — {tournament.saturdayFormat === "SWISS" ? "Swiss" : "Pools"}
                  </p>
                  {poolMatches.length === 0 ? (
                    <p className="meta">{t("orga_matches_not_generated")}</p>
                  ) : (
                    <p style={{ fontSize: 13, margin: 0, color: poolMatchesFinished ? "var(--teal)" : "var(--text)" }}>
                      {t("orga_matches_finished_count", { done: poolMatches.filter((m) => m.status === "FINISHED").length, total: poolMatches.length })}
                      {poolMatchesFinished ? " ✓" : ""}
                    </p>
                  )}
                </div>
              )}

              {/* Cross-pool (format Barcelona) */}
              {tournament.crossPool && (isLive || tournament.status === "COMPLETED") && poolMatchesFinished && (
                <div className="panel">
                  <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 12 }}>
                    {t("orga_day2_label")} — {t("orga_format_cross_pool")}
                  </p>
                  <CrossPoolActions
                    tournamentId={tournament.id}
                    hasCrossPool={tournament.crossPool}
                    poolMatchesFinished={poolMatchesFinished}
                    crossPoolGenerated={matches.some((m) => m.phase === "CROSS_POOL")}
                    crossPoolFinished={matches
                      .filter((m) => m.phase === "CROSS_POOL")
                      .every((m) => m.status === "FINISHED")}
                    seGenerated={matches.some((m) => m.phase === "SE")}
                    seRound1Finished={matches
                      .filter((m) => m.phase === "SE" && m.roundIndex === 1)
                      .every((m) => m.status === "FINISHED")}
                    deGenerated={matches.some((m) => m.phase === "DE")}
                  />
                </div>
              )}

              {/* Jour 2 — bracket standard */}
              {!tournament.crossPool && (isLive || tournament.status === "COMPLETED") && poolMatchesFinished && (
                <div className="panel">
                  <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 12 }}>
                    {t("orga_day2_label")} — {tournament.sundayFormat === "DE" ? t("orga_format_de") : tournament.sundayFormat === "SE" ? t("orga_format_se") : t("orga_format_rr")}
                  </p>
                  <BracketActions
                    tournamentId={tournament.id}
                    returnPath={`/tournament/${tournament.slug ?? tournament.id}?tab=bracket`}
                    hasQualifyingMatches={poolMatches.length > 0}
                    isRR={tournament.sundayFormat === "RR"}
                    mode={hasBracketMatches ? "buttons" : "launch"}
                  />
                </div>
              )}
            </>
          )}

          {/* État si pas encore lancé */}
          {!hasAnyMatches && !canLaunch && (
            <div className="panel" style={{ textAlign: "center", padding: 32, color: "var(--text-muted)" }}>
              <p style={{ fontSize: 13 }} dangerouslySetInnerHTML={{ __html: t("orga_no_teams_hint") }} />
            </div>
          )}

        </div>
      )}

      {/* ── Tab: Orga ── */}
      {activeTab === "orga" && (
        <div style={{ display: "grid", gap: 24 }}>
          {/* Task board */}
          <OrgaTaskBoard
            tasks={orgaTasks}
            tournamentId={tournament.id}
            coOrganizers={coOrganizers.map((co) => ({
              playerId: co.playerId,
              playerName: co.player.name,
            }))}
          />

          {/* Note board */}
          <OrgaNoteBoard
            notes={orgaNotes}
            tournamentId={tournament.id}
            currentPlayerId={currentPlayerId}
          />

          {/* Link board */}
          <OrgaLinkBoard
            links={orgaLinks}
            tournamentId={tournament.id}
          />

          {/* DrawPanel ABC Chapeau */}
          {tournament.format === "ABC Chapeau" && (() => {
            const soloEntries = (tournament as any).soloEntries ?? [];
            const abcTeams = teams.map((t) => ({ id: t.id, name: t.name }));
            return (
              <DrawPanel
                tournamentId={tournament.id}
                soloEntries={soloEntries}
                teams={abcTeams}
              />
            );
          })()}

          {/* Sélection / Tirage au sort */}
          {teams.length > 0 && tournament.format !== "ABC Chapeau" && (
            <div className="panel">
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: 16, marginBottom: 12 }}>{t("orga_selection_title")}</h3>
              <SelectionManager
                teams={teams.map((t) => ({
                  id: t.id,
                  name: t.name,
                  seed: t.seed,
                  city: t.city,
                  country: t.country,
                  selected: t.selected,
                  guaranteed: t.guaranteed,
                  waitlistPosition: t.waitlistPosition,
                }))}
                maxTeams={tournament.maxTeams}
                tournamentId={tournament.id}
                toggleAction={toggleTeamSelectedAction}
                drawAction={drawTeamsAction}
                guaranteeAction={guaranteeTeamAction}
                drawOneAction={drawOneTeamAction}
                drawOneWaitlistAction={drawOneWaitlistAction}
                removeFromWaitlistAction={removeFromWaitlistAction}
              />
            </div>
          )}

        </div>
      )}

      {/* ── Tab: Équipe orga ── */}
      {activeTab === "orgateam" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <SponsorManager
            tournamentId={tournament.id}
            sponsors={sponsors}
            addAction={addSponsorAction}
            deleteAction={deleteSponsorAction}
          />
          <CoOrganizerManager
            tournamentId={tournament.id}
            coOrganizers={coOrganizers.filter((co) => co.role !== "REF").map((co) => co.player)}
            canManage={isCreator || isAdmin}
          />
          <RefereeManager
            tournamentId={tournament.id}
            referees={coOrganizers.filter((co) => co.role === "REF").map((co) => co.player)}
            canManage={isCreator || isAdmin || isOrgaForThis}
          />
        </div>
      )}

      {/* ── Tab: Hébergement ── */}
      {activeTab === "hebergement" && tournament.accommodationAvailable && (
        <AccommodationManager
          tournamentId={tournament.id}
          teamPlayers={teams.flatMap((team) =>
            (team.players ?? []).map((tp: any) => ({
              id: tp.id,
              needsAccommodation: tp.needsAccommodation ?? false,
              player: tp.player,
              team: { id: team.id, name: team.name },
            }))
          )}
          initialHosts={accommodationHosts}
        />
      )}

    </div>
  );
}
