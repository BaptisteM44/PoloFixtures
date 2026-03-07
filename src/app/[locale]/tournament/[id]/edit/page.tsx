import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { updateTournamentAction, importTeamsAction, toggleLockAction, addSponsorAction, deleteSponsorAction, deleteFreeAgentAction, renameTeamAction, deleteTeamAction, removePlayerFromTeamAction, addPlayerToTeamAction, resubmitTournamentAction } from "./actions";
import { TournamentEditForm } from "@/components/TournamentEditForm";
import { TournamentChecklist } from "@/components/TournamentChecklist";
import { SponsorManager } from "@/components/SponsorManager";
import { FreeAgentList } from "@/components/FreeAgentList";
import { TeamManager } from "@/components/TeamManager";
import { CoOrganizerManager } from "@/components/CoOrganizerManager";
import { RefereeManager } from "@/components/RefereeManager";
import { hasAtLeastRole } from "@/lib/rbac";
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";

export default async function TournamentEditPage({ params }: { params: { id: string } }) {
  const session = await auth();
  const tournament = await prisma.tournament.findUnique({
    where: { id: params.id },
    include: {
      teams: { include: { players: { include: { player: true } } } },
      freeAgents: true,
      creator: true,
      matches: { select: { id: true, phase: true, roundIndex: true } },
      sponsors: { orderBy: { name: "asc" } },
      coOrganizers: { include: { player: { select: { id: true, name: true, country: true, city: true, photoPath: true } } }, orderBy: { addedAt: "asc" } }
    }
  });

  if (!tournament) {
    const t = await getTranslations("tournament");
    return <div>{t("not_found")}</div>;
  }

  // Accès : ADMIN (toujours), ORGA pour CE tournoi, créateur, ou co-organisateur
  const isAdmin = !!(session?.user?.role && hasAtLeastRole(session.user.role, "ADMIN"));
  const isOrgaForThis = session?.user?.role === "ORGA" && session?.user?.tournamentId === tournament.id;
  const isCreator = !!(session?.user?.playerId && session?.user?.playerId === tournament.creatorId);
  const isCoOrga = !!(session?.user?.playerId && tournament.coOrganizers.some((co) => co.playerId === session.user.playerId));

  if (!isAdmin && !isOrgaForThis && !isCreator && !isCoOrga) {
    const t = await getTranslations("tournament");
    return (
      <div className="page">
        <div className="panel" style={{ textAlign: "center", padding: 48 }}>
          <h2>{t("edit_access_denied")}</h2>
          <p style={{ color: "var(--text-muted)" }}>{t("edit_access_denied_desc")}</p>
          <Link href={`/tournament/${tournament.id}`} className="primary" style={{ marginTop: 16 }}>{t("edit_view_tournament")}</Link>
        </div>
      </div>
    );
  }

  const updateAction = async (formData: FormData) => {
    "use server";
    return await updateTournamentAction(formData);
  };
  const importAction = async (formData: FormData) => {
    "use server";
    const raw = formData.get("teams")?.toString() ?? "";
    await importTeamsAction(tournament.id, raw);
  };
  const toggleLock = async (id: string, confirmReset?: boolean) => {
    "use server";
    return await toggleLockAction(id, confirmReset);
  };
  const addSponsor = async (
    tId: string, name: string, url: string | null, logoPath: string | null
  ) => {
    "use server";
    return await addSponsorAction(tId, name, url, logoPath);
  };
  const deleteSponsor = async (sponsorId: string, tId: string) => {
    "use server";
    return await deleteSponsorAction(sponsorId, tId);
  };
  const deleteFreeAgent = async (id: string) => {
    "use server";
    return await deleteFreeAgentAction(id, tournament.id);
  };
  const renameTeam = async (teamId: string, name: string, tId: string) => {
    "use server";
    return await renameTeamAction(teamId, name, tId);
  };
  const deleteTeam = async (teamId: string, tId: string) => {
    "use server";
    return await deleteTeamAction(teamId, tId);
  };
  const removePlayer = async (teamPlayerId: string, tId: string) => {
    "use server";
    return await removePlayerFromTeamAction(teamPlayerId, tId);
  };
  const addPlayer = async (teamId: string, tId: string, playerData: Parameters<typeof addPlayerToTeamAction>[2]) => {
    "use server";
    return await addPlayerToTeamAction(teamId, tId, playerData);
  };

  const submissionStatus = (tournament.submissionStatus ?? (tournament.approved ? "APPROVED" : "PENDING")) as "PENDING" | "APPROVED" | "REJECTED";
  const t = await getTranslations("tournament");

  return (
    <div className="page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>{t("edit_dashboard_title")}</h1>
          <p className="meta">{tournament.name} · {tournament.city}, {tournament.country}</p>
        </div>
        <Link href={`/tournament/${tournament.id}`} className="ghost">{t("edit_view_public")}</Link>
      </div>

      {/* 2-column layout: checklist left, main content right */}
      <div className="edit-page-layout">

        {/* Left: checklist sticky */}
        <div className="edit-page-sidebar" style={{ position: "sticky", top: 80 }}>
          <TournamentChecklist t={{
            name: tournament.name,
            country: tournament.country,
            city: tournament.city,
            dateStart: tournament.dateStart.toISOString(),
            dateEnd: tournament.dateEnd.toISOString(),
            contactEmail: tournament.contactEmail,
            registrationStart: tournament.registrationStart?.toISOString() ?? null,
            registrationEnd: tournament.registrationEnd?.toISOString() ?? null,
            registrationFeePerTeam: tournament.registrationFeePerTeam,
            fridayWelcomeName: tournament.fridayWelcomeName,
            saturdayEventName: tournament.saturdayEventName,
            saturdayEventAddress: tournament.saturdayEventAddress,
            bannerPath: tournament.bannerPath,
            maxTeams: tournament.maxTeams,
            courtsCount: tournament.courtsCount,
            accommodationAvailable: tournament.accommodationAvailable,
            submissionStatus,
            rejectionReason: tournament.rejectionReason,
            coOrganizersCount: tournament.coOrganizers.length,
            sponsorsCount: tournament.sponsors.length,
          }} />

          {/* Resubmit button if REJECTED */}
          {submissionStatus === "REJECTED" && (
            <form action={async () => {
              "use server";
              await resubmitTournamentAction(params.id);
            }}>
              <button className="primary" type="submit" style={{ width: "100%", marginTop: 12, justifyContent: "center" }}>
                {t("edit_resubmit")}
              </button>
            </form>
          )}
        </div>

        {/* Right: main content */}
        <div style={{ display: "grid", gap: 24 }}>

          {/* KPI bar */}
          <div className="kpi-grid">
            <div className="panel" style={{ textAlign: "center", padding: 16 }}>
              <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "var(--font-display)" }}>{tournament.teams.length}<span style={{ fontSize: 14, color: "var(--text-muted)", marginLeft: 2 }}>/{tournament.maxTeams}</span></div>
              <p className="meta">{t("edit_kpi_teams")}</p>
            </div>
            <div className="panel" style={{ textAlign: "center", padding: 16 }}>
              <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "var(--font-display)" }}>{tournament.freeAgents.length}</div>
              <p className="meta">{t("edit_kpi_free_agents")}</p>
            </div>
            <div className="panel" style={{ textAlign: "center", padding: 16 }}>
              <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "var(--font-display)" }}>{tournament.teams.reduce((acc, t) => acc + t.players.length, 0)}</div>
              <p className="meta">{t("edit_kpi_players")}</p>
            </div>
            <div className="panel" style={{ textAlign: "center", padding: 16 }}>
              <span className={`status ${tournament.status.toLowerCase()}`}>{tournament.status}</span>
            </div>
          </div>

      {/* Edit form — toujours visible, en haut */}
      <TournamentEditForm
        tournament={{
          id: tournament.id,
          name: tournament.name,
          continentCode: tournament.continentCode,
          region: tournament.region,
          country: tournament.country,
          city: tournament.city,
          dateStart: tournament.dateStart.toISOString(),
          dateEnd: tournament.dateEnd.toISOString(),
          format: tournament.format,
          gameDurationMin: tournament.gameDurationMin,
          maxTeams: tournament.maxTeams,
          courtsCount: tournament.courtsCount,
          registrationFeePerTeam: tournament.registrationFeePerTeam,
          registrationFeeCurrency: tournament.registrationFeeCurrency,
          contactEmail: tournament.contactEmail,
          registrationStart: tournament.registrationStart?.toISOString() ?? null,
          registrationEnd: tournament.registrationEnd?.toISOString() ?? null,
          venueName: tournament.venueName,
          venueAddress: tournament.venueAddress,
          venueMapsUrl: tournament.venueMapsUrl,
          fridayWelcomeName: tournament.fridayWelcomeName,
          fridayWelcomeAddress: tournament.fridayWelcomeAddress,
          fridayWelcomeMapsUrl: tournament.fridayWelcomeMapsUrl,
          saturdayEventName: tournament.saturdayEventName,
          saturdayEventAddress: tournament.saturdayEventAddress,
          saturdayEventMapsUrl: tournament.saturdayEventMapsUrl,
          saturdayEveningName: tournament.saturdayEveningName,
          saturdayEveningAddress: tournament.saturdayEveningAddress,
          saturdayEveningMapsUrl: tournament.saturdayEveningMapsUrl,
          otherNotes: tournament.otherNotes,
          links: tournament.links,
          bannerPath: tournament.bannerPath,
          streamYoutubeUrl: tournament.streamYoutubeUrl,
          chatMode: tournament.chatMode,
          saturdayFormat: tournament.saturdayFormat,
          sundayFormat: tournament.sundayFormat,
          status: tournament.status,
          locked: tournament.locked,
          accommodationAvailable: tournament.accommodationAvailable,
          accommodationType: tournament.accommodationType,
          accommodationCapacity: tournament.accommodationCapacity,
          meals: tournament.meals as any,
          kitList: tournament.kitList,
          additionalInfo: tournament.additionalInfo,
          faq: tournament.faq as any,
          telegramUrl: (tournament as { telegramUrl?: string | null }).telegramUrl,
        }}
        action={updateAction}
        toggleLockAction={toggleLock}
      />

      {/* Sponsors */}
      <SponsorManager
        tournamentId={tournament.id}
        sponsors={tournament.sponsors}
        addAction={addSponsor}
        deleteAction={deleteSponsor}
      />

      {/* Co-organisateurs */}
      <CoOrganizerManager
        tournamentId={tournament.id}
        coOrganizers={tournament.coOrganizers.filter((co) => (co as { role?: string }).role !== "REF").map((co) => co.player)}
        canManage={isCreator || isAdmin}
      />

      {/* Arbitres assignés */}
      <RefereeManager
        tournamentId={tournament.id}
        referees={tournament.coOrganizers.filter((co) => (co as { role?: string }).role === "REF").map((co) => co.player)}
        canManage={isCreator || isAdmin || isOrgaForThis}
      />

      {/* Free agents list */}
      <div className="panel">
        <h3 style={{ marginBottom: 12 }}>{t("edit_free_agents_title", { count: tournament.freeAgents.length })}</h3>
        {tournament.freeAgents.length === 0 ? (
          <p className="meta">{t("edit_free_agents_empty")}</p>
        ) : (
          <FreeAgentList
            agents={tournament.freeAgents}
            canDelete
            deleteAction={deleteFreeAgent}
            title=""
          />
        )}
      </div>

      {/* Teams list */}
      <TeamManager
        teams={tournament.teams.map((t) => ({
          id: t.id,
          name: t.name,
          seed: t.seed,
          city: t.city,
          country: t.country,
          players: t.players.map((tp) => ({
            id: tp.id,
            player: { id: tp.player.id, name: tp.player.name, country: tp.player.country },
          })),
        }))}
        locked={tournament.locked}
        format={tournament.format}
        renameAction={renameTeam}
        deleteTeamAction={deleteTeam}
        removePlayerAction={removePlayer}
        addPlayerAction={addPlayer}
        tournamentId={tournament.id}
      />

        </div>{/* end right column */}
      </div>{/* end 2-col grid */}
    </div>
  );
}
