"use server";

import { prisma } from "@/lib/db";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { INFO_TILE_KEYS } from "@/lib/infoTilesDefaults";
import { generatePools, generatePoolMatches, generateBracket, generateSwissRound } from "@/lib/bracket";
import { computeStandings } from "@/lib/standings";

const updateSchema = z.object({
  id: z.string(),
  name: z.string().min(2),
  continentCode: z.string().min(2),
  region: z.string().optional().nullable(),
  country: z.string().min(2),
  city: z.string().min(1),
  dateStart: z.string(),
  dateEnd: z.string(),
  format: z.string(),
  gameDurationMin: z.coerce.number(),
  maxTeams: z.coerce.number(),
  courtsCount: z.coerce.number(),
  registrationFeePerTeam: z.coerce.number(),
  registrationFeeCurrency: z.string(),
  contactEmail: z.string().email(),
  registrationStart: z.string().optional().nullable(),
  registrationEnd: z.string().optional().nullable(),
  venueName: z.string().optional().nullable(),
  venueAddress: z.string().optional().nullable(),
  venueMapsUrl: z.string().optional().nullable(),
  fridayWelcomeName: z.string().optional().nullable(),
  fridayWelcomeAddress: z.string().optional().nullable(),
  fridayWelcomeMapsUrl: z.string().optional().nullable(),
  saturdayEventName: z.string().optional().nullable(),
  saturdayEventAddress: z.string().optional().nullable(),
  saturdayEventMapsUrl: z.string().optional().nullable(),
  saturdayEveningName: z.string().optional().nullable(),
  saturdayEveningAddress: z.string().optional().nullable(),
  saturdayEveningMapsUrl: z.string().optional().nullable(),
  otherNotes: z.string().optional().nullable(),
  links: z.string().optional().nullable(),
  bannerPath: z.string().optional().nullable(),
  streamYoutubeUrl: z.string().optional().nullable(),
  chatMode: z.enum(["OPEN", "ORG_ONLY", "DISABLED"]).default("DISABLED"),
  saturdayFormat: z.enum(["ALL_DAY", "SPLIT_POOLS", "SWISS"]),
  sundayFormat: z.enum(["SE", "DE"]),
  status: z.enum(["UPCOMING", "LIVE", "COMPLETED"]),
  locked: z.coerce.boolean(),
  accommodationAvailable: z.coerce.boolean().default(false),
  accommodationType: z.string().optional().nullable(),
  accommodationCapacity: z.coerce.number().optional().nullable(),
  meals: z.string().optional().nullable(),
  kitList: z.string().optional().nullable(),
  additionalInfo: z.string().optional().nullable(),
  faq: z.string().optional().nullable(),
  telegramUrl: z.string().optional().nullable(),
});

export async function updateTournamentAction(formData: FormData) {
  const payload = Object.fromEntries(formData.entries());
  const parsed = updateSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.flatten() };
  }

  const data = parsed.data;
  const tournament = await prisma.tournament.findUnique({ where: { id: data.id } });
  if (!tournament) return { error: "Not found" };

  if (tournament.locked) {
    const structuralFields = ["format", "maxTeams", "courtsCount", "saturdayFormat", "sundayFormat"] as const;
    for (const field of structuralFields) {
      if ((data as Record<string, unknown>)[field] !== (tournament as Record<string, unknown>)[field]) {
        return { error: `${field} cannot be changed when locked` };
      }
    }
  }

  const links = (data.links ?? "")
    .split("\n")
    .map((link) => link.trim())
    .filter(Boolean);

  // Parse JSON fields
  let mealsJson = null;
  try { mealsJson = data.meals ? JSON.parse(data.meals) : null; } catch { /* ignore */ }
  let faqJson = null;
  try { faqJson = data.faq ? JSON.parse(data.faq) : null; } catch { /* ignore */ }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _id, locked: _locked, links: _links, meals: _meals, faq: _faq, accommodationCapacity: _ac, telegramUrl: _tg, ...rest } = data;

  await prisma.tournament.update({
    where: { id: data.id },
    data: {
      ...rest,
      dateStart: new Date(data.dateStart),
      dateEnd: new Date(data.dateEnd),
      registrationStart: data.registrationStart ? new Date(data.registrationStart) : null,
      registrationEnd: data.registrationEnd ? new Date(data.registrationEnd) : null,
      links,
      accommodationType: data.accommodationType || null,
      accommodationCapacity: data.accommodationCapacity && !isNaN(data.accommodationCapacity) ? data.accommodationCapacity : null,
      meals: mealsJson,
      kitList: data.kitList || null,
      additionalInfo: data.additionalInfo || null,
      faq: faqJson,
      telegramUrl: data.telegramUrl || null,
    }
  });

  revalidatePath(`/tournament/${data.id}`);
  return { ok: true };
}

export async function generatePoolsAction(id: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: { teams: true }
  });
  if (!tournament) return { error: "Not found" };

  // Swiss format: cannot generate fixed pools, use generateSwissRoundAction instead
  if (tournament.saturdayFormat === "SWISS") {
    return { error: "Ce tournoi utilise le format Swiss. Utilisez \"Générer tour Swiss\" à la place." };
  }

  const pools = generatePools(tournament.teams, tournament.saturdayFormat);
  const courtNames = Array.from({ length: tournament.courtsCount }, (_, i) => `Court ${i + 1}`);
  const matches = generatePoolMatches(pools, courtNames, new Date(tournament.dateStart), tournament.gameDurationMin);

  await prisma.$transaction(async (tx) => {
    await tx.match.deleteMany({ where: { tournamentId: id, phase: "POOL" } });
    await tx.poolTeam.deleteMany({ where: { pool: { tournamentId: id } } });
    await tx.pool.deleteMany({ where: { tournamentId: id } });

    for (const pool of pools) {
      const createdPool = await tx.pool.create({
        data: {
          tournamentId: id,
          name: pool.name,
          session: pool.session ?? null
        }
      });
      await tx.poolTeam.createMany({
        data: pool.teams.map((team) => ({ poolId: createdPool.id, teamId: team.id }))
      });

      for (const match of matches.filter((m) => m.poolName === pool.name)) {
        await tx.match.create({
          data: {
            tournamentId: id,
            phase: "POOL",
            poolId: createdPool.id,
            bracketSide: null,
            roundIndex: 1,
            courtName: match.courtName,
            startAt: match.startAt,
            dayIndex: "SAT",
            status: "SCHEDULED",
            teamAId: match.teamAId,
            teamBId: match.teamBId
          }
        });
      }
    }
  });

  revalidatePath(`/tournament/${id}`);
  return { ok: true };
}

export async function generateBracketAction(id: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: { teams: true, matches: true }
  });
  if (!tournament) return { error: "Not found" };

  // Auto-seed depuis les standings Pool/Swiss si disponibles
  const qualifyingMatches = tournament.matches.filter(
    (m) => m.phase === "POOL" || m.phase === "SWISS"
  );
  let seededTeams = tournament.teams;
  if (qualifyingMatches.length > 0) {
    const standings = computeStandings(tournament.teams, qualifyingMatches);
    seededTeams = standings
      .map((row) => tournament.teams.find((t) => t.id === row.teamId))
      .filter((t): t is NonNullable<typeof t> => t !== undefined);
  }

  const courtNames = Array.from({ length: tournament.courtsCount }, (_, i) => `Court ${i + 1}`);
  const matches = generateBracket(seededTeams, tournament.sundayFormat, courtNames, new Date(tournament.dateEnd), tournament.gameDurationMin);

  await prisma.$transaction(async (tx) => {
    await tx.match.deleteMany({ where: { tournamentId: id, phase: "BRACKET" } });

    // First pass: create all matches
    const created: Array<{ id: string; roundIndex: number; bracketSide: string | null; positionInRound: number }> = [];
    for (const match of matches) {
      const m = await tx.match.create({
        data: {
          tournamentId: id,
          phase: "BRACKET",
          bracketSide: match.bracketSide ?? null,
          roundIndex: match.roundIndex,
          courtName: match.courtName,
          startAt: match.startAt,
          dayIndex: "SUN",
          status: "SCHEDULED",
          teamAId: match.teamAId,
          teamBId: match.teamBId,
        }
      });
      created.push({ id: m.id, roundIndex: m.roundIndex, bracketSide: m.bracketSide, positionInRound: match.positionInRound ?? 0 });
    }

    // Helper: find a match by side+round+position
    const findMatch = (side: string | null, round: number, pos: number) =>
      created.find((m) => m.bracketSide === side && m.roundIndex === round && m.positionInRound === pos);

    if (tournament.sundayFormat === "SE") {
      // Round r, position p → feeds Round r+1, position floor(p/2), slot A if p%2==0, B if p%2==1
      const maxRound = Math.max(...created.map((m) => m.roundIndex));
      for (const m of created) {
        if (m.roundIndex < maxRound) {
          const nextPos = Math.floor(m.positionInRound / 2);
          const nextRound = m.roundIndex + 1;
          const nextSide = nextRound === maxRound ? "G" : "W";
          const nextMatch = findMatch(nextSide, nextRound, nextPos);
          if (nextMatch) {
            await tx.match.update({
              where: { id: m.id },
              data: {
                nextMatchWinId: nextMatch.id,
                nextSlotWin: m.positionInRound % 2 === 0 ? "A" : "B",
              }
            });
          }
        }
      }
    }

    if (tournament.sundayFormat === "DE") {
      // Upper R1 → winner: Upper R2, loser: Lower R1
      // Upper R2 → winner: Upper Final (W R3), loser: Lower R2
      // Lower R1 + Upper R2 losers → Lower R2
      // Upper Final + Lower R2 → Lower Final + Grand Final
      const upper1 = created.filter((m) => m.bracketSide === "W" && m.roundIndex === 1).sort((a, b) => a.positionInRound - b.positionInRound);
      const upper2 = created.filter((m) => m.bracketSide === "W" && m.roundIndex === 2).sort((a, b) => a.positionInRound - b.positionInRound);
      const upperFinal = created.find((m) => m.bracketSide === "W" && m.roundIndex === 3);
      const lower1 = created.filter((m) => m.bracketSide === "L" && m.roundIndex === 1).sort((a, b) => a.positionInRound - b.positionInRound);
      const lower2 = created.filter((m) => m.bracketSide === "L" && m.roundIndex === 2).sort((a, b) => a.positionInRound - b.positionInRound);
      const lowerFinal = created.find((m) => m.bracketSide === "L" && m.roundIndex === 3);
      const grandFinal = created.find((m) => m.bracketSide === "G");

      // Upper R1: winners advance to Upper R2, losers drop to Lower R1
      for (let i = 0; i < upper1.length; i++) {
        const nextUpperPos = Math.floor(i / 2);
        const nextLowerPos = Math.floor(i / 2);
        await tx.match.update({
          where: { id: upper1[i].id },
          data: {
            nextMatchWinId: upper2[nextUpperPos]?.id ?? null,
            nextSlotWin: i % 2 === 0 ? "A" : "B",
            nextMatchLoseId: lower1[nextLowerPos]?.id ?? null,
            nextSlotLose: i % 2 === 0 ? "A" : "B",
          }
        });
      }

      // Upper R2 (if exists) → Upper Final (W), Lower R2 (L)
      for (let i = 0; i < upper2.length; i++) {
        await tx.match.update({
          where: { id: upper2[i].id },
          data: {
            nextMatchWinId: upperFinal?.id ?? null,
            nextSlotWin: i % 2 === 0 ? "A" : "B",
            nextMatchLoseId: lower2[i]?.id ?? null,
            nextSlotLose: "B",
          }
        });
      }

      // Lower R1 → Lower R2
      for (let i = 0; i < lower1.length; i++) {
        await tx.match.update({
          where: { id: lower1[i].id },
          data: {
            nextMatchWinId: lower2[i]?.id ?? null,
            nextSlotWin: "A",
          }
        });
      }

      // Upper Final → Grand Final (A), Lower Final → Grand Final (B)
      if (upperFinal && grandFinal) {
        await tx.match.update({ where: { id: upperFinal.id }, data: { nextMatchWinId: grandFinal.id, nextSlotWin: "A" } });
      }
      // Lower R2 → Lower Final
      for (let i = 0; i < lower2.length; i++) {
        await tx.match.update({
          where: { id: lower2[i].id },
          data: { nextMatchWinId: lowerFinal?.id ?? null, nextSlotWin: i === 0 ? "A" : "B" }
        });
      }
      if (lowerFinal && grandFinal) {
        await tx.match.update({ where: { id: lowerFinal.id }, data: { nextMatchWinId: grandFinal.id, nextSlotWin: "B" } });
      }
    }
  });

  revalidatePath(`/tournament/${id}`);
  return { ok: true };
}

export async function importTeamsAction(id: string, raw: string) {
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const existingCount = await prisma.team.count({ where: { tournamentId: id } });

  const data = lines.map((line, index) => ({
    tournamentId: id,
    name: line,
    seed: existingCount + index + 1
  }));

  await prisma.team.createMany({ data });
  revalidatePath(`/tournament/${id}/edit`);
  return { ok: true };
}

/**
 * Génère le prochain tour Swiss.
 * - Récupère les équipes + matches Swiss existants
 * - Calcule les standings à partir des résultats actuels
 * - Génère les pairings du tour suivant (évite les rematches)
 */
export async function generateSwissRoundAction(id: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: { teams: true, matches: true }
  });
  if (!tournament) return { error: "Tournoi introuvable" };

  const swissMatches = tournament.matches.filter((m) => m.phase === "SWISS");
  const existingRounds = swissMatches.length > 0
    ? Math.max(...swissMatches.map((m) => m.roundIndex))
    : 0;

  // Check that all matches of the previous round are finished
  if (existingRounds > 0) {
    const latestRound = swissMatches.filter((m) => m.roundIndex === existingRounds);
    const unfinished = latestRound.filter((m) => m.status !== "FINISHED");
    if (unfinished.length > 0) {
      return { error: `Le tour Swiss ${existingRounds} contient encore ${unfinished.length} match(es) non terminé(s).` };
    }
  }

  const standings = computeStandings(tournament.teams, swissMatches);
  const nextRound = existingRounds + 1;
  const courtNames = Array.from({ length: tournament.courtsCount }, (_, i) => `Court ${i + 1}`);

  // Schedule start: use tournament start + offset for subsequent rounds
  const startAt = new Date(tournament.dateStart);

  const newMatches = generateSwissRound(
    tournament.teams,
    standings,
    swissMatches,
    nextRound,
    courtNames,
    startAt,
    tournament.gameDurationMin
  );

  if (newMatches.length === 0) {
    return { error: "Impossible de générer des pairings (nombre impair d'équipes ou toutes les combinaisons déjà jouées)." };
  }

  await prisma.$transaction(
    newMatches.map((match) =>
      prisma.match.create({
        data: {
          tournamentId: id,
          phase: "SWISS",
          poolId: null,
          bracketSide: null,
          roundIndex: match.roundIndex,
          courtName: match.courtName,
          startAt: match.startAt,
          dayIndex: match.dayIndex,
          status: "SCHEDULED",
          teamAId: match.teamAId,
          teamBId: match.teamBId,
        }
      })
    )
  );

  revalidatePath(`/tournament/${id}`);
  return { ok: true, round: nextRound };
}

/**
 * Réinitialise tous les matchs Swiss.
 */
export async function resetSwissAction(id: string) {
  await prisma.match.deleteMany({ where: { tournamentId: id, phase: "SWISS" } });
  revalidatePath(`/tournament/${id}`);
  return { ok: true };
}

/**
 * Verrouille ou déverrouille un tournoi.
 * Si on déverrouille et que des matchs existent, on les supprime tous
 * (pools, brackets, swiss) + les pools associées.
 */
export async function toggleLockAction(id: string, confirmReset: boolean = false) {
  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: { matches: { select: { id: true } } }
  });
  if (!tournament) return { error: "Tournoi introuvable" };

  // On verrouille → pas de risque
  if (!tournament.locked) {
    await prisma.tournament.update({ where: { id }, data: { locked: true } });
    revalidatePath(`/tournament/${id}`);
    return { ok: true, locked: true };
  }

  // On déverrouille → vérifier s'il y a des matchs
  if (tournament.matches.length > 0 && !confirmReset) {
    return {
      confirm: true,
      matchCount: tournament.matches.length,
      message: `Ce tournoi a ${tournament.matches.length} match(es). Déverrouiller supprimera tous les matchs et les poules. Confirmer ?`
    };
  }

  // Reset tout si confirmé
  await prisma.$transaction(async (tx) => {
    await tx.match.deleteMany({ where: { tournamentId: id } });
    await tx.poolTeam.deleteMany({ where: { pool: { tournamentId: id } } });
    await tx.pool.deleteMany({ where: { tournamentId: id } });
    await tx.tournament.update({ where: { id }, data: { locked: false } });
  });

  revalidatePath(`/tournament/${id}`);
  return { ok: true, locked: false };
}

export async function addSponsorAction(
  tournamentId: string,
  name: string,
  url: string | null,
  logoPath: string | null
): Promise<{ ok?: boolean; error?: string }> {
  if (!name.trim()) return { error: "Le nom est requis." };
  await prisma.sponsor.create({
    data: { tournamentId, name: name.trim(), url: url || null, logoPath: logoPath || null }
  });
  revalidatePath(`/tournament/${tournamentId}`);
  revalidatePath(`/tournament/${tournamentId}/edit`);
  return { ok: true };
}

export async function deleteSponsorAction(
  sponsorId: string,
  tournamentId: string
): Promise<{ ok?: boolean; error?: string }> {
  await prisma.sponsor.delete({ where: { id: sponsorId } });
  revalidatePath(`/tournament/${tournamentId}`);
  revalidatePath(`/tournament/${tournamentId}/edit`);
  return { ok: true };
}

export async function deleteFreeAgentAction(
  freeAgentId: string,
  tournamentId: string
): Promise<{ ok?: boolean; error?: string }> {
  await prisma.freeAgent.delete({ where: { id: freeAgentId } });
  revalidatePath(`/tournament/${tournamentId}`);
  revalidatePath(`/tournament/${tournamentId}/edit`);
  return { ok: true };
}

export async function renameTeamAction(
  teamId: string,
  name: string,
  tournamentId: string
): Promise<{ ok?: boolean; error?: string }> {
  const trimmed = name.trim();
  if (!trimmed) return { error: "Le nom ne peut pas être vide." };
  await prisma.team.update({ where: { id: teamId }, data: { name: trimmed } });
  revalidatePath(`/tournament/${tournamentId}/edit`);
  revalidatePath(`/tournament/${tournamentId}`);
  return { ok: true };
}

export async function deleteTeamAction(
  teamId: string,
  tournamentId: string
): Promise<{ ok?: boolean; error?: string }> {
  // Supprimer les relations avant l'équipe
  await prisma.teamPlayer.deleteMany({ where: { teamId } });
  await prisma.poolTeam.deleteMany({ where: { teamId } });
  // Retirer les références dans les matchs (teamA/teamB) sans supprimer les matchs
  await prisma.match.updateMany({ where: { teamAId: teamId }, data: { teamAId: null } });
  await prisma.match.updateMany({ where: { teamBId: teamId }, data: { teamBId: null } });
  await prisma.team.delete({ where: { id: teamId } });
  revalidatePath(`/tournament/${tournamentId}/edit`);
  revalidatePath(`/tournament/${tournamentId}`);
  return { ok: true };
}

export async function removePlayerFromTeamAction(
  teamPlayerId: string,
  tournamentId: string
): Promise<{ ok?: boolean; error?: string }> {
  await prisma.teamPlayer.delete({ where: { id: teamPlayerId } });
  revalidatePath(`/tournament/${tournamentId}/edit`);
  revalidatePath(`/tournament/${tournamentId}`);
  return { ok: true };
}

export async function toggleTeamSelectedAction(
  teamId: string,
  tournamentId: string,
  selected: boolean
): Promise<{ ok?: boolean; error?: string }> {
  await prisma.team.update({ where: { id: teamId }, data: { selected } });
  revalidatePath(`/tournament/${tournamentId}`);
  revalidatePath(`/tournament/${tournamentId}/edit`);
  return { ok: true };
}

export async function drawTeamsAction(
  tournamentId: string,
  count: number
): Promise<{ ok?: boolean; error?: string }> {
  const teams = await prisma.team.findMany({ where: { tournamentId }, select: { id: true } });
  const shuffled = teams.sort(() => Math.random() - 0.5);
  const selectedIds = new Set(shuffled.slice(0, count).map((t) => t.id));
  await prisma.team.updateMany({
    where: { tournamentId, id: { in: Array.from(selectedIds) } },
    data: { selected: true }
  });
  await prisma.team.updateMany({
    where: { tournamentId, id: { notIn: Array.from(selectedIds) } },
    data: { selected: false }
  });
  revalidatePath(`/tournament/${tournamentId}`);
  revalidatePath(`/tournament/${tournamentId}/edit`);
  return { ok: true };
}

export async function addPlayerToTeamAction(
  teamId: string,
  tournamentId: string,
  playerData: { type: "existing"; playerId: string } | { type: "manual"; name: string; city?: string | null; country: string }
): Promise<{ ok?: boolean; error?: string }> {
  if (playerData.type === "existing") {
    const player = await prisma.player.findUnique({ where: { id: playerData.playerId } });
    if (!player) return { error: "Joueur introuvable." };
    const alreadyIn = await prisma.teamPlayer.findFirst({
      where: { playerId: playerData.playerId, team: { tournamentId } }
    });
    if (alreadyIn) return { error: `${player.name} est déjà dans une équipe de ce tournoi.` };
    await prisma.teamPlayer.create({ data: { teamId, playerId: playerData.playerId, isCaptain: false } });
  } else {
    const { toSlug } = await import("@/lib/utils");
    const base = toSlug(playerData.name);
    let slug = base;
    let si = 2;
    while (await prisma.player.findUnique({ where: { slug } })) slug = `${base}-${si++}`;
    const created = await prisma.player.create({
      data: { name: playerData.name, city: playerData.city ?? null, country: playerData.country, slug, status: "PENDING", badges: [] }
    });
    await prisma.teamPlayer.create({ data: { teamId, playerId: created.id, isCaptain: false } });
  }
  revalidatePath(`/tournament/${tournamentId}/edit`);
  revalidatePath(`/tournament/${tournamentId}`);
  return { ok: true };
}

const layoutItemSchema = z.object({
  i: z.enum(INFO_TILE_KEYS),
  x: z.number().int().min(0).max(2),
  y: z.number().int().min(0),
  w: z.number().int().min(1).max(3),
  h: z.number().int().min(1).max(12),
});

const infoTilesLayoutSchema = z.array(layoutItemSchema).min(1).max(5);

export async function resubmitTournamentAction(id: string): Promise<{ ok?: boolean; error?: string }> {
  const tournament = await prisma.tournament.findUnique({ where: { id } });
  if (!tournament) return { error: "Tournoi introuvable" };
  if (tournament.submissionStatus !== "REJECTED") return { error: "Ce tournoi n'est pas dans l'état REJECTED." };

  await prisma.tournament.update({
    where: { id },
    data: { submissionStatus: "PENDING", rejectionReason: null, approved: false }
  });

  revalidatePath(`/tournament/${id}/edit`);
  return { ok: true };
}

export async function saveInfoTilesLayoutAction(
  tournamentId: string,
  layout: unknown
): Promise<{ ok?: boolean; error?: string }> {
  const parsed = infoTilesLayoutSchema.safeParse(layout);
  if (!parsed.success) {
    return { error: "Données de layout invalides." };
  }
  const clean = parsed.data.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }));
  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { infoTilesLayout: clean },
  });
  revalidatePath(`/tournament/${tournamentId}`);
  return { ok: true };
}
