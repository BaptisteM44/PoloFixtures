"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { TournamentEditForm } from "@/components/TournamentEditForm";
import { OverlayLinks } from "@/components/OverlayLinks";
import { UnifiedTeamManager } from "@/components/UnifiedTeamManager";
import { FreeAgentList } from "@/components/FreeAgentList";
import { SponsorManager } from "@/components/SponsorManager";
import { CoOrganizerManager } from "@/components/CoOrganizerManager";
import { RefereeManager } from "@/components/RefereeManager";
import { OrgaTaskBoard } from "@/components/OrgaTaskBoard";
import { OrgaNoteBoard } from "@/components/OrgaNoteBoard";
import { OrgaLinkBoard } from "@/components/OrgaLinkBoard";
import { AnnouncePanel } from "@/components/AnnouncePanel";
import { SelectionManager } from "@/components/SelectionManager";
import { DrawPanel } from "@/components/DrawPanel";
import { AccommodationManager } from "@/components/AccommodationManager";
import { QRCodeSVG } from "qrcode.react";
import { PipelinePlanning } from "@/components/PipelinePlanning";
import { OrgaJourney, type JourneyTab } from "@/components/orga/OrgaJourney";
import { ScreenManager } from "@/components/screen/ScreenManager";
import { centerInScroller } from "@/lib/ui/center-in-scroller";
import { TournamentFormatTab } from "@/components/orga/TournamentFormatTab";


// ─── Types ───────────────────────────────────────────────────────────────────

type OrgaDashboardProps = {
  tournament: any;
  teams: any[];
  freeAgents: any[];
  matches: any[];
  sponsors: any[];
  coOrganizers: any[];
  // Derived flags
  isCreator: boolean;
  isAdmin: boolean;
  isOrgaForThis: boolean;
  // Server actions (passed as props from Server Component)
  updateAction: (formData: FormData) => Promise<{ ok?: boolean; error?: unknown }>;
  addSponsorAction: (...args: any[]) => Promise<any>;
  deleteSponsorAction: (...args: any[]) => Promise<any>;
  deleteFreeAgentAction: (...args: any[]) => Promise<any>;
  renameTeamAction: (...args: any[]) => Promise<any>;
  deleteTeamAction: (...args: any[]) => Promise<any>;
  removePlayerAction: (...args: any[]) => Promise<any>;
  addPlayerAction: (...args: any[]) => Promise<any>;
  launchStageAction?: (order: number) => Promise<{ ok?: boolean; error?: string }>;
  resetStagesAction?: (fromOrder: number) => Promise<{ ok?: boolean; error?: string }>;
  simulateStageAction?: () => Promise<{ ok?: boolean; error?: string }>;
  previewEntriesAction?: (order: number) => Promise<{ entries?: Array<{ teamId: string; name: string; groupKey: string; slot: number }>; groups?: number; error?: string }>;
  setManualGroupsAction?: (order: number, assignments: Record<string, string>) => Promise<{ ok?: boolean; error?: string }>;
  updatePipelineStageAction?: (order: number, patch: { name: string; type: string; config: Record<string, unknown>; entryRules: unknown; startAt: string | null }) => Promise<{ ok?: boolean; error?: string }>;
  launchPipelineGroupAction?: (order: number) => Promise<{ ok?: boolean; error?: string; group?: string }>;
  setPipelineSeedsAction?: (teamIds: string[]) => Promise<{ ok?: boolean; error?: string }>;
  swapPipelineTeamsAction?: (order: number, teamA: string, teamB: string) => Promise<{ ok?: boolean; error?: string }>;
  addPipelineStageAction?: (def: { name: string; type: string; config: Record<string, unknown>; entryRules: unknown }) => Promise<{ ok?: boolean; error?: string }>;
  removePipelineStageAction?: (order: number) => Promise<{ ok?: boolean; error?: string }>;
  movePipelineStageAction?: (order: number, dir: -1 | 1) => Promise<{ ok?: boolean; error?: string }>;
  resetPipelineToRoundAction?: (order: number, round: number, group?: string) => Promise<{ ok?: boolean; error?: string }>;
  reschedulePipelineStageAction?: (order: number) => Promise<{ ok?: boolean; error?: string }>;
  setTournamentPipelineAction?: (stages: unknown) => Promise<{ ok?: boolean; error?: string }>;
  /** Égalités parfaites à départager avant de lancer une étape (onglet Étapes). */
  tieWarnings?: Record<number, Array<{ fromStage: string; group: string | null; rank: number; teamNames: string[] }>>;
  applyPipelinePresetAction?: (presetKey: string) => Promise<{ ok?: boolean; error?: string }>;
  // Orga tab data
  orgaTasks: Array<{ id: string; title: string; description: string | null; deadline: string | null; completed: boolean; priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT"; assignees: Array<{ player: { id: string; name: string } }>; createdBy: { id: string; name: string }; createdAt: string }>;
  orgaNotes: Array<{ id: string; content: string; author: { id: string; name: string }; createdAt: string; updatedAt: string }>;
  orgaLinks: Array<{ id: string; label: string; url: string; addedBy: { id: string; name: string }; createdAt: string }>;
  currentPlayerId: string;
  toggleTeamSelectedAction: (teamId: string, tId: string, selected: boolean) => Promise<any>;
  drawTeamsAction: (tId: string, count: number, preDrawnIds?: string[]) => Promise<any>;
  guaranteeTeamAction: (teamId: string, tId: string, guaranteed: boolean) => Promise<any>;
  guaranteeAllTeamsAction?: (tId: string) => Promise<{ ok?: boolean; error?: string; count?: number }>;
  drawOneTeamAction: (tId: string, candidateIds: string[]) => Promise<any>;
  drawOneWaitlistAction: (tId: string, candidateIds: string[]) => Promise<any>;
  removeFromWaitlistAction: (tId: string, teamId: string) => Promise<any>;
  toggleSelectionLockAction: (tId: string, locked: boolean) => Promise<{ ok?: boolean; error?: string }>;
  setRegistrationClosedAction?: (closed: boolean) => Promise<{ ok?: boolean; error?: string }>;
  createTeamAction: (...args: any[]) => Promise<any>;
  generateRefTokenAction?: () => Promise<{ ok?: boolean; token?: string; error?: string }>;
  revokeRefTokenAction?: () => Promise<{ ok?: boolean; error?: string }>;
  accommodationHosts?: Array<{
    id: string; playerId: string | null; name: string; contact: string | null; notes: string | null;
    player: { id: string; name: string; photoPath: string | null } | null;
    guests: Array<{ id: string; notes: string | null; teamPlayer: { id: string; player: { id: string; name: string; photoPath: string | null }; team: { id: string; name: string } } }>;
  }>;
};

type Tab = "teams" | "config" | "stages" | "dday" | "orga" | "hebergement";

// ─── Tab label helper ─────────────────────────────────────────────────────────

const TAB_KEYS: Record<Tab, string> = {
  stages:       "orga_tab_format_stages",
  teams:        "orga_tab_teams",
  dday:         "orga_tab_dday",
  orga:         "orga_tab_orga",
  config:       "orga_tab_config",
  hebergement:  "orga_tab_hebergement",
};

// ─── Main component ───────────────────────────────────────────────────────────

export function OrgaDashboard({
  tournament,
  teams,
  freeAgents,
  matches,
  sponsors,
  coOrganizers,
  isCreator,
  isAdmin,
  isOrgaForThis,
  updateAction,
  addSponsorAction,
  deleteSponsorAction,
  deleteFreeAgentAction,
  renameTeamAction,
  deleteTeamAction,
  removePlayerAction,
  addPlayerAction,
  launchStageAction,
  resetStagesAction,
  simulateStageAction,
  previewEntriesAction,
  setManualGroupsAction,
  updatePipelineStageAction,
  launchPipelineGroupAction,
  setPipelineSeedsAction,
  swapPipelineTeamsAction,
  addPipelineStageAction,
  removePipelineStageAction,
  movePipelineStageAction,
  resetPipelineToRoundAction,
  reschedulePipelineStageAction,
  setTournamentPipelineAction,
  tieWarnings,
  applyPipelinePresetAction,
  orgaTasks,
  orgaNotes,
  orgaLinks,
  currentPlayerId,
  toggleTeamSelectedAction,
  drawTeamsAction,
  guaranteeTeamAction,
  guaranteeAllTeamsAction,
  drawOneTeamAction,
  drawOneWaitlistAction,
  removeFromWaitlistAction,
  toggleSelectionLockAction,
  setRegistrationClosedAction,
  createTeamAction,
  generateRefTokenAction,
  revokeRefTokenAction,
  accommodationHosts = [],
}: OrgaDashboardProps) {
  const t = useTranslations("tournament");

  const tabStorageKey = `orga_tab_${tournament.id}`;
  // Onglet par défaut : Format (configuration et pilotage des étapes).
  const [activeTab, setActiveTab] = useState<Tab>("stages");
  // Onglet mémorisé : lu APRÈS l'hydratation (le lire dès le 1er rendu faisait
  // différer le HTML serveur et client → erreurs d'hydratation).
  const [tabRestored, setTabRestored] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem(tabStorageKey);
    // Anciens onglets : « planning » (déroulé des anciens formats) → Format ; « orgateam » → Équipe orga.
    if (saved === "planning") setActiveTab("stages");
    else if (saved === "orgateam") setActiveTab("orga");
    else if (saved && saved in TAB_KEYS) setActiveTab(saved as Tab);
    setTabRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tabRestored) localStorage.setItem(tabStorageKey, activeTab);
  }, [activeTab, tabStorageKey, tabRestored]);
  // Mobile : l'onglet actif reste visible dans la barre qui défile.
  useEffect(() => { centerInScroller(document.querySelector(".tabs-bar .tab.active")); }, [activeTab]);

  // Navigation guidée (frise, checklist) : onglet + section à afficher.
  const [pendingAnchor, setPendingAnchor] = useState<string | null>(null);
  const goTo = (tab: JourneyTab, anchor?: string) => {
    setActiveTab(tab as Tab);
    if (anchor) setPendingAnchor(anchor);
    else document.querySelector(".tabs-bar")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  useEffect(() => {
    if (!pendingAnchor) return;
    const el = document.getElementById(pendingAnchor);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      // Les blocs chargés après coup (tâches, notes…) peuvent décaler la section : on recale.
      setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 500);
      el.classList.add("orga-anchor--flash");
      setTimeout(() => el.classList.remove("orga-anchor--flash"), 1600);
    }
    setPendingAnchor(null);
  }, [pendingAnchor, activeTab]);
  // Lien direct vers une section (ex. depuis la page publique : ?tab=config&goto=edit-venues).
  useEffect(() => {
    if (!tabRestored) return;
    const q = new URLSearchParams(window.location.search);
    const tab = q.get("tab") as Tab | null;
    if (tab && tab in TAB_KEYS) goTo(tab as JourneyTab, q.get("goto") ?? undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabRestored]);
  // La checklist (colonne de gauche, hors de ce composant) navigue par événement.
  useEffect(() => {
    const onGoto = (e: Event) => {
      const d = (e as CustomEvent<{ tab: JourneyTab; anchor?: string }>).detail;
      if (d?.tab) goTo(d.tab, d.anchor);
    };
    window.addEventListener("orga:goto", onGoto);
    return () => window.removeEventListener("orga:goto", onGoto);
  });

  const isPipeline = !!(tournament as any).usesPipeline;
  const isLive = tournament.status === "LIVE";

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

  // QR : l'origine n'est connue que côté navigateur (sinon écart serveur/client
  // à l'hydratation). Pas de préfixe de langue : chaque personne qui scanne
  // arrive dans sa langue (redirection selon le navigateur).
  const [origin, setOrigin] = useState("");
  useEffect(() => { setOrigin(window.location.origin); }, []);
  const qrSlug = tournament.slug || tournament.id;
  const qrPublicUrl = `${origin}/tournament/${qrSlug}`;
  const qrRefereeUrl = (i: number) =>
    `${origin}/tournament/${qrSlug}/referee?${tournament.refToken ? `token=${tournament.refToken}&` : ""}court=${encodeURIComponent(`Court ${i + 1}`)}`;

  // KPIs
  // Dès qu'un tri a été fait (une équipe écartée/waitlist), le KPI compte les
  // équipes IN — sans attendre le lancement (26 inscrites, 16 retenues → 16/16).
  const selectionMade = teams.some((t) => t.selected === false);
  const selectedTeams = (isLive || tournament.status === "COMPLETED" || selectionMade) && teams.filter((t) => t.selected !== false).length > 0
    ? teams.filter((t) => t.selected !== false).length
    : teams.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {/* ── Frise : où en est le tournoi, quoi faire maintenant ── */}
      <OrgaJourney
        tournament={tournament as any}
        teams={teams}
        matches={matches as any}
        isPipeline={isPipeline}
        activeTab={activeTab}
        onGo={goTo}
        onComplete={isLive ? handleMarkCompleted : undefined}
        completePending={completePending}
        completeDone={completeDone}
        setRegistrationClosedAction={setRegistrationClosedAction}
      />

      {/* ── Chiffres clés : pastilles qui passent à la ligne proprement ── */}
      <div className="orga-kpis">
        <span className={`status ${tournament.status.toLowerCase()}`}>{t(`status_${tournament.status.toLowerCase()}` as any)}</span>
        <span className="orga-kpi">{t("kpi_teams", { count: selectedTeams, max: tournament.maxTeams })}</span>
        <span className="orga-kpi">{t("kpi_players", { count: teams.reduce((acc, t) => acc + t.players.length, 0) })}</span>
        {freeAgents.length > 0 && <span className="orga-kpi">{t("kpi_free_agents", { count: freeAgents.length })}</span>}
        <span className="orga-kpi">{t("kpi_courts", { count: tournament.courtsCount ?? 1 })}</span>
      </div>

      {/* ── Tab bar ── */}
      <div className="tabs-bar" style={{ marginTop: 0 }}>
        <div className="tabs">
          {/* Ordre du parcours : fiche → format → équipes → jour J → équipe orga. */}
          {(["config", "stages", "teams", "dday", "orga", ...(tournament.accommodationAvailable ? ["hebergement"] : [])] as Tab[]).map((tab) => (
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
          />
          <div id="edit-sponsors" className="orga-anchor" style={{ marginTop: 20 }}>
            <SponsorManager
              tournamentId={tournament.id}
              sponsors={sponsors}
              addAction={addSponsorAction}
              deleteAction={deleteSponsorAction}
            />
          </div>
        </>
      )}

      {/* ── Tab: Équipes ── (inscrits + sélection/tirage/waitlist regroupés) */}
      {activeTab === "teams" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Sélection / Tirage au sort — au-dessus de la liste, c'est l'étape amont */}
          {tournament.format === "ABC Chapeau" ? (() => {
            const soloEntries = (tournament as any).soloEntries ?? [];
            const abcTeams = teams.map((t) => ({ id: t.id, name: t.name }));
            return (
              <DrawPanel
                tournamentId={tournament.id}
                soloEntries={soloEntries}
                teams={abcTeams}
                feePerPlayer={tournament.registrationFeePerTeam ?? 0}
                feeCurrency={tournament.registrationFeeCurrency ?? "EUR"}
              />
            );
          })() : (teams.length > 0 && (
            <div className="panel">
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: 16, marginBottom: 12 }}>{t("orga_selection_title")}</h3>
              <SelectionManager
                teams={teams.map((t) => ({
                  id: t.id, name: t.name, seed: t.seed, city: t.city, country: t.country,
                  selected: t.selected, guaranteed: t.guaranteed, waitlistPosition: t.waitlistPosition,
                }))}
                maxTeams={tournament.maxTeams}
                tournamentId={tournament.id}
                selectionLocked={(tournament as any).selectionLocked ?? false}
                registrationEnd={(tournament as any).registrationEnd ? new Date((tournament as any).registrationEnd).toISOString() : null}
                toggleAction={toggleTeamSelectedAction}
                drawAction={drawTeamsAction}
                guaranteeAction={guaranteeTeamAction}
                guaranteeAllAction={guaranteeAllTeamsAction}
                drawOneAction={drawOneTeamAction}
                drawOneWaitlistAction={drawOneWaitlistAction}
                removeFromWaitlistAction={removeFromWaitlistAction}
                toggleLockAction={toggleSelectionLockAction}
              />
            </div>
          ))}

          <UnifiedTeamManager
            tournamentId={tournament.id}
            teams={teams}
            locked={tournament.locked}
            selectionLocked={(tournament as any).selectionLocked ?? false}
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

      {/* ── Tab: Étapes (pipeline — pilotage du format) ── */}
      {/* ── Tab: Format & étapes (unifié) ── */}
      {activeTab === "stages" && (() => {
        const stages = (tournament as any).stages ?? [];
        // Un format existe déjà dès qu'au moins une étape est définie : dans ce
        // cas le composer se replie (la timeline ci-dessous devient l'écran
        // principal). Il ne reste déplié en grand que pour la 1re configuration.
        const hasFormat = stages.length > 0;
        const canFormat = !!setTournamentPipelineAction && !!applyPipelinePresetAction;
        // Le format reste modifiable tant qu'aucun match n'est joué.
        const canEditFormat = canFormat && !matches.some((m) => m.status === "FINISHED");
        // Ancien système de formats (tournois terminés avant la refonte) : rien à
        // piloter ici, le déroulé reste consultable sur la page publique.
        if (!isPipeline && !canEditFormat) {
          return (
            <div className="panel" style={{ display: "grid", gap: 10 }}>
              <h3 style={{ margin: 0 }}>🗄 {t("legacy_format_title")}</h3>
              <p className="meta" style={{ margin: 0 }}>{t("legacy_format_desc")}</p>
              <Link className="ghost" href={`/tournament/${tournament.slug || tournament.id}`} style={{ width: "fit-content" }}>{t("edit_view_public")}</Link>
            </div>
          );
        }
        return (
          <div id="edit-format" className="orga-anchor" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Composer de format : déplié pour la 1re config, replié ensuite */}
            {canEditFormat && (
              hasFormat ? (
                <details className="panel" style={{ padding: "12px 16px" }}>
                  <summary style={{ fontWeight: 700, fontSize: 14, cursor: "pointer" }}>🎛 {t("format_edit_summary")}</summary>
                  <div style={{ marginTop: 12 }}>
                    <TournamentFormatTab
                      tournamentId={tournament.id}
                      courtsCount={tournament.courtsCount ?? 2}
                      teamCount={selectedTeams > 0 ? selectedTeams : tournament.maxTeams}
                      hasPlayedMatches={false}
                      currentStages={stages.map((s: any) => ({ name: s.name, type: s.type, config: s.config, entryRules: s.entryRules }))}
                      applyPresetAction={applyPipelinePresetAction!}
                      setPipelineAction={setTournamentPipelineAction!}
                    />
                  </div>
                </details>
              ) : (
                <TournamentFormatTab
                  tournamentId={tournament.id}
                  courtsCount={tournament.courtsCount ?? 2}
                  teamCount={selectedTeams > 0 ? selectedTeams : tournament.maxTeams}
                  hasPlayedMatches={false}
                  currentStages={stages.map((s: any) => ({ name: s.name, type: s.type, config: s.config, entryRules: s.entryRules }))}
                  applyPresetAction={applyPipelinePresetAction!}
                  setPipelineAction={setTournamentPipelineAction!}
                />
              )
            )}

            {/* Pilotage des étapes (si le tournoi est déjà pipeline). Sans étape,
                le composer ci-dessus suffit : pas de 2e aperçu ni de pré-seeding vide. */}
            {isPipeline && (hasFormat || !canEditFormat) && (
              <PipelinePlanning
                tieWarnings={tieWarnings}
                tournament={tournament}
                stages={stages}
                launchStageAction={launchStageAction}
                resetStagesAction={resetStagesAction}
                simulateStageAction={tournament.testMode ? simulateStageAction : undefined}
                previewEntriesAction={previewEntriesAction}
                setManualGroupsAction={setManualGroupsAction}
                updateStageAction={updatePipelineStageAction}
                launchGroupAction={launchPipelineGroupAction}
                seedTeams={teams}
                setSeedsAction={setPipelineSeedsAction}
                swapTeamsAction={swapPipelineTeamsAction}
                addStageAction={addPipelineStageAction}
                removeStageAction={removePipelineStageAction}
                moveStageAction={movePipelineStageAction}
                resetToRoundAction={resetPipelineToRoundAction}
                rescheduleStageAction={reschedulePipelineStageAction}
              />
            )}
          </div>
        );
      })()}

      {/* ── Tab: Orga ── */}
      {activeTab === "orga" && (
        <div style={{ display: "grid", gap: 24 }}>
          {/* Co-orgas en premier : c'est l'équipe avant les outils */}
          <div id="edit-coorgs" className="orga-anchor">
            <CoOrganizerManager
              tournamentId={tournament.id}
              coOrganizers={coOrganizers.filter((co) => co.role !== "REF").map((co) => co.player)}
              canManage={isCreator || isAdmin}
            />
          </div>

          {/* Task board */}
          <OrgaTaskBoard
            tasks={orgaTasks}
            tournamentId={tournament.id}
            coOrganizers={[
              ...(tournament.creator ? [{ playerId: tournament.creator.id, playerName: tournament.creator.name }] : []),
              ...coOrganizers.filter((co) => co.role !== "REF").map((co) => ({
                playerId: co.playerId,
                playerName: co.player.name,
              })),
            ]}
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

          {/* Message groupé aux capitaines (ou aux inscrit·es solo en ABC Chapeau) */}
          <AnnouncePanel tournamentId={tournament.id} format={tournament.format} />

        </div>
      )}

      {/* ── Tab: Jour J ── QR codes, overlay, arbitres */}
      {activeTab === "dday" && (
        <div style={{ display: "grid", gap: 20 }}>
          <ScreenManager tournamentId={tournament.id} tournamentSlug={tournament.slug || tournament.id} />
          {/* Overlay stream (OBS) : une section à part, expliquée */}
          <div className="panel" style={{ padding: "16px 18px" }}>
            <h3 style={{ margin: 0 }}>🎬 {t("overlay_section_title")}</h3>
            <p className="meta" style={{ margin: "6px 0 12px" }}>{t("overlay_desc")}</p>
            <OverlayLinks
              tournamentIdOrSlug={tournament.slug || tournament.id}
              courtsCount={tournament.courtsCount ?? 1}
            />
          </div>

          <div className="panel" style={{ padding: "16px 18px" }}>
          <h3 style={{ margin: 0 }}>📱 {t("qr_title")}</h3>
          <p className="meta" style={{ margin: "6px 0 12px" }}>{t("qr_desc")}</p>

          {!tournament.refToken && <p className="orga-qr-warn">⚠️ {t("qr_no_token")}</p>}
          {origin && <div className="orga-qr-grid" style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
            {/* Public tournament QR */}
            <div style={{ textAlign: "center" }}>
              <QRCodeSVG
                value={qrPublicUrl}
                size={140}
                level="M"
              />
              <p style={{ fontSize: 12, fontWeight: 600, marginTop: 6 }}>{t("qr_public")}</p>
            </div>
            {/* Per-court referee QRs */}
            {Array.from({ length: tournament.courtsCount ?? 1 }, (_, i) => (
              <div key={i} style={{ textAlign: "center" }}>
                <QRCodeSVG
                  value={qrRefereeUrl(i)}
                  size={140}
                  level="M"
                />
                <p style={{ fontSize: 12, fontWeight: 600, marginTop: 6 }}>{t("qr_referee_court", { court: i + 1 })}</p>
              </div>
            ))}
          </div>}
          <button
            type="button"
            className="ghost"
            style={{ marginTop: 12, fontSize: 12 }}
            onClick={() => {
              const el = document.createElement("div");
              el.innerHTML = document.querySelector(".panel details[open] .qr-print-area")?.innerHTML ?? "";
              const w = window.open("", "_blank");
              if (w) {
                w.document.write(`<html><head><title>QR Codes - ${tournament.name}</title><style>body{font-family:sans-serif;display:flex;flex-wrap:wrap;gap:32px;padding:24px;justify-content:center}div{text-align:center}svg{display:block;margin:0 auto}p{margin:6px 0 0;font-weight:600;font-size:14px}</style></head><body>`);
                // Re-render QR codes for print
                // Public QR
                w.document.write(`<div><p>${t("qr_public")}</p><p style="font-size:11px;color:#666">${qrPublicUrl}</p></div>`);
                for (let c = 0; c < (tournament.courtsCount ?? 1); c++) {
                  w.document.write(`<div><p>${t("qr_referee_court", { court: c + 1 })}</p><p style="font-size:11px;color:#666">${qrRefereeUrl(c)}</p></div>`);
                }
                w.document.write("</body></html>");
                w.document.close();
                // Copy SVGs into print window
                const svgs = document.querySelectorAll(".orga-qr-grid svg");
                const printDivs = w.document.querySelectorAll("div");
                svgs.forEach((svg, idx) => {
                  if (printDivs[idx]) {
                    const clone = svg.cloneNode(true) as SVGElement;
                    clone.setAttribute("width", "200");
                    clone.setAttribute("height", "200");
                    printDivs[idx].insertBefore(clone, printDivs[idx].firstChild);
                  }
                });
                setTimeout(() => w.print(), 300);
              }
            }}
          >
            🖨 {t("qr_print")}
          </button>
        </div>
          <RefereeManager
              tournamentId={tournament.id}
              referees={coOrganizers.filter((co) => co.role === "REF").map((co) => co.player)}
              canManage={isCreator || isAdmin || isOrgaForThis}
              refToken={tournament.refToken ?? null}
              generateRefTokenAction={generateRefTokenAction}
              revokeRefTokenAction={revokeRefTokenAction}
            />
        </div>
      )}

      {/* ── Tab: Hébergement ── */}
      {activeTab === "hebergement" && tournament.accommodationAvailable && (
        <AccommodationManager
          tournamentId={tournament.id}
          teamPlayers={teams
            // Hébergement : seulement les équipes réellement inscrites (IN),
            // pas la liste d'attente ni les non-sélectionnées.
            .filter((team) => team.selected === true)
            .flatMap((team) =>
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
