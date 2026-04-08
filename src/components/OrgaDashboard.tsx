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
import { TestModeToggle } from "@/components/TestModeToggle";
import { OrgaTaskBoard } from "@/components/OrgaTaskBoard";
import { OrgaNoteBoard } from "@/components/OrgaNoteBoard";
import { OrgaLinkBoard } from "@/components/OrgaLinkBoard";
import { SelectionManager } from "@/components/SelectionManager";
import { DrawPanel } from "@/components/DrawPanel";


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
  // Orga tab data
  orgaTasks: Array<{ id: string; title: string; description: string | null; deadline: string | null; completed: boolean; priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT"; assignedTo: { id: string; name: string } | null; createdBy: { id: string; name: string }; createdAt: string }>;
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
};

type Tab = "teams" | "config" | "planning" | "orga" | "orgateam";

// ─── Tab label helper ─────────────────────────────────────────────────────────

const TAB_KEYS: Record<Tab, string> = {
  teams:    "orga_tab_teams",
  config:   "orga_tab_config",
  planning: "orga_tab_planning",
  orga:     "orga_tab_orga",
  orgateam: "orga_tab_orgateam",
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
}: OrgaDashboardProps) {
  const t = useTranslations("tournament");

  const tabStorageKey = `orga_tab_${tournament.id}`;
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(tabStorageKey);
      if (saved === "teams" || saved === "config" || saved === "planning" || saved === "orga" || saved === "orgateam") return saved;
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

  // KPIs
  const selectedTeams = (isLive || tournament.status === "COMPLETED") && teams.filter((t) => t.selected !== false).length > 0
    ? teams.filter((t) => t.selected !== false).length
    : teams.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {/* ── Status ── */}
      <div style={{ marginBottom: 12 }}>
        <span className={`status ${tournament.status.toLowerCase()}`}>{tournament.status}</span>
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
          {(["config", "teams", "planning", "orga", "orgateam"] as Tab[]).map((tab) => (
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
          <TestModeToggle tournamentId={tournament.id} initialTestMode={tournament.testMode ?? false} />
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
            {tournament.saturdayFormat === "BERLIN_MIXED" ? (
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
          </div>

          {/* Jour 1 — matchs pool séparés par pool pour format multi-poule */}
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

          {/* ── Berlin Mixed Format planning ── */}
          {tournament.saturdayFormat === "BERLIN_MIXED" && (isLive || tournament.status === "COMPLETED") && (
            <BerlinMixedPlanning
              tournament={tournament}
              teams={teams.filter((t) => t.selected !== false)}
              matches={matches}
            />
          )}

          {/* ── Planning standard (non-Berlin) ── */}
          {tournament.saturdayFormat !== "BERLIN_MIXED" && (
            <>
              {/* Jour 1 — matchs pool séparés par pool pour format multi-poule */}
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
          {/* Stats bar */}
          <div className="orga-stats-bar">
            <span style={{ fontWeight: 700, fontFamily: "var(--font-display)" }}>{t("orga_stats_title")}</span>
            <span>🏑 <strong>{selectedTeams}</strong>/{tournament.maxTeams} {t("orga_stats_teams_label")}</span>
            <span>👤 <strong>{teams.reduce((s, t_) => s + t_.players.length, 0)}</strong> {t("orga_stats_players_label")}</span>
            <span>🏟️ <strong>{tournament.courtsCount}</strong> {t("orga_stats_courts_label")}</span>
            <span>⚡ {tournament.format} · {tournament.gameDurationMin} min</span>
            {matches.length > 0 && (
              <span style={{ padding: "2px 10px", background: matches.filter((m) => m.status === "FINISHED").length === matches.length ? "color-mix(in srgb, var(--teal) 20%, var(--surface))" : "color-mix(in srgb, var(--yellow) 20%, var(--surface))", borderRadius: 6, fontWeight: 700 }}>
                🎯 {matches.filter((m) => m.status === "FINISHED").length}/{matches.length} {t("orga_stats_matches_label")}
              </span>
            )}
            {tournament.accommodationAvailable && (() => {
              let totalAccom = 0;
              for (const team of teams) for (const tp of team.players) if ((tp as any).needsAccommodation) totalAccom++;
              return totalAccom > 0 ? (
                <span style={{ padding: "2px 10px", background: "color-mix(in srgb, var(--teal) 15%, var(--surface))", borderRadius: 6, fontWeight: 700 }}>
                  🛏️ {totalAccom} {t("orga_stats_accommodation_label")}
                </span>
              ) : null;
            })()}
          </div>

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

    </div>
  );
}
