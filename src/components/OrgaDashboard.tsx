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

// ─── BerlinMixedPlanning ─────────────────────────────────────────────────────

type BerlinTab = "groupes" | "vendredi" | "samedi" | "dimanche" | "brackets";

const BERLIN_TABS: { value: BerlinTab; label: string }[] = [
  { value: "groupes",   label: "Groupes Ven." },
  { value: "vendredi",  label: "Vendredi" },
  { value: "samedi",    label: "Samedi" },
  { value: "dimanche",  label: "Dim. Swiss" },
  { value: "brackets",  label: "Top32 / Bot16" },
];

function BerlinMixedPlanning({ tournament, teams, matches }: { tournament: any; teams: any[]; matches: any[] }) {
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
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Contenu */}
      {berlinTab === "groupes" && (
        <div className="panel">
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 12 }}>
            Répartition Vendredi A / B
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

const TAB_LABELS: Record<Tab, { fr: string; icon: string }> = {
  config:   { fr: "Configuration", icon: "⚙️" },
  teams:    { fr: "Équipes",        icon: "👥" },
  planning: { fr: "Planning",       icon: "📋" },
  orgateam: { fr: "Équipe orga",    icon: "🛠️" },
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
              {TAB_LABELS[tab].icon} {TAB_LABELS[tab].fr}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab: Config ── */}
      {activeTab === "config" && (
        <TournamentEditForm
          tournament={tournament}
          action={updateAction}
          toggleLockAction={toggleLockAction}
        />
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

          {(tournament.poolCount ?? 1) > 1 && (
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

          {/* Explication du format actuel */}
          <div className="panel" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 8 }}>
              Format configuré
            </p>
            {tournament.saturdayFormat === "BERLIN_MIXED" ? (
              <>
                <p style={{ fontSize: 13, margin: 0 }}>
                  <strong>Berlin Mixed Format</strong> — 3 jours
                </p>
                <p style={{ fontSize: 12, margin: "4px 0 0", color: "var(--text-muted)" }}>
                  Vendredi : 2 groupes × {tournament.fridayRounds ?? 5} tours Swiss
                  · Samedi : 2 groupes recomposés × {tournament.saturdayRounds ?? 5} tours Swiss
                  · Dimanche : {tournament.sundayRounds ?? 2} tour(s) Swiss + Top 32 SE + Bottom 16 SE
                </p>
              </>
            ) : (
              <>
                <p style={{ fontSize: 13, margin: 0 }}>
                  <strong>Jour 1 :</strong>{" "}
                  {tournament.saturdayFormat === "SWISS"
                    ? `Swiss (${tournament.swissRounds ?? 5} rondes)`
                    : tournament.saturdayFormat === "SPLIT_POOLS"
                      ? `${tournament.poolCount ?? 2} groupes`
                      : "Poule unique"}
                  {tournament.crossPool ? " → cross-pool" : ""}
                </p>
                <p style={{ fontSize: 13, margin: "4px 0 0" }}>
                  <strong>Jour 2 :</strong>{" "}
                  {tournament.sundayFormat === "DE" ? "Élimination double (DE)" : tournament.sundayFormat === "SE" ? "Élimination simple (SE)" : "Round Robin"}
                  {tournament.thirdPlaceMatch ? " · Petite finale" : ""}
                  {tournament.gfReset ? " · GF reset" : ""}
                </p>
              </>
            )}
            {!tournament.locked && (
              <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8, marginBottom: 0 }}>
                ⚠️ Le format n&apos;est pas encore verrouillé. Va dans <strong>Configuration</strong> pour le verrouiller avant de lancer.
              </p>
            )}
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

          {/* ── Berlin Mixed Format planning ── */}
          {tournament.saturdayFormat === "BERLIN_MIXED" && isLive && (
            <BerlinMixedPlanning
              tournament={tournament}
              teams={teams.filter((t) => t.selected !== false)}
              matches={matches}
            />
          )}

          {/* ── Planning standard (non-Berlin) ── */}
          {tournament.saturdayFormat !== "BERLIN_MIXED" && (
            <>
              {/* Jour 1 — état des matchs */}
              {hasAnyMatches && (
                <div className="panel">
                  <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 10 }}>
                    Jour 1 — {tournament.saturdayFormat === "SWISS" ? "Swiss" : "Poules"}
                  </p>
                  {poolMatches.length === 0 ? (
                    <p className="meta">Matchs pas encore générés.</p>
                  ) : (
                    <p style={{ fontSize: 13, margin: 0, color: poolMatchesFinished ? "var(--teal)" : "var(--text)" }}>
                      {poolMatches.filter((m) => m.status === "FINISHED").length} / {poolMatches.length} matchs terminés
                      {poolMatchesFinished ? " ✓" : ""}
                    </p>
                  )}
                </div>
              )}

              {/* Cross-pool (format Barcelona) */}
              {tournament.crossPool && isLive && (
                <div className="panel">
                  <CrossPoolActions
                    tournamentId={tournament.id}
                    hasCrossPool={true}
                    poolMatchesFinished={poolMatchesFinished}
                    crossPoolGenerated={crossPoolGenerated}
                    crossPoolFinished={crossPoolFinished}
                    seGenerated={seGenerated}
                    seRound1Finished={seRound1Finished}
                    deGenerated={deGenerated}
                  />
                </div>
              )}

              {/* Jour 2 — bracket standard */}
              {!tournament.crossPool && isLive && poolMatchesFinished && (
                <div className="panel">
                  <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 12 }}>
                    Jour 2 — {tournament.sundayFormat === "DE" ? "Élimination double" : tournament.sundayFormat === "SE" ? "Élimination simple" : "Round Robin"}
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
              <p style={{ fontSize: 13 }}>Inscris et sélectionne des équipes dans l&apos;onglet <strong>Équipes</strong> pour pouvoir lancer le tournoi.</p>
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
