import { prisma } from "@/lib/db";
import { tournamentTimezone } from "@/lib/timezone";
import { formatTournamentDates } from "@/lib/podium-share";
import { canonicalCountryName } from "@/lib/country-utils";
import { auth } from "@/lib/auth";
import { updateTournamentAction, addSponsorAction, deleteSponsorAction, deleteFreeAgentAction, renameTeamAction, deleteTeamAction, removePlayerFromTeamAction, addPlayerToTeamAction, resubmitTournamentAction, toggleTeamSelectedAction, drawTeamsAction, toggleTeamGuaranteedAction, guaranteeAllTeamsAction, drawOneTeamAction, drawOneWaitlistAction, removeFromWaitlistAction, toggleSelectionLockAction, createTeamAction, generateRefTokenAction, revokeRefTokenAction, launchPipelineStageAction, resetPipelineStagesAction, simulatePipelineStageAction, previewPipelineEntriesAction, setPipelineManualGroupsAction, updatePipelineStageAction, addPipelineStageAction, removePipelineStageAction, movePipelineStageAction, launchPipelineGroupAction, setPipelineSeedsAction, swapPipelineTeamsAction, resetPipelineToRoundAction, reschedulePipelineStageAction, setTournamentPipelineAction, applyPipelinePresetAction, setRegistrationClosedAction } from "./actions";
import { TournamentChecklist } from "@/components/TournamentChecklist";
import { ChecklistDetails } from "@/components/ChecklistDetails";
import { OrgaDashboard } from "@/components/OrgaDashboard";
import { pipelineTieWarnings } from "@/engine/pipeline-server";
import { hasAtLeastRole } from "@/lib/rbac";
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { CreatedToast } from "@/components/CreatedToast";

export default async function TournamentEditPage({ params }: { params: { id: string; locale: string } }) {
  const session = await auth();
  const tournament = await prisma.tournament.findFirst({
    where: { OR: [{ id: params.id }, { slug: params.id }] },
    include: {
      // Email du compte : visible par l'orga seulement (page réservée), pour le copier.
      teams: { include: { players: { include: { player: { include: { account: { select: { id: true, email: true } } } } } } } },
      freeAgents: true,
      creator: true,
      pools: { include: { teams: { include: { team: { select: { id: true, name: true, seed: true } } } } } },
      matches: { select: { id: true, phase: true, roundIndex: true, positionInRound: true, status: true, winnerTeamId: true, poolId: true, poolSessionIndex: true, teamAId: true, teamBId: true, dayIndex: true, stageId: true, groupKey: true, bracketSide: true, startAt: true, courtName: true } },
      stages: { orderBy: { order: "asc" }, include: { entries: true, matches: { select: { id: true, status: true, groupKey: true, roundIndex: true } } } },
      sponsors: { orderBy: { name: "asc" } },
      coOrganizers: { include: { player: { select: { id: true, name: true, country: true, city: true, photoPath: true } } }, orderBy: { addedAt: "asc" } },
      soloEntries: { include: { player: { select: { id: true, name: true, country: true, city: true, photoPath: true, badges: true, pinnedBadges: true, startYear: true, hand: true, gender: true, showGender: true, slug: true, account: { select: { email: true } } } } }, orderBy: { createdAt: "asc" } },
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
          <Link href={`/tournament/${tournament.slug ?? tournament.id}`} className="primary" style={{ marginTop: 16 }}>{t("edit_view_tournament")}</Link>
        </div>
      </div>
    );
  }

  const updateAction = async (formData: FormData) => {
    "use server";
    return await updateTournamentAction(formData);
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
  const guaranteeAllTeams = async (tId: string) => {
    "use server";
    return await guaranteeAllTeamsAction(tId);
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
  const toggleSelectionLock = async (tId: string, locked: boolean) => {
    "use server";
    return await toggleSelectionLockAction(tId, locked);
  };
  const createTeam = async (...args: Parameters<typeof createTeamAction>) => {
    "use server";
    return await createTeamAction(...args);
  };


  const setRegistrationClosed = async (closed: boolean) => {
    "use server";
    return await setRegistrationClosedAction(t_.id, closed);
  };

  const generateRefToken = async () => {
    "use server";
    return await generateRefTokenAction(t_.id);
  };

  const revokeRefToken = async () => {
    "use server";
    return await revokeRefTokenAction(t_.id);
  };


  const submissionStatus = (t_.submissionStatus ?? (t_.approved ? "APPROVED" : "PENDING")) as "PENDING" | "APPROVED" | "REJECTED";
  const t = await getTranslations("tournament");

  return (
    <div className="page page--full-width">
      <CreatedToast />
      <div className="edit-header">
        <div>
          <p className="edit-header__eyebrow">{t("edit_dashboard_title")}</p>
          <h1 style={{ marginBottom: 4 }}>{t_.name}</h1>
          <p className="meta">{t_.city}, {t_.country} · {formatTournamentDates(params.locale, t_.dateStart, t_.dateEnd)}</p>
        </div>
        <Link href={`/tournament/${t_.slug ?? t_.id}`} className="ghost">{t("edit_view_public")}</Link>
      </div>

      <div className="edit-layout">
        {/* Sidebar checklist — colonne gauche desktop, collapsible mobile */}
        <aside className="edit-sidebar">
          <ChecklistDetails>
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
              hasHostClub: !!(t_ as any).hostClubId,
              usesPipeline: (t_ as any).usesPipeline ?? false,
              // Legacy : le format est « prêt » une fois verrouillé.
              stagesCount: (t_ as any).usesPipeline ? (t_.stages ?? []).length : t_.locked ? 1 : 0,
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
          </ChecklistDetails>
        </aside>

        {/* Main content — colonne droite */}
        <div className="edit-main">
      <OrgaDashboard
            tieWarnings={(t_ as any).usesPipeline ? await pipelineTieWarnings(t_.id) : undefined}
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
              // État du verrou de la sélection : sans lui, l'écran croyait la
              // sélection toujours ouverte (bandeau « Valider la sélection »)
              // alors qu'elle était verrouillée en base → chaque action refusée.
              selectionLocked: (t_ as any).selectionLocked ?? false,
              gameDurationMin: t_.gameDurationMin,
              maxTeams: t_.maxTeams,
              courtsCount: t_.courtsCount,
              registrationFeePerTeam: t_.registrationFeePerTeam,
              registrationFeeCurrency: t_.registrationFeeCurrency,
              contactEmail: t_.contactEmail,
              registrationStart: t_.registrationStart?.toISOString() ?? null,
              registrationEnd: t_.registrationEnd?.toISOString() ?? null,
              // Sans lui, le champ du formulaire restait vide et chaque
              // enregistrement effaçait le lien d'inscription externe.
              externalRegistrationUrl: (t_ as any).externalRegistrationUrl ?? null,
              submissionStatus,
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
              streamCourt1Url: (t_ as any).streamCourt1Url ?? null,
              streamCourt2Url: (t_ as any).streamCourt2Url ?? null,
              streamMultiplexUrl: (t_ as any).streamMultiplexUrl ?? null,
              chatMode: t_.chatMode,
              saturdayFormat: t_.saturdayFormat,
              poolCount: t_.poolCount,
              crossPool: t_.crossPool,
              swissRounds: t_.swissRounds,
              poolRounds: (t_ as any).poolRounds ?? null,
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
              fridayGroupAStart: (t_ as any).fridayGroupAStart?.toISOString() ?? null,
              fridayGroupBStart: (t_ as any).fridayGroupBStart?.toISOString() ?? null,
              mtpPoolAStart: (t_ as any).mtpPoolAStart?.toISOString() ?? null,
              mtpPoolBStart: (t_ as any).mtpPoolBStart?.toISOString() ?? null,
              mtpSundayStart: (t_ as any).mtpSundayStart?.toISOString() ?? null,
              soloEntries: t_.soloEntries ?? [],
              hostClubId: (t_ as any).hostClubId ?? null,
              creator: t_.creator ? { id: t_.creator.id, name: t_.creator.name } : null,
              // Pipeline (nouveau système) — CES CHAMPS SONT CRITIQUES : sans eux,
              // OrgaDashboard/TournamentEditForm croient que le tournoi est legacy
              usesPipeline: (t_ as any).usesPipeline ?? false,
              // Fuseau effectif (renseigné, ou déduit du lieu) : planning et formulaire.
              timezone: tournamentTimezone(t_ as never),
              countryCanonical: canonicalCountryName(t_.country),
              stages: (t_.stages ?? []).map((s: any) => ({
                id: s.id,
                order: s.order,
                name: s.name,
                type: s.type,
                status: s.status,
                config: s.config,
                entryRules: s.entryRules,
                startAt: s.startAt?.toISOString() ?? null,
                entries: (s.entries ?? []).map((e: any) => ({ id: e.id, slot: e.slot, groupKey: e.groupKey, teamId: e.teamId })),
                matches: (s.matches ?? []).map((m: any) => ({ id: m.id, status: m.status, groupKey: m.groupKey ?? null, roundIndex: m.roundIndex })),
              })),
            }}
            teams={t_.teams}
            freeAgents={t_.freeAgents}
            matches={t_.matches}
            sponsors={t_.sponsors}
            coOrganizers={t_.coOrganizers}
            isCreator={isCreator}
            isAdmin={isAdmin}
            isOrgaForThis={isOrgaForThis}
            updateAction={updateAction}
            addSponsorAction={addSponsor}
            deleteSponsorAction={deleteSponsor}
            deleteFreeAgentAction={deleteFreeAgent}
            renameTeamAction={renameTeam}
            deleteTeamAction={deleteTeam}
            removePlayerAction={removePlayer}
            addPlayerAction={addPlayer}
            launchStageAction={async (order) => {
              "use server";
              return await launchPipelineStageAction(t_.id, order);
            }}
            resetStagesAction={async (fromOrder) => {
              "use server";
              return await resetPipelineStagesAction(t_.id, fromOrder);
            }}
            simulateStageAction={async () => {
              "use server";
              return await simulatePipelineStageAction(t_.id);
            }}
            previewEntriesAction={async (order) => {
              "use server";
              return await previewPipelineEntriesAction(t_.id, order);
            }}
            setManualGroupsAction={async (order, assignments) => {
              "use server";
              return await setPipelineManualGroupsAction(t_.id, order, assignments);
            }}
            updatePipelineStageAction={async (order, patch) => {
              "use server";
              return await updatePipelineStageAction(t_.id, order, patch);
            }}
            setPipelineSeedsAction={async (teamIds) => {
              "use server";
              return await setPipelineSeedsAction(t_.id, teamIds);
            }}
            swapPipelineTeamsAction={async (order, a, b) => {
              "use server";
              return await swapPipelineTeamsAction(t_.id, order, a, b);
            }}
            launchPipelineGroupAction={async (order) => {
              "use server";
              return await launchPipelineGroupAction(t_.id, order);
            }}
            addPipelineStageAction={async (def) => {
              "use server";
              return await addPipelineStageAction(t_.id, def);
            }}
            removePipelineStageAction={async (order) => {
              "use server";
              return await removePipelineStageAction(t_.id, order);
            }}
            movePipelineStageAction={async (order, dir) => {
              "use server";
              return await movePipelineStageAction(t_.id, order, dir);
            }}
            resetPipelineToRoundAction={async (order, round, group) => {
              "use server";
              return await resetPipelineToRoundAction(t_.id, order, round, group);
            }}
            reschedulePipelineStageAction={async (order) => {
              "use server";
              return await reschedulePipelineStageAction(t_.id, order);
            }}
            setTournamentPipelineAction={async (stages) => {
              "use server";
              return await setTournamentPipelineAction(t_.id, stages);
            }}
            applyPipelinePresetAction={async (presetKey) => {
              "use server";
              return await applyPipelinePresetAction(t_.id, presetKey);
            }}
            orgaTasks={orgaTasks.map((t) => ({ ...t, priority: t.priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT", deadline: t.deadline?.toISOString() ?? null, createdAt: t.createdAt.toISOString() }))}
            orgaNotes={orgaNotes.map((n) => ({ ...n, createdAt: n.createdAt.toISOString(), updatedAt: n.updatedAt.toISOString() }))}
            orgaLinks={orgaLinks.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() }))}
            currentPlayerId={currentPlayerId ?? ""}
            toggleTeamSelectedAction={toggleTeamSelected}
            drawTeamsAction={drawTeams}
            guaranteeTeamAction={guaranteeTeam}
            guaranteeAllTeamsAction={guaranteeAllTeams}
            setRegistrationClosedAction={setRegistrationClosed}
            drawOneTeamAction={drawOneTeam}
            drawOneWaitlistAction={drawOneWaitlist}
            removeFromWaitlistAction={removeFromWaitlist}
            toggleSelectionLockAction={toggleSelectionLock}
            createTeamAction={createTeam}
            generateRefTokenAction={generateRefToken}
            revokeRefTokenAction={revokeRefToken}
            accommodationHosts={accommodationHosts as any}
          />
        </div>
      </div>
    </div>
  );
}
