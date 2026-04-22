import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { updateTournamentAction, importTeamsAction, toggleLockAction, addSponsorAction, deleteSponsorAction, deleteFreeAgentAction, renameTeamAction, deleteTeamAction, removePlayerFromTeamAction, addPlayerToTeamAction, resubmitTournamentAction, launchTournamentAction, resetTournamentAction, resetMatchesAction, toggleTeamSelectedAction, drawTeamsAction, toggleTeamGuaranteedAction, drawOneTeamAction, drawOneWaitlistAction, removeFromWaitlistAction, createTeamAction, launchGrazPoolAction, launchGrazSundayRRAction, launchGrazRegroupAction, launchGrazSEAction, resetGrazPhaseAction } from "./actions";
import { TournamentChecklist } from "@/components/TournamentChecklist";
import { OrgaDashboard } from "@/components/OrgaDashboard";
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
      pools: { include: { teams: { include: { team: { select: { id: true, name: true, seed: true } } } } } },
      matches: { select: { id: true, phase: true, roundIndex: true, status: true, winnerTeamId: true, poolId: true, poolSessionIndex: true, teamAId: true, teamBId: true, dayIndex: true } },
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

  const currentPlayerId = (session?.user as any)?.playerId ?? null;

  const [orgaTasks, orgaNotes, orgaLinks, accommodationHosts] = await Promise.all([
    prisma.orgaTask.findMany({
      where: { tournamentId: tournament.id },
      include: { assignees: { include: { player: { select: { id: true, name: true } } } }, createdBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.orgaNote.findMany({
      where: { tournamentId: tournament.id },
      include: { author: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.orgaLink.findMany({
      where: { tournamentId: tournament.id },
      include: { addedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    (t_ as any).accommodationAvailable
      ? prisma.accommodationHost.findMany({
          where: { tournamentId: tournament.id },
          include: {
            player: { select: { id: true, name: true, photoPath: true } },
            guests: {
              include: {
                teamPlayer: {
                  include: {
                    player: { select: { id: true, name: true, photoPath: true } },
                    team: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const toggleTeamSelected = async (teamId: string, tId: string, selected: boolean) => {
    "use server";
    return await toggleTeamSelectedAction(teamId, tId, selected);
  };
  const drawTeams = async (tId: string, count: number, preDrawnIds?: string[]) => {
    "use server";
    return await drawTeamsAction(tId, count, preDrawnIds);
  };
  const guaranteeTeam = async (teamId: string, tId: string, guaranteed: boolean) => {
    "use server";
    return await toggleTeamGuaranteedAction(teamId, tId, guaranteed);
  };
  const drawOneTeam = async (tId: string, candidateIds: string[]) => {
    "use server";
    return await drawOneTeamAction(tId, candidateIds);
  };
  const drawOneWaitlist = async (tId: string, candidateIds: string[]) => {
    "use server";
    return await drawOneWaitlistAction(tId, candidateIds);
  };
  const removeFromWaitlist = async (tId: string, teamId: string) => {
    "use server";
    return await removeFromWaitlistAction(tId, teamId);
  };
  const createTeam = async (...args: Parameters<typeof createTeamAction>) => {
    "use server";
    return await createTeamAction(...args);
  };

  const submissionStatus = (t_.submissionStatus ?? (t_.approved ? "APPROVED" : "PENDING")) as "PENDING" | "APPROVED" | "REJECTED";
  const t = await getTranslations("tournament");

  return (
    <div className="page page--full-width">
      <CreatedToast />
      <div className="edit-header">
        <div>
          <h1 style={{ marginBottom: 4 }}>{t("edit_dashboard_title")}</h1>
          <p className="meta">{t_.name} · {t_.city}, {t_.country}</p>
        </div>
        <Link href={`/tournament/${t_.slug}`} className="ghost">{t("edit_view_public")}</Link>
      </div>

      <div className="edit-layout">
        {/* Sidebar checklist — colonne gauche desktop, collapsible mobile */}
        <aside className="edit-sidebar">
          <details className="edit-checklist-wrapper" open>
            <summary>Checklist</summary>
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
              venueName: t_.venueName,
              venueAddress: t_.venueAddress,
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
          </details>
        </aside>

        {/* Main content — colonne droite */}
        <div className="edit-main">
      <OrgaDashboard
            tournament={{
              id: t_.id,
              name: t_.name,
              slug: t_.slug,
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
              poolCount: t_.poolCount,
              crossPool: t_.crossPool,
              swissRounds: t_.swissRounds,
              bracketSize: t_.bracketSize,
              sundayFormat: t_.sundayFormat,
              thirdPlaceMatch: (t_ as any).thirdPlaceMatch ?? false,
              gfReset: (t_ as any).gfReset ?? false,
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
              scoringSystem: (t_ as any).scoringSystem,
              rushRegistration: (t_ as any).rushRegistration,
              maxSoloPlayers: (t_ as any).maxSoloPlayers,
              testMode: (t_ as any).testMode ?? false,
              hidden: (t_ as any).hidden ?? false,
              saturdayPoolAStart: t_.saturdayPoolAStart?.toISOString() ?? null,
              saturdayPoolBStart: t_.saturdayPoolBStart?.toISOString() ?? null,
            }}
            teams={t_.teams}
            freeAgents={t_.freeAgents}
            pools={t_.pools}
            matches={t_.matches}
            sponsors={t_.sponsors}
            coOrganizers={t_.coOrganizers}
            isCreator={isCreator}
            isAdmin={isAdmin}
            isOrgaForThis={isOrgaForThis}
            updateAction={updateAction}
            toggleLockAction={toggleLock}
            importAction={importAction}
            addSponsorAction={addSponsor}
            deleteSponsorAction={deleteSponsor}
            deleteFreeAgentAction={deleteFreeAgent}
            renameTeamAction={renameTeam}
            deleteTeamAction={deleteTeam}
            removePlayerAction={removePlayer}
            addPlayerAction={addPlayer}
            launchAction={async () => {
              "use server";
              await launchTournamentAction(t_.id);
            }}
            resetAction={async () => {
              "use server";
              await resetTournamentAction(t_.id);
            }}
            resetMatchesAction={async () => {
              "use server";
              await resetMatchesAction(t_.id);
            }}
            launchGrazPoolBAction={async () => {
              "use server";
              return await launchGrazPoolAction(t_.id, "Pool B");
            }}
            launchGrazSundayRRAction={async () => {
              "use server";
              return await launchGrazSundayRRAction(t_.id);
            }}
            launchGrazRegroupAction={async () => {
              "use server";
              return await launchGrazRegroupAction(t_.id);
            }}
            launchGrazSEAction={async () => {
              "use server";
              return await launchGrazSEAction(t_.id);
            }}
            resetGrazPhaseAction={async (phase) => {
              "use server";
              return await resetGrazPhaseAction(t_.id, phase);
            }}
            orgaTasks={orgaTasks.map((t) => ({ ...t, priority: t.priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT", deadline: t.deadline?.toISOString() ?? null, createdAt: t.createdAt.toISOString() }))}
            orgaNotes={orgaNotes.map((n) => ({ ...n, createdAt: n.createdAt.toISOString(), updatedAt: n.updatedAt.toISOString() }))}
            orgaLinks={orgaLinks.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() }))}
            currentPlayerId={currentPlayerId ?? ""}
            toggleTeamSelectedAction={toggleTeamSelected}
            drawTeamsAction={drawTeams}
            guaranteeTeamAction={guaranteeTeam}
            drawOneTeamAction={drawOneTeam}
            drawOneWaitlistAction={drawOneWaitlist}
            removeFromWaitlistAction={removeFromWaitlist}
            createTeamAction={createTeam}
            accommodationHosts={accommodationHosts as any}
          />
        </div>
      </div>
    </div>
  );
}
