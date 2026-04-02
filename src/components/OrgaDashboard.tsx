"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { TournamentEditForm } from "@/components/TournamentEditForm";
import { TeamManager } from "@/components/TeamManager";
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
import { PaymentTracker } from "@/components/PaymentTracker";
import { PoolScheduleEditor } from "@/components/PoolScheduleEditor";
import { TestModeToggle } from "@/components/TestModeToggle";

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
};

type Tab = "config" | "teams" | "planning" | "orgateam";

// ─── Tab label helper ─────────────────────────────────────────────────────────

const TAB_KEYS: Record<Tab, string> = {
  config:   "orga_tab_config",
  teams:    "orga_tab_teams",
  planning: "orga_tab_planning",
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
}: OrgaDashboardProps) {
  const t = useTranslations("tournament");
  const [activeTab, setActiveTab] = useState<Tab>("config");

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
        <div className="panel" style={{ textAlign: "center", padding: 16 }}>
          <span className={`status ${tournament.status.toLowerCase()}`}>{tournament.status}</span>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="tabs-bar" style={{ marginTop: 0 }}>
        <div className="tabs">
          {(["config", "teams", "planning", "orgateam"] as Tab[]).map((tab) => (
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
          <PaymentTracker
            teams={teams}
            feePerTeam={tournament.registrationFeePerTeam ?? 0}
            currency={tournament.registrationFeeCurrency ?? "EUR"}
          />
          <TeamManager
            tournamentId={tournament.id}
            teams={teams}
            locked={tournament.locked}
            format={tournament.format}
            renameAction={renameTeamAction}
            deleteTeamAction={deleteTeamAction}
            removePlayerAction={removePlayerAction}
            addPlayerAction={addPlayerAction}
          />

          <div className="panel">
            <h3 style={{ marginBottom: 12 }}>{t("edit_free_agents_title", { count: freeAgents.length })}</h3>
            {freeAgents.length === 0 ? (
              <p className="meta">{t("edit_free_agents_empty")}</p>
            ) : (
              <FreeAgentList
                agents={freeAgents}
                canDelete
                deleteAction={deleteFreeAgentAction}
                title=""
              />
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Planning ── */}
      {activeTab === "planning" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Pool Schedule Editor — éditer les horaires de chaque poule */}
          {(tournament.poolCount ?? 1) > 1 && (
            <PoolScheduleEditor
              tournamentId={tournament.id}
              gameDurationMin={tournament.gameDurationMin}
              poolAStart={(tournament as any).saturdayPoolAStart}
              poolBStart={(tournament as any).saturdayPoolBStart}
              poolCount={tournament.poolCount ?? 1}
            />
          )}

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
