import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { updateTournamentAction, importTeamsAction, toggleLockAction, addSponsorAction, deleteSponsorAction, deleteFreeAgentAction, renameTeamAction, deleteTeamAction, removePlayerFromTeamAction, addPlayerToTeamAction, resubmitTournamentAction, launchTournamentAction } from "./actions";
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
import { CreatedToast } from "@/components/CreatedToast";

export default async function TournamentEditPage({ params }: { params: { id: string } }) {
  const session = await auth();
  const tournament = await prisma.tournament.findFirst({
    where: { OR: [{ id: params.id }, { slug: params.id }] },
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

  const t_ = tournament as any;
  // Accès : ADMIN (toujours), ORGA pour CE tournoi, créateur, ou co-organisateur
  const isAdmin = !!(session?.user?.role && hasAtLeastRole(session.user.role, "ADMIN"));
  const isOrgaForThis = session?.user?.role === "ORGA" && session?.user?.tournamentId === t_.id;
  const isCreator = !!(session?.user?.playerId && session?.user?.playerId === t_.creatorId);
  const isCoOrga = !!(session?.user?.playerId && t_.coOrganizers.some((co: any) => co.playerId === session.user.playerId));

  if (!isAdmin && !isOrgaForThis && !isCreator && !isCoOrga) {
    const t = await getTranslations("tournament");
    return (
      <div className="page">
        <div className="panel" style={{ textAlign: "center", padding: 48 }}>
          <h2>{t("edit_access_denied")}</h2>
          <p style={{ color: "var(--text-muted)" }}>{t("edit_access_denied_desc")}</p>
          <Link href={`/tournament/${tournament.slug}`} className="primary" style={{ marginTop: 16 }}>{t("edit_view_tournament")}</Link>
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

  const submissionStatus = (t_.submissionStatus ?? (t_.approved ? "APPROVED" : "PENDING")) as "PENDING" | "APPROVED" | "REJECTED";
  const t = await getTranslations("tournament");

  return (
    <div className="page">
      <CreatedToast />
      <div className="edit-header">
        <div>
          <h1 style={{ marginBottom: 4 }}>{t("edit_dashboard_title")}</h1>
          <p className="meta">{t_.name} · {t_.city}, {t_.country}</p>
        </div>
        <Link href={`/tournament/${t_.slug}`} className="ghost">{t("edit_view_public")}</Link>
      </div>

      {/* 2-column layout: checklist left, main content right */}
      <div className="edit-page-layout">

        {/* Left: checklist sticky */}
        <div className="edit-page-sidebar" style={{ position: "sticky", top: 80 }}>
          <TournamentChecklist t={{
            name: t_.name,
            country: t_.country,
            city: t_.city,
            dateStart: t_.dateStart.toISOString(),
            dateEnd: t_.dateEnd.toISOString(),
            contactEmail: t_.contactEmail,
            registrationStart: t_.registrationStart?.toISOString() ?? null,
            registrationEnd: t_.registrationEnd?.toISOString() ?? null,
            registrationFeePerTeam: t_.registrationFeePerTeam,
            fridayWelcomeName: t_.fridayWelcomeName,
            saturdayEventName: t_.saturdayEventName,
            saturdayEventAddress: t_.saturdayEventAddress,
            bannerPath: t_.bannerPath,
            maxTeams: t_.maxTeams,
            courtsCount: t_.courtsCount,
            accommodationAvailable: t_.accommodationAvailable,
            submissionStatus,
            rejectionReason: t_.rejectionReason,
            coOrganizersCount: t_.coOrganizers.length,
            sponsorsCount: t_.sponsors.length,
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

          {/* Launch tournament button */}
          {(t_.status === "UPCOMING" || (t_.status === "LIVE" && t_.matches.length === 0)) && t_.teams.some((t: any) => t.selected === true) && (
            <form action={async () => {
              "use server";
              const res = await launchTournamentAction(t_.id);
              if (res.error) throw new Error(res.error);
            }}>
              <button className="primary" type="submit" style={{ width: "100%", padding: "16px 24px", fontSize: 16, fontFamily: "var(--font-display)", fontWeight: 700, justifyContent: "center", display: "flex", alignItems: "center", gap: 10 }}>
                {t("edit_launch_tournament")}
              </button>
            </form>
          )}

          {/* KPI bar */}
          <div className="kpi-grid">
            <div className="panel" style={{ textAlign: "center", padding: 16 }}>
              <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "var(--font-display)" }}>{(t_.status === "LIVE" || t_.status === "COMPLETED") && t_.teams.filter((t: any) => t.selected !== false).length > 0 ? t_.teams.filter((t: any) => t.selected !== false).length : t_.teams.length}<span style={{ fontSize: 14, color: "var(--text-muted)", marginLeft: 2 }}>/{t_.maxTeams}</span></div>
              <p className="meta">{t("edit_kpi_teams")}</p>
            </div>
            <div className="panel" style={{ textAlign: "center", padding: 16 }}>
              <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "var(--font-display)" }}>{t_.freeAgents.length}</div>
              <p className="meta">{t("edit_kpi_free_agents")}</p>
            </div>
            <div className="panel" style={{ textAlign: "center", padding: 16 }}>
              <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "var(--font-display)" }}>{t_.teams.reduce((acc: number, t: any) => acc + t.players.length, 0)}</div>
              <p className="meta">{t("edit_kpi_players")}</p>
            </div>
            <div className="panel" style={{ textAlign: "center", padding: 16 }}>
              <span className={`status ${t_.status.toLowerCase()}`}>{t_.status}</span>
            </div>
          </div>

      {/* Edit form — toujours visible, en haut */}
      <TournamentEditForm
        tournament={{
          id: t_.id,
          name: t_.name,
          continentCode: t_.continentCode,
          region: t_.region,
          country: t_.country,
          city: t_.city,
          dateStart: t_.dateStart.toISOString(),
          dateEnd: t_.dateEnd.toISOString(),
          format: t_.format,
          gameDurationMin: t_.gameDurationMin,
          maxTeams: t_.maxTeams,
          courtsCount: t_.courtsCount,
          registrationFeePerTeam: t_.registrationFeePerTeam,
          registrationFeeCurrency: t_.registrationFeeCurrency,
          contactEmail: t_.contactEmail,
          registrationStart: t_.registrationStart?.toISOString() ?? null,
          registrationEnd: t_.registrationEnd?.toISOString() ?? null,
          venueName: t_.venueName,
          venueAddress: t_.venueAddress,
          venueMapsUrl: t_.venueMapsUrl,
          fridayWelcomeName: t_.fridayWelcomeName,
          fridayWelcomeAddress: t_.fridayWelcomeAddress,
          fridayWelcomeMapsUrl: t_.fridayWelcomeMapsUrl,
          saturdayEventName: t_.saturdayEventName,
          saturdayEventAddress: t_.saturdayEventAddress,
          saturdayEventMapsUrl: t_.saturdayEventMapsUrl,
          saturdayEveningName: t_.saturdayEveningName,
          saturdayEveningAddress: t_.saturdayEveningAddress,
          saturdayEveningMapsUrl: t_.saturdayEveningMapsUrl,
          otherNotes: t_.otherNotes,
          links: t_.links,
          bannerPath: t_.bannerPath,
          streamYoutubeUrl: t_.streamYoutubeUrl,
          chatMode: t_.chatMode,
          saturdayFormat: t_.saturdayFormat,
          swissRounds: t_.swissRounds,
          bracketSize: t_.bracketSize,
          sundayFormat: t_.sundayFormat,
          status: t_.status,
          locked: t_.locked,
          accommodationAvailable: t_.accommodationAvailable,
          accommodationType: t_.accommodationType,
          accommodationCapacity: t_.accommodationCapacity,
          meals: t_.meals,
          kitList: t_.kitList,
          additionalInfo: t_.additionalInfo,
          faq: t_.faq,
          telegramUrl: t_.telegramUrl,
        }}
        action={updateAction}
        toggleLockAction={toggleLock}
      />

      {/* Sponsors */}
      <SponsorManager
        tournamentId={t_.id}
        sponsors={t_.sponsors}
        addAction={addSponsor}
        deleteAction={deleteSponsor}
      />

      {/* Co-organisateurs */}
      <CoOrganizerManager
        tournamentId={t_.id}
        coOrganizers={t_.coOrganizers.filter((co: any) => co.role !== "REF").map((co: any) => co.player)}
        canManage={isCreator || isAdmin}
      />

      {/* Arbitres assignés */}
      <RefereeManager
        tournamentId={t_.id}
        referees={t_.coOrganizers.filter((co: any) => co.role === "REF").map((co: any) => co.player)}
        canManage={isCreator || isAdmin || isOrgaForThis}
      />

      {/* Free agents list */}
      <div className="panel">
        <h3 style={{ marginBottom: 12 }}>{t("edit_free_agents_title", { count: t_.freeAgents.length })}</h3>
        {t_.freeAgents.length === 0 ? (
          <p className="meta">{t("edit_free_agents_empty")}</p>
        ) : (
          <FreeAgentList
            agents={t_.freeAgents}
            canDelete
            deleteAction={deleteFreeAgent}
            title=""
          />
        )}
      </div>


        </div>{/* end right column */}
      </div>{/* end 2-col grid */}
    </div>
  );
}
