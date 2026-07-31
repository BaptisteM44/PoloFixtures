import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { updateTournamentAction, importTeamsAction, toggleLockAction, addSponsorAction, deleteSponsorAction, deleteFreeAgentAction, renameTeamAction, deleteTeamAction, removePlayerFromTeamAction, addPlayerToTeamAction, resubmitTournamentAction, launchTournamentAction, resetTournamentAction, resetMatchesAction, toggleTeamSelectedAction, drawTeamsAction, toggleTeamGuaranteedAction, drawOneTeamAction, drawOneWaitlistAction, removeFromWaitlistAction, toggleSelectionLockAction, createTeamAction, launchPoolAction, launchGrazPoolAction, launchGrazSundayRRAction, launchGrazRegroupAction, launchGrazSEAction, resetGrazPhaseAction, updatePoolRoundsAction, launchMtpPoolAction, launchMtpNextRoundAction, launchMtpCrossPoolAction, launchMtpBarrageAction, launchMtpDEAction, resetMtpPhaseAction, updateMtpTimesAction, updateBerlinTimesAction, generateRefTokenAction, revokeRefTokenAction, launchKiosquePoolRoundAction, launchKiosqueRegroupAction, launchKiosqueNextRoundAction, launchKiosqueSEAction, resetKiosquePhaseAction, resetKiosqueJ1Action, launchBigAppleSwissRoundAction, launchBigApplePlacementAction, launchBigAppleSEAction, resetBigApplePhaseAction, launchPipelineStageAction, resetPipelineStagesAction, simulatePipelineStageAction, previewPipelineEntriesAction, setPipelineManualGroupsAction, updatePipelineStageAction, addPipelineStageAction, removePipelineStageAction, movePipelineStageAction, launchPipelineGroupAction, resetPipelineToRoundAction, reschedulePipelineStageAction, setTournamentPipelineAction, applyPipelinePresetAction } from "./actions";
import { TournamentChecklist } from "@/components/TournamentChecklist";
import { ChecklistDetails } from "@/components/ChecklistDetails";
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
      matches: { select: { id: true, phase: true, roundIndex: true, positionInRound: true, status: true, winnerTeamId: true, poolId: true, poolSessionIndex: true, teamAId: true, teamBId: true, dayIndex: true, stageId: true, groupKey: true, bracketSide: true, startAt: true, courtName: true } },
      stages: { orderBy: { order: "asc" }, include: { entries: true, matches: { select: { id: true, status: true, groupKey: true } } } },
      sponsors: { orderBy: { name: "asc" } },
      coOrganizers: { include: { player: { select: { id: true, name: true, country: true, city: true, photoPath: true } } }, orderBy: { addedAt: "asc" } },
      soloEntries: { include: { player: { select: { id: true, name: true, country: true, city: true, photoPath: true, badges: true, pinnedBadges: true, startYear: true, hand: true, gender: true, showGender: true, slug: true } } }, orderBy: { createdAt: "asc" } },
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
  const toggleSelectionLock = async (tId: string, locked: boolean) => {
    "use server";
    return await toggleSelectionLockAction(tId, locked);
  };
  const createTeam = async (...args: Parameters<typeof createTeamAction>) => {
    "use server";
    return await createTeamAction(...args);
  };

  const updatePoolRounds = async (tId: string, poolRounds: number | null) => {
    "use server";
    return await updatePoolRoundsAction(tId, poolRounds);
  };

  const generateRefToken = async () => {
    "use server";
    return await generateRefTokenAction(t_.id);
  };

  const revokeRefToken = async () => {
    "use server";
    return await revokeRefTokenAction(t_.id);
  };

  const launchMtpPool = async (pool: "A" | "B") => {
    "use server";
    return await launchMtpPoolAction(t_.id, pool);
  };
  const launchMtpNextRound = async (pool: "A" | "B") => {
    "use server";
    return await launchMtpNextRoundAction(t_.id, pool);
  };
  const launchMtpCrossPool = async () => {
    "use server";
    return await launchMtpCrossPoolAction(t_.id);
  };
  const launchMtpBarrage = async () => {
    "use server";
    return await launchMtpBarrageAction(t_.id);
  };
  const launchMtpDE = async () => {
    "use server";
    return await launchMtpDEAction(t_.id);
  };
  const resetMtpPhase = async (phase: "POOL_A" | "POOL_B" | "CROSS_POOL" | "BARRAGE" | "DE") => {
    "use server";
    return await resetMtpPhaseAction(t_.id, phase);
  };
  const updateMtpTimes = async (a: string | null, b: string | null, s: string | null) => {
    "use server";
    return await updateMtpTimesAction(t_.id, a, b, s);
  };
  const updateBerlinTimes = async (a: string | null, b: string | null) => {
    "use server";
    return await updateBerlinTimesAction(t_.id, a, b);
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
              timezone: (t_ as any).timezone ?? null,
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
                matches: (s.matches ?? []).map((m: any) => ({ id: m.id, status: m.status, groupKey: m.groupKey ?? null })),
              })),
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
            launchPoolBAction={async () => {
              "use server";
              return await launchPoolAction(t_.id, "B");
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
            launchMtpPoolAction={launchMtpPool}
            launchMtpNextRoundAction={launchMtpNextRound}
            launchMtpCrossPoolAction={launchMtpCrossPool}
            launchMtpBarrageAction={launchMtpBarrage}
            launchMtpDEAction={launchMtpDE}
            resetMtpPhaseAction={resetMtpPhase}
            updateMtpTimesAction={updateMtpTimes}
            updateBerlinTimesAction={updateBerlinTimes}
            launchKiosquePoolRoundAction={async (poolName) => {
              "use server";
              return await launchKiosquePoolRoundAction(t_.id, poolName);
            }}
            launchKiosqueRegroupAction={async () => {
              "use server";
              return await launchKiosqueRegroupAction(t_.id);
            }}
            launchKiosqueNextRoundAction={async (group) => {
              "use server";
              return await launchKiosqueNextRoundAction(t_.id, group);
            }}
            launchKiosqueSEAction={async () => {
              "use server";
              return await launchKiosqueSEAction(t_.id);
            }}
            resetKiosquePhaseAction={async (phase) => {
              "use server";
              return await resetKiosquePhaseAction(t_.id, phase);
            }}
            resetKiosqueJ1Action={async () => {
              "use server";
              return await resetKiosqueJ1Action(t_.id);
            }}
            launchBigAppleSwissRoundAction={async () => {
              "use server";
              return await launchBigAppleSwissRoundAction(t_.id);
            }}
            launchBigApplePlacementAction={async () => {
              "use server";
              return await launchBigApplePlacementAction(t_.id);
            }}
            launchBigAppleSEAction={async () => {
              "use server";
              return await launchBigAppleSEAction(t_.id);
            }}
            resetBigApplePhaseAction={async (phase) => {
              "use server";
              return await resetBigApplePhaseAction(t_.id, phase);
            }}
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
            drawOneTeamAction={drawOneTeam}
            drawOneWaitlistAction={drawOneWaitlist}
            removeFromWaitlistAction={removeFromWaitlist}
            toggleSelectionLockAction={toggleSelectionLock}
            createTeamAction={createTeam}
            updatePoolRoundsAction={updatePoolRounds}
            generateRefTokenAction={generateRefToken}
            revokeRefTokenAction={revokeRefToken}
            accommodationHosts={accommodationHosts as any}
          />
        </div>
      </div>
    </div>
  );
}
