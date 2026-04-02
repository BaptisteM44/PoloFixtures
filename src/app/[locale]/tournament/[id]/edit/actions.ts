"use server";

import { prisma } from "@/lib/db";
import { z } from "zod";
import { generateTournamentSlug } from "@/lib/slug";
import { revalidatePath } from "next/cache";
import { notifyTeamPlayers } from "@/lib/notify";
import { INFO_TILE_KEYS } from "@/lib/infoTilesDefaults";
import { generatePools, generatePoolMatches, generateBracket, generateSwissRound, generateCrossPoolMatches, nextPowerOf2 } from "@/lib/bracket";
import { computeStandings } from "@/lib/standings";
import { getOrgaPlayerId } from "@/lib/orga-auth";

async function requireTournamentOrgaAccess(tournamentId: string): Promise<{ error: string } | null> {
  const playerId = await getOrgaPlayerId(tournamentId);
  if (!playerId) return { error: "Accès refusé." };
  return null;
}

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
  saturdayFormat: z.enum(["ALL_DAY", "SPLIT_POOLS", "SWISS", "BERLIN_MIXED"]),
  poolCount: z.coerce.number().int().min(1).max(4).default(1),
  crossPool: z.preprocess((v) => v === "true" || v === true, z.boolean().default(false)),
  swissRounds: z.coerce.number().int().min(1).max(20).default(5),
  bracketSize: z.coerce.number().int().min(2).max(64).default(16),
  sundayFormat: z.enum(["SE", "DE", "RR"]),
  scoringSystem: z.string().default("3/1"),
  thirdPlaceMatch: z.preprocess((v) => v === "true" || v === true, z.boolean().default(false)),
  gfReset: z.preprocess((v) => v === "true" || v === true, z.boolean().default(false)),
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
  maxSoloPlayers: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? undefined : v),
    z.coerce.number().int().min(1).optional().nullable()
  ),
  rushRegistration: z.preprocess(
    (v) => v === "true" || v === true,
    z.boolean().default(false)
  ),
});

export async function updateTournamentAction(formData: FormData) {
  const payload = Object.fromEntries(formData.entries());
  const parsed = updateSchema.safeParse(payload);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    const fieldErrors = Object.entries(flat.fieldErrors)
      .map(([k, v]) => `${k}: ${(v as string[]).join(", ")}`)
      .join("; ");
    return { error: fieldErrors || "Validation error" };
  }

  const data = parsed.data;
  const denied = await requireTournamentOrgaAccess(data.id);
  if (denied) return denied;

  const tournament = await prisma.tournament.findUnique({ where: { id: data.id } });
  if (!tournament) return { error: "Not found" };

  if (tournament.locked) {
    const structuralFields = ["format", "maxTeams", "courtsCount", "saturdayFormat", "sundayFormat", "poolCount", "crossPool"] as const;
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
  const { id: _id, locked: _locked, links: _links, meals: _meals, faq: _faq, accommodationCapacity: _ac, telegramUrl: _tg, swissRounds: _sr, bracketSize: _bs, chatMode: _cm, streamYoutubeUrl: _syu, saturdayFormat: _sf, sundayFormat: _df, scoringSystem: _ss, thirdPlaceMatch: _tpm, gfReset: _gfr, poolCount: _pc, crossPool: _cp, status: _statusFromForm, ...rest } = data;

  // Status transitions allowed via edit form:
  // UPCOMING → LIVE (launch tournament)
  // LIVE → COMPLETED (finish tournament)
  // COMPLETED → no downgrade (final state)
  // UPCOMING → COMPLETED (finish without going live)
  let statusUpdate: "UPCOMING" | "LIVE" | "COMPLETED" | undefined;
  if (tournament.status === "COMPLETED") {
    // Once completed, cannot change status
    statusUpdate = "COMPLETED";
  } else {
    // Allow any forward transition: UPCOMING can go to LIVE or COMPLETED, LIVE can go to COMPLETED
    statusUpdate = data.status;
  }

  const dateStart = new Date(data.dateStart);
  // Regenerate slug if name or city changed (only if tournament has no slug yet, or name/city changed)
  const existing = await prisma.tournament.findUnique({ where: { id: data.id }, select: { slug: true, name: true, city: true } });
  const needsNewSlug = !existing?.slug || existing.name !== data.name || existing.city !== data.city;
  const slug = needsNewSlug
    ? await generateTournamentSlug(data.name, data.city, dateStart.getFullYear(), data.id)
    : existing.slug;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.tournament.update as any)({
      where: { id: data.id },
      data: {
        ...rest,
        status: statusUpdate,
        slug,
        dateStart,
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
        streamYoutubeUrl: data.streamYoutubeUrl || null,
        swissRounds: data.swissRounds,
        bracketSize: data.bracketSize,
        chatMode: data.chatMode,
        saturdayFormat: data.saturdayFormat,
        poolCount: data.poolCount,
        crossPool: data.crossPool,
        sundayFormat: data.sundayFormat,
        scoringSystem: data.scoringSystem,
        thirdPlaceMatch: data.thirdPlaceMatch,
        gfReset: data.gfReset,
      }
    });
  } catch (err) {
    console.error("[updateTournamentAction] Prisma error:", err);
    return { error: err instanceof Error ? err.message : String(err) };
  }

  revalidatePath(`/tournament/${data.id}`);
  return { ok: true };
}

/**
 * Save manual pool assignments: orga can drag/drop teams into groups before launch.
 * Creates/updates Pool records and PoolTeam records.
 * assignments: Array of { poolName: string, teamIds: string[] }
 */
export async function savePoolAssignmentAction(
  id: string,
  assignments: Array<{ poolName: string; teamIds: string[] }>
) {
  const denied = await requireTournamentOrgaAccess(id);
  if (denied) return denied;

  const tournament = await prisma.tournament.findUnique({ where: { id } });
  if (!tournament) return { error: "Not found" };

  await prisma.$transaction(async (tx) => {
    // Clear existing pool assignments
    await tx.poolTeam.deleteMany({ where: { pool: { tournamentId: id } } });
    await tx.pool.deleteMany({ where: { tournamentId: id } });

    for (const assignment of assignments) {
      const pool = await tx.pool.create({
        data: {
          tournamentId: id,
          name: assignment.poolName,
          session: null,
        }
      });
      if (assignment.teamIds.length > 0) {
        await tx.poolTeam.createMany({
          data: assignment.teamIds.map((teamId) => ({ poolId: pool.id, teamId }))
        });
      }
    }
  }, { timeout: 15000 });

  revalidatePath(`/tournament/${id}`);
  revalidatePath(`/tournament/${id}/edit`);
  return { ok: true };
}

export async function generatePoolsAction(id: string) {
  const denied = await requireTournamentOrgaAccess(id);
  if (denied) return denied;

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: {
      teams: { where: { selected: true } },
      pools: { include: { teams: true } }
    }
  });
  if (!tournament) return { error: "Not found" };

  // Swiss format: cannot generate fixed pools, use generateSwissRoundAction instead
  if (tournament.saturdayFormat === "SWISS") {
    return { error: "Ce tournoi utilise le format Swiss. Utilisez \"Générer tour Swiss\" à la place." };
  }

  // If pools already exist (e.g., manually assigned), use them. Otherwise generate new ones.
  type PoolType = { name: string; teams: typeof tournament.teams; session?: any | null };
  let pools: PoolType[];

  if (tournament.pools.length > 0) {
    // Respect existing pool assignments (e.g., from PoolAssignment or cross-pool setup)
    pools = tournament.pools.map((pool) => ({
      name: pool.name,
      teams: pool.teams.map((pt) => tournament.teams.find((t) => t.id === pt.teamId)!).filter(Boolean),
      session: pool.session
    }));
  } else {
    // Generate new pools if none exist
    pools = generatePools(tournament.teams, tournament.saturdayFormat, tournament.poolCount);
  }

  const courtNames = Array.from({ length: tournament.courtsCount }, (_, i) => `Court ${i + 1}`);
  const matches = generatePoolMatches(pools, courtNames, new Date(tournament.dateStart), tournament.gameDurationMin);

  await prisma.$transaction(async (tx) => {
    await tx.match.deleteMany({ where: { tournamentId: id, phase: "POOL" } });
    // Only clear pool assignments if we generated new pools
    if (tournament.pools.length === 0) {
      await tx.poolTeam.deleteMany({ where: { pool: { tournamentId: id } } });
      await tx.pool.deleteMany({ where: { tournamentId: id } });
    }

    for (const pool of pools) {
      let poolId: string;
      if (tournament.pools.length > 0) {
        // Use existing pool
        poolId = tournament.pools.find((p) => p.name === pool.name)!.id;
      } else {
        // Create new pool
        const createdPool = await tx.pool.create({
          data: {
            tournamentId: id,
            name: pool.name,
            session: pool.session ?? null
          }
        });
        poolId = createdPool.id;
        await tx.poolTeam.createMany({
          data: pool.teams.map((team) => ({ poolId: createdPool.id, teamId: team.id }))
        });
      }

      const poolMatches = matches.filter((m) => m.poolName === pool.name);
      if (poolMatches.length > 0) {
        await tx.match.createMany({
          data: poolMatches.map((match) => ({
            tournamentId: id,
            phase: "POOL" as const,
            poolId: poolId,
            poolSessionIndex: match.poolSessionIndex ?? null,
            bracketSide: null,
            roundIndex: match.roundIndex,
            positionInRound: match.positionInRound ?? 0,
            courtName: match.courtName,
            startAt: match.startAt,
            dayIndex: "SAT",
            status: "SCHEDULED" as const,
            teamAId: match.teamAId,
            teamBId: match.teamBId
          }))
        });
      }
    }
  }, { timeout: 15000 });

  revalidatePath(`/tournament/${id}`);
  return { ok: true };
}

export async function generateBracketAction(id: string) {
  const denied = await requireTournamentOrgaAccess(id);
  if (denied) return denied;

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: { teams: { where: { selected: true } }, matches: true }
  });
  if (!tournament) return { error: "Not found" };

  // Auto-seed depuis les standings Pool/Swiss si disponibles
  const qualifyingMatches = tournament.matches.filter(
    (m) => m.phase === "POOL" || m.phase === "SWISS"
  );
  let seededTeams = tournament.teams;
  if (qualifyingMatches.length > 0) {
    const standings = computeStandings(tournament.teams, qualifyingMatches, tournament.scoringSystem);
    seededTeams = standings
      .map((row) => tournament.teams.find((t) => t.id === row.teamId))
      .filter((t): t is NonNullable<typeof t> => t !== undefined);
  }

  // Limit to bracketSize (top N teams from standings)
  const bracketSize = (tournament as any).bracketSize ?? 16;
  if (seededTeams.length > bracketSize) {
    seededTeams = seededTeams.slice(0, bracketSize);
  }

  const courtNames = Array.from({ length: tournament.courtsCount }, (_, i) => `Court ${i + 1}`);
  const bracketOptions = {
    thirdPlaceMatch: (tournament as any).thirdPlaceMatch ?? false,
    gfReset: (tournament as any).gfReset ?? false,
  };
  const matches = generateBracket(seededTeams, tournament.sundayFormat, courtNames, new Date(tournament.dateEnd), tournament.gameDurationMin, bracketOptions);

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
          positionInRound: match.positionInRound ?? 0,
          teamAId: match.teamAId,
          teamBId: match.teamBId,
        }
      });
      created.push({ id: m.id, roundIndex: m.roundIndex, bracketSide: m.bracketSide, positionInRound: m.positionInRound });
    }

    // Helper: find a match by side+round+position
    const findMatch = (side: string | null, round: number, pos: number) =>
      created.find((m) => m.bracketSide === side && m.roundIndex === round && m.positionInRound === pos);

    if (tournament.sundayFormat === "SE") {
      // Round r, position p → feeds Round r+1, position floor(p/2), slot A if p%2==0, B if p%2==1
      const maxRound = Math.max(...created.map((m) => m.roundIndex));
      const thirdPlaceMatch = created.find((m) => m.bracketSide === "L" && m.roundIndex === maxRound);

      for (const m of created) {
        if (m.bracketSide === "L") continue; // 3rd place match itself — no links needed
        if (m.roundIndex < maxRound) {
          const nextPos = Math.floor(m.positionInRound / 2);
          const nextRound = m.roundIndex + 1;
          const nextSide = nextRound === maxRound ? "G" : "W";
          const nextMatch = findMatch(nextSide, nextRound, nextPos);
          const data: Record<string, unknown> = {};
          if (nextMatch) {
            data.nextMatchWinId = nextMatch.id;
            data.nextSlotWin = m.positionInRound % 2 === 0 ? "A" : "B";
          }
          // Semi-final losers → 3rd place match
          if (thirdPlaceMatch && m.roundIndex === maxRound - 1) {
            data.nextMatchLoseId = thirdPlaceMatch.id;
            data.nextSlotLose = m.positionInRound % 2 === 0 ? "A" : "B";
          }
          if (Object.keys(data).length > 0) {
            await tx.match.update({ where: { id: m.id }, data });
          }
        }
      }
    }

    if (tournament.sundayFormat === "DE") {
      // ── DE Linking (Challonge-style) ─────────────────────────────────
      //
      // LB round types:
      //   Odd  (R1, R3, R5…) = Consolidation (LB survivors pair off)
      //   Even (R2, R4, R6…) = Injection (LB survivors slot A vs WB losers slot B)
      //
      // WB loser routing:
      //   WB R1 losers → LB R1 (consolidation: pair off, slots A+B)
      //   WB R(n≥2) losers → LB R(2n-2) slot B (injection round)
      //
      // LB winner routing:
      //   Consolidation (odd): winners pair off → next round (even), slot by i%2
      //   Injection (even): winners keep position → next round (odd), slot A
      //   Last LB round winner → Grand Final slot B

      const maxUR = Math.max(...created.filter(m => m.bracketSide === "W").map(m => m.roundIndex), 0);
      const maxLR = Math.max(...created.filter(m => m.bracketSide === "L").map(m => m.roundIndex), 0);
      const grandFinal = created.find(m => m.bracketSide === "G");

      const upperByRound = new Map<number, typeof created>();
      const lowerByRound = new Map<number, typeof created>();
      for (const m of created) {
        if (m.bracketSide === "W") {
          if (!upperByRound.has(m.roundIndex)) upperByRound.set(m.roundIndex, []);
          upperByRound.get(m.roundIndex)!.push(m);
        } else if (m.bracketSide === "L") {
          if (!lowerByRound.has(m.roundIndex)) lowerByRound.set(m.roundIndex, []);
          lowerByRound.get(m.roundIndex)!.push(m);
        }
      }
      for (const arr of [...upperByRound.values(), ...lowerByRound.values()]) {
        arr.sort((a, b) => a.positionInRound - b.positionInRound);
      }

      // ── Upper bracket linking ──────────────────────────────────────────
      for (let ur = 1; ur <= maxUR; ur++) {
        const uMatches = upperByRound.get(ur) ?? [];
        const uNext = upperByRound.get(ur + 1) ?? [];
        const isLastUpper = ur === maxUR;

        // Determine which LB round receives losers from this WB round
        let lrForLosers: number;
        if (ur === 1) {
          lrForLosers = 1; // Consolidation: WB R1 losers pair off
        } else {
          lrForLosers = 2 * ur - 2; // Injection round
        }
        const lMatches = lowerByRound.get(lrForLosers) ?? [];

        for (let i = 0; i < uMatches.length; i++) {
          const data: Record<string, unknown> = {};

          // Winner routing
          if (isLastUpper) {
            data.nextMatchWinId = grandFinal?.id ?? null;
            data.nextSlotWin = "A";
          } else {
            const nextPos = Math.floor(uMatches[i].positionInRound / 2);
            const nextMatch = uNext.find(m => m.positionInRound === nextPos);
            data.nextMatchWinId = nextMatch?.id ?? null;
            data.nextSlotWin = uMatches[i].positionInRound % 2 === 0 ? "A" : "B";
          }

          // Loser routing (not for last upper — that loser goes to LB via its own path)
          if (!isLastUpper && lMatches.length > 0) {
            if (ur === 1) {
              // WB R1 losers pair off into LB R1: 2 per match
              const sourcePos = uMatches[i].positionInRound;
              const lowerPos = Math.floor(sourcePos / 2);
              const lowerMatch = lMatches.find(m => m.positionInRound === lowerPos);
              if (lowerMatch) {
                data.nextMatchLoseId = lowerMatch.id;
                data.nextSlotLose = sourcePos % 2 === 0 ? "A" : "B";
              }
            } else {
              // WB R(n≥2) losers → LB R(2n-2) injection slot B
              const lowerMatch = lMatches[i];
              if (lowerMatch) {
                data.nextMatchLoseId = lowerMatch.id;
                data.nextSlotLose = "B";
              }
            }
          }

          // Special: last upper round loser → LB final injection slot B
          if (isLastUpper) {
            const lbFinalMatches = lowerByRound.get(maxLR) ?? [];
            const lbFinal = lbFinalMatches[0];
            if (lbFinal) {
              data.nextMatchLoseId = lbFinal.id;
              data.nextSlotLose = "B";
            }
          }

          await tx.match.update({ where: { id: uMatches[i].id }, data });
        }
      }

      // ── Lower bracket linking ──────────────────────────────────────────
      //
      // Consolidation (odd LR): LB survivors pair off. These produce winners that
      //   go 1:1 into the NEXT injection round (slot A). Same position, not paired.
      //
      // Injection (even LR): LB cons winner (slot A) vs WB loser (slot B).
      //   Winners pair off into the NEXT consolidation round: pos=floor(i/2), slot by i%2.
      //
      // Exception: the very last LB round winner → Grand Final slot B.
      for (let lr = 1; lr <= maxLR; lr++) {
        const lMatches = lowerByRound.get(lr) ?? [];
        const isLastLower = lr === maxLR;

        for (let i = 0; i < lMatches.length; i++) {
          const data: Record<string, unknown> = {};

          if (isLastLower) {
            data.nextMatchWinId = grandFinal?.id ?? null;
            data.nextSlotWin = "B";
          } else {
            const lNext = lowerByRound.get(lr + 1) ?? [];
            const isConsolidation = lr % 2 === 1;

            if (isConsolidation) {
              // Consolidation winners → next injection round, same position, slot A
              const nextMatch = lNext.find(m => m.positionInRound === lMatches[i].positionInRound);
              data.nextMatchWinId = nextMatch?.id ?? null;
              data.nextSlotWin = "A";
            } else {
              // Injection winners pair off → next consolidation round
              const nextPos = Math.floor(i / 2);
              const nextMatch = lNext.find(m => m.positionInRound === nextPos);
              data.nextMatchWinId = nextMatch?.id ?? null;
              data.nextSlotWin = i % 2 === 0 ? "A" : "B";
            }
          }

          await tx.match.update({ where: { id: lMatches[i].id }, data });
        }
      }
    }
  });

  revalidatePath(`/tournament/${id}`);
  return { ok: true };
}

/**
 * Re-apply seeding from Pool/Swiss standings to the existing bracket teams.
 * Updates each team's `seed` field so BracketView shows correct seed numbers.
 * Does NOT regenerate matches.
 */
export async function applySeedingAction(id: string) {
  const denied = await requireTournamentOrgaAccess(id);
  if (denied) return denied;

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: { teams: { where: { selected: true } }, matches: true }
  });
  if (!tournament) return { error: "Not found" };

  const qualifyingMatches = tournament.matches.filter(
    (m) => m.phase === "POOL" || m.phase === "SWISS"
  );
  if (qualifyingMatches.length === 0) return { error: "Aucun match qualificatif disponible pour le seeding." };

  const standings = computeStandings(tournament.teams, qualifyingMatches, tournament.scoringSystem);

  await prisma.$transaction(
    standings.map((row, index) =>
      prisma.team.update({ where: { id: row.teamId }, data: { seed: index + 1 } })
    )
  );

  revalidatePath(`/tournament/${id}`);
  return { ok: true };
}

/**
 * Generate cross-pool matches: pits teams from different pools against each other by rank.
 * 1A vs 1B, 2A vs 2B, etc. No team is eliminated — results are used to re-seed for bracket.
 */
export async function generateCrossPoolAction(id: string) {
  const denied = await requireTournamentOrgaAccess(id);
  if (denied) return denied;

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: {
      teams: { where: { selected: true } },
      pools: { include: { teams: { include: { team: true } } } },
      matches: true,
    }
  });
  if (!tournament) return { error: "Not found" };
  if (!tournament.crossPool) return { error: "Cross-pool non activé pour ce tournoi." };
  if (tournament.pools.length < 2) return { error: "Il faut au moins 2 groupes pour le cross-pool." };

  // Compute standings per pool
  const poolMatches = tournament.matches.filter((m) => m.phase === "POOL" || m.phase === "SWISS");
  const poolStandings = tournament.pools.map((pool) => {
    const poolTeams = pool.teams.map((pt) => pt.team);
    const poolTeamIds = new Set(poolTeams.map((t) => t.id));
    const relevantMatches = poolMatches.filter(
      (m) => (m.teamAId && poolTeamIds.has(m.teamAId)) || (m.teamBId && poolTeamIds.has(m.teamBId))
    );
    const standings = computeStandings(poolTeams, relevantMatches, tournament.scoringSystem);
    return {
      poolName: pool.name,
      teams: standings.map((row) => poolTeams.find((t) => t.id === row.teamId)!).filter(Boolean),
    };
  });

  const courtNames = Array.from({ length: tournament.courtsCount }, (_, i) => `Court ${i + 1}`);
  const matches = generateCrossPoolMatches(poolStandings, courtNames, new Date(tournament.dateEnd), tournament.gameDurationMin);

  await prisma.$transaction(async (tx) => {
    // Remove any existing cross-pool matches
    await tx.match.deleteMany({ where: { tournamentId: id, phase: "CROSS_POOL" } });

    for (const match of matches) {
      await tx.match.create({
        data: {
          tournamentId: id,
          phase: "CROSS_POOL",
          poolId: null,
          bracketSide: null,
          roundIndex: match.roundIndex,
          positionInRound: match.positionInRound ?? 0,
          courtName: match.courtName,
          startAt: match.startAt,
          dayIndex: "SUN",
          status: "SCHEDULED",
          teamAId: match.teamAId,
          teamBId: match.teamBId,
        }
      });
    }
  }, { timeout: 15000 });

  revalidatePath(`/tournament/${id}`);
  return { ok: true };
}

/**
 * Generate the SE round after cross-pool: all teams enter a single-elimination round.
 * Losers are OUT, winners continue to DE.
 * Seeding comes from cross-pool results.
 */
export async function generateCrossPoolSEAction(id: string) {
  const denied = await requireTournamentOrgaAccess(id);
  if (denied) return denied;

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: { teams: { where: { selected: true } }, matches: true }
  });
  if (!tournament) return { error: "Not found" };

  // Seed from cross-pool results
  const crossPoolMatches = tournament.matches.filter((m) => m.phase === "CROSS_POOL");
  if (crossPoolMatches.length === 0) return { error: "Aucun match cross-pool trouvé. Générez d'abord les matchs cross-pool." };

  // Check all cross-pool matches are finished
  const unfinished = crossPoolMatches.filter((m) => m.status !== "FINISHED");
  if (unfinished.length > 0) return { error: `${unfinished.length} match(s) cross-pool non terminé(s).` };

  // Use all qualifying matches (pool + cross-pool) for seeding
  const qualifyingMatches = tournament.matches.filter(
    (m) => m.phase === "POOL" || m.phase === "SWISS" || m.phase === "CROSS_POOL"
  );
  const standings = computeStandings(tournament.teams, qualifyingMatches, tournament.scoringSystem);
  const seededTeams = standings
    .map((row) => tournament.teams.find((t) => t.id === row.teamId))
    .filter((t): t is NonNullable<typeof t> => t !== undefined);

  // Update seeds
  await prisma.$transaction(
    seededTeams.map((team, index) =>
      prisma.team.update({ where: { id: team.id }, data: { seed: index + 1 } })
    )
  );

  // SE elimination round:
  // Top N/3 teams (rounded) get a BYE and go straight to DE.
  // Remaining teams play: seed K vs seed (N+1-K), losers are OUT.
  // With 12 teams: top 4 BYE, 8 others play (5v12, 6v11, 7v10, 8v9) → 4 winners join DE.
  const courtNames = Array.from({ length: tournament.courtsCount }, (_, i) => `Court ${i + 1}`);
  const slotMin = tournament.gameDurationMin + 5;
  const startAt = new Date(tournament.dateEnd);
  const courtFree = courtNames.map(() => new Date(startAt));
  const n = seededTeams.length;
  const deSize = nextPowerOf2(Math.ceil(n * 2 / 3)); // target DE size (8 for 12 teams)
  const byeCount = deSize - Math.floor(n / 2) > 0 ? n - deSize : 0;
  // For 12: deSize=8, so byeCount = 12-8 = 4. The top 4 get BYE.
  const actualByeCount = n - deSize;
  const playingTeams = seededTeams.slice(actualByeCount); // seeds 5-12
  const matchCount = Math.floor(playingTeams.length / 2);

  await prisma.$transaction(async (tx) => {
    await tx.match.deleteMany({ where: { tournamentId: id, phase: "BRACKET" } });

    for (let i = 0; i < matchCount; i++) {
      const teamA = playingTeams[i];                          // seed 5, 6, 7, 8
      const teamB = playingTeams[playingTeams.length - 1 - i]; // seed 12, 11, 10, 9

      let bestIdx = 0;
      for (let c = 1; c < courtNames.length; c++) {
        if (courtFree[c] < courtFree[bestIdx]) bestIdx = c;
      }

      await tx.match.create({
        data: {
          tournamentId: id,
          phase: "BRACKET",
          bracketSide: "W",
          roundIndex: 1,
          positionInRound: i,
          courtName: courtNames[bestIdx],
          startAt: new Date(courtFree[bestIdx]),
          dayIndex: "SUN",
          status: "SCHEDULED",
          teamAId: teamA.id,
          teamBId: teamB.id,
        }
      });
      courtFree[bestIdx] = new Date(courtFree[bestIdx].getTime() + slotMin * 60000);
    }
  }, { timeout: 15000 });

  revalidatePath(`/tournament/${id}`);
  return { ok: true };
}

/**
 * Generate DE bracket with winners from the SE round.
 * Finds teams that won their last BRACKET match (SE survivors).
 */
export async function generateCrossPoolDEAction(id: string) {
  const denied = await requireTournamentOrgaAccess(id);
  if (denied) return denied;

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: { teams: { where: { selected: true } }, matches: true }
  });
  if (!tournament) return { error: "Not found" };

  const bracketMatches = tournament.matches.filter((m) => m.phase === "BRACKET");
  if (bracketMatches.length === 0) return { error: "Aucun match SE trouvé. Générez d'abord le bracket SE." };

  // Only round 1 of the SE bracket matters — those are the "SE elimination" matches
  const seRound1 = bracketMatches.filter((m) => m.roundIndex === 1);
  const unfinished = seRound1.filter((m) => m.status !== "FINISHED");
  if (unfinished.length > 0) return { error: `${unfinished.length} match(s) SE non terminé(s).` };

  // Teams that played in the SE round
  const seTeamIds = new Set<string>();
  for (const m of seRound1) {
    if (m.teamAId) seTeamIds.add(m.teamAId);
    if (m.teamBId) seTeamIds.add(m.teamBId);
  }

  // Collect winners from SE round 1
  const winnerIds = new Set<string>();
  for (const m of seRound1) {
    if (m.winnerTeamId) winnerIds.add(m.winnerTeamId);
  }

  // BYE teams = teams that didn't play in SE (top seeds)
  const byeTeams = tournament.teams
    .filter((t) => !seTeamIds.has(t.id))
    .sort((a, b) => a.seed - b.seed);

  // SE winners
  const seWinners = tournament.teams
    .filter((t) => winnerIds.has(t.id))
    .sort((a, b) => a.seed - b.seed);

  // Survivors = BYE teams + SE winners, sorted by seed
  const survivors = [...byeTeams, ...seWinners].sort((a, b) => a.seed - b.seed);

  if (survivors.length < 4) return { error: `Seulement ${survivors.length} survivants — il en faut au moins 4 pour un bracket DE.` };

  const courtNames = Array.from({ length: tournament.courtsCount }, (_, i) => `Court ${i + 1}`);
  const gfReset = (tournament as any).gfReset ?? false;
  const deMatches = generateBracket(survivors, "DE", courtNames, new Date(tournament.dateEnd), tournament.gameDurationMin, { gfReset });

  await prisma.$transaction(async (tx) => {
    // Delete existing bracket matches (SE ones are done)
    await tx.match.deleteMany({ where: { tournamentId: id, phase: "BRACKET" } });

    const created: Array<{ id: string; roundIndex: number; bracketSide: string | null; positionInRound: number }> = [];
    for (const match of deMatches) {
      const m = await tx.match.create({
        data: {
          tournamentId: id,
          phase: "BRACKET",
          bracketSide: match.bracketSide ?? null,
          roundIndex: match.roundIndex,
          positionInRound: match.positionInRound ?? 0,
          courtName: match.courtName,
          startAt: match.startAt,
          dayIndex: "SUN",
          status: "SCHEDULED",
          teamAId: match.teamAId,
          teamBId: match.teamBId,
        }
      });
      created.push({ id: m.id, roundIndex: m.roundIndex, bracketSide: m.bracketSide, positionInRound: m.positionInRound });
    }

    // DE linking (same as generateBracketAction DE section)
    const findMatch = (side: string | null, round: number, pos: number) =>
      created.find((m) => m.bracketSide === side && m.roundIndex === round && m.positionInRound === pos);

    const maxUR = Math.max(...created.filter(m => m.bracketSide === "W").map(m => m.roundIndex), 0);
    const maxLR = Math.max(...created.filter(m => m.bracketSide === "L").map(m => m.roundIndex), 0);
    const grandFinal = created.find(m => m.bracketSide === "G");

    const upperByRound = new Map<number, typeof created>();
    const lowerByRound = new Map<number, typeof created>();
    for (const m of created) {
      if (m.bracketSide === "W") {
        if (!upperByRound.has(m.roundIndex)) upperByRound.set(m.roundIndex, []);
        upperByRound.get(m.roundIndex)!.push(m);
      } else if (m.bracketSide === "L") {
        if (!lowerByRound.has(m.roundIndex)) lowerByRound.set(m.roundIndex, []);
        lowerByRound.get(m.roundIndex)!.push(m);
      }
    }
    for (const arr of [...upperByRound.values(), ...lowerByRound.values()]) {
      arr.sort((a, b) => a.positionInRound - b.positionInRound);
    }

    // Upper bracket linking
    for (let ur = 1; ur <= maxUR; ur++) {
      const uMatches = upperByRound.get(ur) ?? [];
      const uNext = upperByRound.get(ur + 1) ?? [];
      const isLastUpper = ur === maxUR;
      let lrForLosers: number;
      if (ur === 1) lrForLosers = 1;
      else lrForLosers = 2 * ur - 2;
      const lMatches = lowerByRound.get(lrForLosers) ?? [];

      for (let i = 0; i < uMatches.length; i++) {
        const data: Record<string, unknown> = {};
        if (isLastUpper) {
          data.nextMatchWinId = grandFinal?.id ?? null;
          data.nextSlotWin = "A";
        } else {
          const nextPos = Math.floor(uMatches[i].positionInRound / 2);
          const nextMatch = uNext.find(m => m.positionInRound === nextPos);
          data.nextMatchWinId = nextMatch?.id ?? null;
          data.nextSlotWin = uMatches[i].positionInRound % 2 === 0 ? "A" : "B";
        }
        if (!isLastUpper && lMatches.length > 0) {
          if (ur === 1) {
            const sourcePos = uMatches[i].positionInRound;
            const lowerPos = Math.floor(sourcePos / 2);
            const lowerMatch = lMatches.find(m => m.positionInRound === lowerPos);
            if (lowerMatch) {
              data.nextMatchLoseId = lowerMatch.id;
              data.nextSlotLose = sourcePos % 2 === 0 ? "A" : "B";
            }
          } else {
            const lowerMatch = lMatches[i];
            if (lowerMatch) {
              data.nextMatchLoseId = lowerMatch.id;
              data.nextSlotLose = "B";
            }
          }
        }
        if (isLastUpper) {
          const lbFinalMatches = lowerByRound.get(maxLR) ?? [];
          const lbFinal = lbFinalMatches[0];
          if (lbFinal) {
            data.nextMatchLoseId = lbFinal.id;
            data.nextSlotLose = "B";
          }
        }
        await tx.match.update({ where: { id: uMatches[i].id }, data });
      }
    }

    // Lower bracket linking
    for (let lr = 1; lr <= maxLR; lr++) {
      const lMatches = lowerByRound.get(lr) ?? [];
      const isLastLower = lr === maxLR;
      for (let i = 0; i < lMatches.length; i++) {
        const data: Record<string, unknown> = {};
        if (isLastLower) {
          data.nextMatchWinId = grandFinal?.id ?? null;
          data.nextSlotWin = "B";
        } else {
          const lNext = lowerByRound.get(lr + 1) ?? [];
          const isConsolidation = lr % 2 === 1;
          if (isConsolidation) {
            const nextMatch = lNext.find(m => m.positionInRound === lMatches[i].positionInRound);
            data.nextMatchWinId = nextMatch?.id ?? null;
            data.nextSlotWin = "A";
          } else {
            const nextPos = Math.floor(i / 2);
            const nextMatch = lNext.find(m => m.positionInRound === nextPos);
            data.nextMatchWinId = nextMatch?.id ?? null;
            data.nextSlotWin = i % 2 === 0 ? "A" : "B";
          }
        }
        await tx.match.update({ where: { id: lMatches[i].id }, data });
      }
    }
  }, { timeout: 15000 });

  revalidatePath(`/tournament/${id}`);
  return { ok: true };
}

export async function importTeamsAction(id: string, raw: string) {
  const denied = await requireTournamentOrgaAccess(id);
  if (denied) return denied;

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
  const denied = await requireTournamentOrgaAccess(id);
  if (denied) return denied;

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: { teams: { where: { selected: true } }, matches: true }
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

  // Stop generating rounds if we've reached the configured limit
  const maxRounds = (tournament as any).swissRounds ?? 5;
  if (existingRounds >= maxRounds) {
    return { error: `Tous les ${maxRounds} tours Swiss sont terminés.` };
  }

  const standings = computeStandings(tournament.teams, swissMatches, tournament.scoringSystem);
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
  const denied = await requireTournamentOrgaAccess(id);
  if (denied) return denied;

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
  const denied = await requireTournamentOrgaAccess(id);
  if (denied) return denied;

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

  // Déverrouiller sans toucher aux matchs — la régénération se fait via les boutons dédiés
  await prisma.tournament.update({ where: { id }, data: { locked: false } });

  revalidatePath(`/tournament/${id}`);
  return { ok: true, locked: false };
}

export async function addSponsorAction(
  tournamentId: string,
  name: string,
  url: string | null,
  logoPath: string | null
): Promise<{ ok?: boolean; error?: string }> {
  const denied = await requireTournamentOrgaAccess(tournamentId);
  if (denied) return denied;

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
  const denied = await requireTournamentOrgaAccess(tournamentId);
  if (denied) return denied;

  await prisma.sponsor.delete({ where: { id: sponsorId } });
  revalidatePath(`/tournament/${tournamentId}`);
  revalidatePath(`/tournament/${tournamentId}/edit`);
  return { ok: true };
}

export async function deleteFreeAgentAction(
  freeAgentId: string,
  tournamentId: string
): Promise<{ ok?: boolean; error?: string }> {
  const denied = await requireTournamentOrgaAccess(tournamentId);
  if (denied) return denied;

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
  const denied = await requireTournamentOrgaAccess(tournamentId);
  if (denied) return denied;

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
  const denied = await requireTournamentOrgaAccess(tournamentId);
  if (denied) return denied;

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { selected: true, waitlistPosition: true },
  });

  // Supprimer les relations avant l'équipe
  await prisma.teamPlayer.deleteMany({ where: { teamId } });
  await prisma.poolTeam.deleteMany({ where: { teamId } });
  await prisma.match.updateMany({ where: { teamAId: teamId }, data: { teamAId: null } });
  await prisma.match.updateMany({ where: { teamBId: teamId }, data: { teamBId: null } });
  await prisma.team.delete({ where: { id: teamId } });

  // Dans tous les cas : remettre toutes les équipes non-sélectionnées en pool libre
  // (waitlistPosition = null) pour relancer un tirage propre
  await prisma.team.updateMany({
    where: { tournamentId, selected: false },
    data: { waitlistPosition: null },
  });

  revalidatePath(`/tournament/${tournamentId}/edit`);
  revalidatePath(`/tournament/${tournamentId}`);
  return { ok: true };
}

export async function removePlayerFromTeamAction(
  teamPlayerId: string,
  tournamentId: string
): Promise<{ ok?: boolean; error?: string }> {
  const denied = await requireTournamentOrgaAccess(tournamentId);
  if (denied) return denied;

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
  const denied = await requireTournamentOrgaAccess(tournamentId);
  if (denied) return denied;

  await prisma.team.update({ where: { id: teamId }, data: { selected } });
  return { ok: true };
}

export async function toggleTeamGuaranteedAction(
  teamId: string,
  tournamentId: string,
  guaranteed: boolean
): Promise<{ ok?: boolean; error?: string }> {
  "use server";
  const denied = await requireTournamentOrgaAccess(tournamentId);
  if (denied) return denied;

  await prisma.team.update({
    where: { id: teamId },
    data: { guaranteed, ...(guaranteed ? { selected: true } : {}) },
  });
  // Quand on retire un garanti, remettre toutes les WL en pool libre
  if (!guaranteed) {
    await prisma.team.updateMany({
      where: { tournamentId, selected: false },
      data: { waitlistPosition: null },
    });
  }
  return { ok: true };
}

export async function drawTeamsAction(
  tournamentId: string,
  count: number,
  preDrawnIds?: string[]
): Promise<{ ok?: boolean; error?: string }> {
  const denied = await requireTournamentOrgaAccess(tournamentId);
  if (denied) return denied;

  const teams = await prisma.team.findMany({ where: { tournamentId }, select: { id: true, guaranteed: true } });

  const guaranteed = teams.filter((t) => t.guaranteed);
  const guaranteedIds = new Set(guaranteed.map((t) => t.id));

  let selectedIds: Set<string>;
  if (preDrawnIds && preDrawnIds.length > 0) {
    // Le client a déjà fait le tirage — on valide juste que les IDs appartiennent au tournoi
    const validIds = new Set(teams.map((t) => t.id));
    selectedIds = new Set([...guaranteedIds, ...preDrawnIds.filter((id) => validIds.has(id))]);
  } else {
    const pool = teams.filter((t) => !t.guaranteed);
    const slotsLeft = Math.max(0, count - guaranteed.length);
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const drawnIds = new Set(shuffled.slice(0, slotsLeft).map((t) => t.id));
    selectedIds = new Set([...drawnIds, ...guaranteedIds]);
  }

  await prisma.team.updateMany({
    where: { tournamentId, id: { in: Array.from(selectedIds) } },
    data: { selected: true, guaranteed: true },
  });
  await prisma.team.updateMany({
    where: { tournamentId, id: { notIn: Array.from(selectedIds) } },
    data: { selected: false, guaranteed: false },
  });
  return { ok: true };
}

/**
 * Tirage unitaire : tire 1 équipe au hasard parmi les candidateIds fournis
 * et la passe guaranteed=true, selected=true.
 */
export async function drawOneTeamAction(
  tournamentId: string,
  candidateIds: string[]
): Promise<{ ok?: boolean; winnerId?: string; error?: string }> {
  const denied = await requireTournamentOrgaAccess(tournamentId);
  if (denied) return denied;

  if (candidateIds.length === 0) return { error: "Aucune équipe candidate." };

  // Vérifie que ces équipes appartiennent bien au tournoi et ne sont pas déjà garanties
  const valid = await prisma.team.findMany({
    where: { tournamentId, id: { in: candidateIds }, guaranteed: false },
    select: { id: true },
  });
  if (valid.length === 0) return { error: "Aucune équipe valide dans le tirage." };

  const winner = valid[Math.floor(Math.random() * valid.length)];
  const [winnerTeam, tournament] = await Promise.all([
    prisma.team.findUnique({ where: { id: winner.id }, select: { name: true } }),
    prisma.tournament.findUnique({ where: { id: tournamentId }, select: { name: true, slug: true } }),
  ]);
  await prisma.team.update({
    where: { id: winner.id },
    data: { guaranteed: true, selected: true },
  });
  await notifyTeamPlayers(winner.id, "TEAM_SELECTED", {
    teamName: winnerTeam?.name ?? "",
    tournamentName: tournament?.name ?? "",
    tournamentId,
    tournamentSlug: tournament?.slug ?? "",
  });
  return { ok: true, winnerId: winner.id };
}

/**
 * Tirage waiting list : tire 1 équipe au hasard parmi les candidateIds,
 * lui assigne le prochain rang de waiting list (1, 2, 3…).
 */
export async function drawOneWaitlistAction(
  tournamentId: string,
  candidateIds: string[]
): Promise<{ ok?: boolean; winnerId?: string; waitlistPosition?: number; error?: string }> {
  const denied = await requireTournamentOrgaAccess(tournamentId);
  if (denied) return denied;

  if (candidateIds.length === 0) return { error: "Aucune équipe candidate." };

  const valid = await prisma.team.findMany({
    where: { tournamentId, id: { in: candidateIds }, guaranteed: false, waitlistPosition: null },
    select: { id: true },
  });
  if (valid.length === 0) return { error: "Aucune équipe valide dans le tirage." };

  // Prochain rang = max actuel + 1
  const maxRank = await prisma.team.aggregate({
    where: { tournamentId, waitlistPosition: { not: null } },
    _max: { waitlistPosition: true },
  });
  const nextRank = (maxRank._max.waitlistPosition ?? 0) + 1;

  const winner = valid[Math.floor(Math.random() * valid.length)];
  const [winnerTeam, tournament] = await Promise.all([
    prisma.team.findUnique({ where: { id: winner.id }, select: { name: true } }),
    prisma.tournament.findUnique({ where: { id: tournamentId }, select: { name: true, slug: true } }),
  ]);
  await prisma.team.update({
    where: { id: winner.id },
    data: { waitlistPosition: nextRank, selected: false },
  });
  await notifyTeamPlayers(winner.id, "TEAM_WAITLISTED", {
    teamName: winnerTeam?.name ?? "",
    tournamentName: tournament?.name ?? "",
    tournamentId,
    tournamentSlug: tournament?.slug ?? "",
    rank: nextRank,
  });
  return { ok: true, winnerId: winner.id, waitlistPosition: nextRank };
}

/**
 * Retire une équipe de la waiting list (remet waitlistPosition à null)
 * et renuméroté les équipes restantes.
 */
export async function removeFromWaitlistAction(
  tournamentId: string,
  teamId: string
): Promise<{ ok?: boolean; error?: string }> {
  const denied = await requireTournamentOrgaAccess(tournamentId);
  if (denied) return denied;

  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { waitlistPosition: true } });
  if (!team || team.waitlistPosition === null) return { error: "Équipe introuvable ou pas en WL." };

  const removedRank = team.waitlistPosition;
  await prisma.team.update({ where: { id: teamId }, data: { waitlistPosition: null } });

  // Renuméroter les équipes avec un rang supérieur
  const toRenumber = await prisma.team.findMany({
    where: { tournamentId, waitlistPosition: { gt: removedRank } },
    select: { id: true, waitlistPosition: true },
    orderBy: { waitlistPosition: "asc" },
  });
  for (const t of toRenumber) {
    await prisma.team.update({ where: { id: t.id }, data: { waitlistPosition: (t.waitlistPosition ?? 0) - 1 } });
  }

  return { ok: true };
}

export async function addPlayerToTeamAction(
  teamId: string,
  tournamentId: string,
  playerData: { type: "existing"; playerId: string } | { type: "manual"; name: string; city?: string | null; country: string }
): Promise<{ ok?: boolean; error?: string }> {
  const denied = await requireTournamentOrgaAccess(tournamentId);
  if (denied) return denied;

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

export async function createTeamAction(
  tournamentId: string,
  name: string
): Promise<{ ok?: boolean; error?: string }> {
  const denied = await requireTournamentOrgaAccess(tournamentId);
  if (denied) return denied;

  const trimmed = name.trim();
  if (!trimmed) return { error: "Le nom ne peut pas être vide." };

  const maxSeed = await prisma.team.aggregate({
    where: { tournamentId },
    _max: { seed: true },
  });
  const nextSeed = (maxSeed._max.seed ?? 0) + 1;

  await prisma.team.create({
    data: { tournamentId, name: trimmed, seed: nextSeed },
  });

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
  const denied = await requireTournamentOrgaAccess(id);
  if (denied) return denied;

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

/**
 * Lance le tournoi : verrouille, passe en LIVE, génère les poules/swiss (samedi).
 */
export async function launchTournamentAction(
  id: string
): Promise<{ ok?: boolean; error?: string }> {
  const denied = await requireTournamentOrgaAccess(id);
  if (denied) return denied;

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: { teams: { where: { selected: true } }, matches: { select: { id: true } } },
  });
  if (!tournament) return { error: "Tournoi introuvable." };
  if (tournament.status === "LIVE" && tournament.matches.length > 0) return { error: "Le tournoi est déjà en cours avec des matchs." };
  if (tournament.status === "COMPLETED") return { error: "Le tournoi est déjà terminé." };

  const selectedCount = tournament.teams.length;
  if (selectedCount < 3) return { error: `Pas assez d'équipes sélectionnées (${selectedCount}). Minimum 3.` };

  // Verrouiller + passer LIVE
  await prisma.tournament.update({
    where: { id },
    data: { status: "LIVE", locked: true },
  });

  // Générer les matchs selon le format choisi
  // Berlin Mixed: pas de matchs auto-générés au lancement — l'orga gère manuellement via BerlinMixedActions
  if (tournament.saturdayFormat === "SWISS") {
    const res = await generateSwissRoundAction(id);
    if ("error" in res && res.error) return { error: `Lancement OK mais erreur Swiss : ${res.error}` };
  } else if (tournament.saturdayFormat !== "BERLIN_MIXED") {
    const res = await generatePoolsAction(id);
    if ("error" in res && res.error) return { error: `Lancement OK mais erreur Poules : ${res.error}` };
  }

  revalidatePath(`/tournament/${id}`);
  revalidatePath(`/tournament/${id}/edit`);
  return { ok: true };
}

/**
 * Reset tournament: delete all matches/pools, unlock, revert to UPCOMING.
 */
export async function resetTournamentAction(
  id: string
): Promise<{ ok?: boolean; error?: string }> {
  const denied = await requireTournamentOrgaAccess(id);
  if (denied) return denied;

  const tournament = await prisma.tournament.findUnique({ where: { id } });
  if (!tournament) return { error: "Tournoi introuvable." };
  if (tournament.status === "COMPLETED") return { error: "Impossible de reset un tournoi terminé." };

  await prisma.$transaction(async (tx) => {
    await tx.matchEvent.deleteMany({ where: { match: { tournamentId: id } } });
    await tx.match.deleteMany({ where: { tournamentId: id } });
    await tx.poolTeam.deleteMany({ where: { pool: { tournamentId: id } } });
    await tx.pool.deleteMany({ where: { tournamentId: id } });
    await tx.tournament.update({
      where: { id },
      data: { status: "UPCOMING", locked: false },
    });
  }, { timeout: 15000 });

  revalidatePath(`/tournament/${id}`);
  revalidatePath(`/tournament/${id}/edit`);
  return { ok: true };
}

export async function saveInfoTilesLayoutAction(
  tournamentId: string,
  layout: unknown
): Promise<{ ok?: boolean; error?: string }> {
  const denied = await requireTournamentOrgaAccess(tournamentId);
  if (denied) return denied;

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
