"use server";

import { prisma } from "@/lib/db";
import { z } from "zod";
import { generateTournamentSlug } from "@/lib/slug";
import { revalidatePath } from "next/cache";
import { notifyTeamPlayers } from "@/lib/notify";
import { INFO_TILE_KEYS } from "@/lib/infoTilesDefaults";
import { generatePools, generatePoolMatches, generateBracket, generateSwissRound, generateCrossPoolMatches, nextPowerOf2 } from "@/lib/bracket";
import { generateGrazPools, generateGrazPoolRounds, assignRegroupTeamIds, buildPlayedPairs, generateRegroupMatches, selectSETeams, generateGrazSE } from "@/lib/graz";
import { splitMtpPools, generateMtpPool, generateMtpSwissNextRound, generateMtpCrossPool, generateMtpBarrage, generateMtpDE, combineMtpStandings } from "@/lib/mtp";
import { computeStandings } from "@/lib/standings";
import { computeCareerBadges } from "@/lib/achievements";
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
  streamCourt1Url: z.string().optional().nullable(),
  streamCourt2Url: z.string().optional().nullable(),
  streamMultiplexUrl: z.string().optional().nullable(),
  chatMode: z.enum(["OPEN", "ORG_ONLY", "DISABLED"]).default("DISABLED"),
  saturdayFormat: z.enum(["ALL_DAY", "SPLIT_POOLS", "SWISS", "BERLIN_MIXED", "GRAZ", "MTP_OPEN"]),
  poolCount: z.coerce.number().int().min(1).max(4).default(1),
  crossPool: z.preprocess((v) => v === "true" || v === true, z.boolean().default(false)),
  swissRounds: z.coerce.number().int().min(1).max(20).default(5),
  poolRounds: z.preprocess((v) => (v === "" || v === null || v === undefined ? null : Number(v)), z.number().int().min(1).max(50).nullable().default(null)),
  bracketSize: z.coerce.number().int().min(2).max(64).default(16),
  sundayFormat: z.enum(["SE", "DE", "RR", "SWISS_SPLIT_SE", "SPLIT_SE"]),
  scoringSystem: z.string().default("3/1"),
  thirdPlaceMatch: z.preprocess((v) => v === "true" || v === true, z.boolean().default(false)),
  gfReset: z.preprocess((v) => v === "true" || v === true, z.boolean().default(false)),
  status: z.enum(["UPCOMING", "LIVE", "COMPLETED"]),
  locked: z.preprocess((v) => v === "true" || v === true, z.boolean().default(false)),
  accommodationAvailable: z.preprocess((v) => v === "true" || v === true, z.boolean().default(false)),
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
  testMode: z.preprocess(
    (v) => v === "true" || v === true,
    z.boolean().default(false)
  ),
  hidden: z.preprocess(
    (v) => v === "true" || v === true,
    z.boolean().default(false)
  ),
  mtpPoolAStart: z.string().optional().nullable(),
  mtpPoolBStart: z.string().optional().nullable(),
  mtpSundayStart: z.string().optional().nullable(),
  externalRegistrationUrl: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? null : v),
    z.string().url().nullable()
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
  const { id: _id, locked: _locked, links: _links, meals: _meals, faq: _faq, accommodationCapacity: _ac, telegramUrl: _tg, swissRounds: _sr, poolRounds: _pr, bracketSize: _bs, chatMode: _cm, streamYoutubeUrl: _syu, saturdayFormat: _sf, sundayFormat: _df, scoringSystem: _ss, thirdPlaceMatch: _tpm, gfReset: _gfr, poolCount: _pc, crossPool: _cp, status: _statusFromForm, mtpPoolAStart: _mpa, mtpPoolBStart: _mpb, mtpSundayStart: _mps, ...rest } = data;

  // Status transitions allowed via edit form (all directions allowed for orga flexibility)
  let statusUpdate: "UPCOMING" | "LIVE" | "COMPLETED" | undefined;
  statusUpdate = data.status;

  const dateStart = new Date(data.dateStart);
  // Regenerate slug if name or city changed (only if tournament has no slug yet, or name/city changed)
  const existing = await prisma.tournament.findUnique({ where: { id: data.id }, select: { slug: true, name: true, city: true } });
  const needsNewSlug = !existing?.slug || existing.name !== data.name || existing.city !== data.city;
  const slug = needsNewSlug
    ? await generateTournamentSlug(data.name, data.city, dateStart.getFullYear(), data.id)
    : existing.slug;

  // Auto-geocode if city or country changed, or tournament has no coords yet
  let geoLat = tournament.lat;
  let geoLng = tournament.lng;
  if (tournament.city !== data.city || tournament.country !== data.country || (geoLat == null && geoLng == null)) {
    try {
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(data.city + ", " + data.country)}`,
        { headers: { "User-Agent": "bikepolo-app" } }
      );
      const geoData = await geoRes.json();
      if (geoData[0]) {
        geoLat = parseFloat(geoData[0].lat);
        geoLng = parseFloat(geoData[0].lon);
      }
    } catch { /* geocoding is best-effort */ }
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.tournament.update as any)({
      where: { id: data.id },
      data: {
        ...rest,
        status: statusUpdate,
        slug,
        lat: geoLat,
        lng: geoLng,
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
        streamCourt1Url: data.streamCourt1Url || null,
        streamCourt2Url: data.streamCourt2Url || null,
        streamMultiplexUrl: data.streamMultiplexUrl || null,
        swissRounds: data.swissRounds,
        poolRounds: data.poolRounds ?? null,
        bracketSize: data.bracketSize,
        chatMode: data.chatMode,
        saturdayFormat: data.saturdayFormat,
        poolCount: data.poolCount,
        crossPool: data.crossPool,
        sundayFormat: data.sundayFormat,
        scoringSystem: data.scoringSystem,
        thirdPlaceMatch: data.thirdPlaceMatch,
        gfReset: data.gfReset,
        testMode: data.testMode,
        hidden: data.hidden,
        mtpPoolAStart: data.mtpPoolAStart ? new Date(data.mtpPoolAStart) : null,
        mtpPoolBStart: data.mtpPoolBStart ? new Date(data.mtpPoolBStart) : null,
        mtpSundayStart: data.mtpSundayStart ? new Date(data.mtpSundayStart) : null,
        externalRegistrationUrl: data.externalRegistrationUrl ?? null,
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

  const isMazza = tournament.sundayFormat === "SPLIT_SE";
  // Mazza sequential: single court (pools play one after the other, not in parallel)
  const courtNames = isMazza
    ? ["Court 1"]
    : Array.from({ length: tournament.courtsCount }, (_, i) => `Court ${i + 1}`);
  const poolStartAt = (tournament as any).saturdayPoolAStart
    ? new Date((tournament as any).saturdayPoolAStart)
    : new Date(tournament.dateStart);
  const matches = generatePoolMatches(pools, courtNames, poolStartAt, tournament.gameDurationMin, { mazzaSequential: isMazza });

  await prisma.$transaction(async (tx) => {
    await tx.matchEvent.deleteMany({ where: { match: { tournamentId: id, phase: "POOL" } } });
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
    await tx.matchEvent.deleteMany({ where: { match: { tournamentId: id, phase: "BRACKET" } } });
    await tx.match.deleteMany({ where: { tournamentId: id, phase: "BRACKET" } });

    // First pass: create all matches
    const created: Array<{ id: string; roundIndex: number; bracketSide: string | null; positionInRound: number; teamAId: string | null; teamBId: string | null }> = [];
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
      created.push({ id: m.id, roundIndex: m.roundIndex, bracketSide: m.bracketSide, positionInRound: m.positionInRound, teamAId: m.teamAId, teamBId: m.teamBId });
    }

    // Helper: find a match by side+round+position
    const findMatch = (side: string | null, round: number, pos: number) =>
      created.find((m) => m.bracketSide === side && m.roundIndex === round && m.positionInRound === pos);

    if (tournament.sundayFormat === "SE" || tournament.sundayFormat === "SWISS_SPLIT_SE") {
      // Single Elimination linking: Round r, position p → feeds Round r+1, position floor(p/2)
      // SWISS_SPLIT_SE: Top 10 uses W/G/L sides, Bottom 8 uses B/BG/BL sides
      // Each bracket is independent, no linking between them

      // Top 10: W = normal rounds, G = final, L = 3rd place
      // "W" matches feed into next "W" match (or "G" final in last round)
      const wMatches = created.filter(m => m.bracketSide === "W");
      const wAndG = created.filter(m => m.bracketSide === "W" || m.bracketSide === "G");

      if (wMatches.length > 0) {
        const maxWRound = Math.max(...wAndG.map((m) => m.roundIndex));
        for (const m of wMatches) {
          if (m.roundIndex < maxWRound) {
            const nextPos = Math.floor(m.positionInRound / 2);
            const nextRound = m.roundIndex + 1;
            const nextMatch = created.find(
              (x) => (x.bracketSide === "W" || x.bracketSide === "G") && x.roundIndex === nextRound && x.positionInRound === nextPos
            );
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

        // Link semifinal losers → 3rd place match (L)
        const thirdPlaceW = created.find(m => m.bracketSide === "L");
        if (thirdPlaceW) {
          const semiRound = thirdPlaceW.roundIndex;
          const semis = wMatches.filter(m => m.roundIndex === semiRound - 1 ||
            (m.roundIndex === maxWRound - 1 && created.find(x => x.bracketSide === "G" && x.roundIndex === m.roundIndex + 1)));
          // Find the two W matches whose winners go to the G final
          const gFinal = created.filter(m => m.bracketSide === "G").sort((a, b) => a.roundIndex - b.roundIndex)[0];
          const semiMatches = gFinal
            ? wMatches.filter(m => m.roundIndex === gFinal.roundIndex - 1)
            : [];
          for (const m of semiMatches) {
            await tx.match.update({
              where: { id: m.id },
              data: {
                nextMatchLoseId: thirdPlaceW.id,
                nextSlotLose: m.positionInRound % 2 === 0 ? "A" : "B",
              }
            });
          }
        }
      }

      // Bottom 8: B = normal rounds, BG = final, BL = 3rd place
      // "B" matches feed into next "B" match (or "BG" final in last round)
      const bMatches = created.filter(m => m.bracketSide === "B");
      const bAndBG = created.filter(m => m.bracketSide === "B" || m.bracketSide === "BG");

      if (bMatches.length > 0) {
        const maxBRound = Math.max(...bAndBG.map((m) => m.roundIndex));
        for (const m of bMatches) {
          if (m.roundIndex < maxBRound) {
            const nextPos = Math.floor(m.positionInRound / 2);
            const nextRound = m.roundIndex + 1;
            const nextMatch = created.find(
              (x) => (x.bracketSide === "B" || x.bracketSide === "BG") && x.roundIndex === nextRound && x.positionInRound === nextPos
            );
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

        // Link semifinal losers → 3rd place match (BL)
        const thirdPlaceB = created.find(m => m.bracketSide === "BL");
        if (thirdPlaceB) {
          const bgFinal = created.find(m => m.bracketSide === "BG");
          const semiMatches = bgFinal
            ? bMatches.filter(m => m.roundIndex === bgFinal.roundIndex - 1)
            : [];
          for (const m of semiMatches) {
            await tx.match.update({
              where: { id: m.id },
              data: {
                nextMatchLoseId: thirdPlaceB.id,
                nextSlotLose: m.positionInRound % 2 === 0 ? "A" : "B",
              }
            });
          }
        }
      }

    }

    if (tournament.sundayFormat === "SPLIT_SE") {
      // ── SPLIT_SE Linking ──────────────────────────────────────────────────
      // R1 (round 1, side R1): 8 matches
      // R1 winners → Winners bracket round 2 (W), 1v8→W[0], 2v7→W[1], 3v6→W[2], 4v5→W[3]
      // R1 losers  → Losers bracket round 2 (L), mirrored: L[3], L[2], L[1], L[0]
      // W round 2 winners → W round 3, W round 3 winners → G round 4
      // L round 2 winners → L round 3, L round 3 winners → LG round 4

      const r1 = created.filter(m => m.bracketSide === "R1").sort((a, b) => a.positionInRound - b.positionInRound);
      const wR2 = created.filter(m => m.bracketSide === "W" && m.roundIndex === 2).sort((a, b) => a.positionInRound - b.positionInRound);
      const wR3 = created.filter(m => m.bracketSide === "W" && m.roundIndex === 3).sort((a, b) => a.positionInRound - b.positionInRound);
      const gR4 = created.find(m => m.bracketSide === "G" && m.roundIndex === 4);
      const lR2 = created.filter(m => m.bracketSide === "L" && m.roundIndex === 2).sort((a, b) => a.positionInRound - b.positionInRound);
      const lR3 = created.filter(m => m.bracketSide === "L" && m.roundIndex === 3).sort((a, b) => a.positionInRound - b.positionInRound);
      const lgR4 = created.find(m => m.bracketSide === "LG" && m.roundIndex === 4);

      // R1 (8 matches) → W R2 (4 matches): pairs 0+1→wR2[0], 2+3→wR2[1], 4+5→wR2[2], 6+7→wR2[3]
      // R1 (8 matches) → L R2 (4 matches): mirrored pairs 6+7→lR2[0], 4+5→lR2[1], 2+3→lR2[2], 0+1→lR2[3]
      for (let i = 0; i < r1.length; i++) {
        const wNext = wR2[Math.floor(i / 2)];
        const mirrorI = r1.length - 1 - i;
        const lNext = lR2[Math.floor(mirrorI / 2)];
        if (wNext) await tx.match.update({ where: { id: r1[i].id }, data: { nextMatchWinId: wNext.id, nextSlotWin: i % 2 === 0 ? "A" : "B" } });
        if (lNext) await tx.match.update({ where: { id: r1[i].id }, data: { nextMatchLoseId: lNext.id, nextSlotLose: mirrorI % 2 === 0 ? "A" : "B" } });
      }
      // W R2 → W R3
      for (let i = 0; i < wR2.length; i++) {
        const next = wR3[Math.floor(i / 2)];
        if (next) await tx.match.update({ where: { id: wR2[i].id }, data: { nextMatchWinId: next.id, nextSlotWin: i % 2 === 0 ? "A" : "B" } });
      }
      // W R3 → G R4
      for (let i = 0; i < wR3.length; i++) {
        if (gR4) await tx.match.update({ where: { id: wR3[i].id }, data: { nextMatchWinId: gR4.id, nextSlotWin: i % 2 === 0 ? "A" : "B" } });
      }
      // L R2 → L R3
      for (let i = 0; i < lR2.length; i++) {
        const next = lR3[Math.floor(i / 2)];
        if (next) await tx.match.update({ where: { id: lR2[i].id }, data: { nextMatchWinId: next.id, nextSlotWin: i % 2 === 0 ? "A" : "B" } });
      }
      // L R3 → LG R4
      for (let i = 0; i < lR3.length; i++) {
        if (lgR4) await tx.match.update({ where: { id: lR3[i].id }, data: { nextMatchWinId: lgR4.id, nextSlotWin: i % 2 === 0 ? "A" : "B" } });
      }
      // W R3 losers → WL R5 (3rd place Winners bracket)
      const wlR5 = created.find(m => m.bracketSide === "WL" && m.roundIndex === 5);
      for (let i = 0; i < wR3.length; i++) {
        if (wlR5) await tx.match.update({ where: { id: wR3[i].id }, data: { nextMatchLoseId: wlR5.id, nextSlotLose: i % 2 === 0 ? "A" : "B" } });
      }
      // L R3 losers → LL R5 (3rd place Losers bracket)
      const llR5 = created.find(m => m.bracketSide === "LL" && m.roundIndex === 5);
      for (let i = 0; i < lR3.length; i++) {
        if (llR5) await tx.match.update({ where: { id: lR3[i].id }, data: { nextMatchLoseId: llR5.id, nextSlotLose: i % 2 === 0 ? "A" : "B" } });
      }
    }

    if (tournament.sundayFormat === "DE") {
      // ── DE Linking — slot-reservation approach ──────────────────────────
      // Uses a claimed-slot map to avoid collisions. WB losers claim their LB
      // slots first, then LB winners fill remaining free slots.

      const N = seededTeams.length;
      const size = nextPowerOf2(N);
      const upperRounds = Math.log2(size);
      const w2 = size / 4;

      const grandFinal = created.filter(m => m.bracketSide === "G").sort((a, b) => a.roundIndex - b.roundIndex)[0];
      const maxLR = Math.max(...created.filter(m => m.bracketSide === "L").map(m => m.roundIndex), 0);

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

      const lbRounds = [...lowerByRound.keys()].sort((a, b) => a - b);

      // ── Classify r2Pos branches ───────────────────────────────────────
      const wbR1Matches = upperByRound.get(1) ?? [];
      const wbR1RealPositions = wbR1Matches.map(m => m.positionInRound);

      const r2PosWithR1Loser = new Map<number, number[]>();
      for (const pos of wbR1RealPositions) {
        const r2Pos = Math.floor(pos / 2);
        if (!r2PosWithR1Loser.has(r2Pos)) r2PosWithR1Loser.set(r2Pos, []);
        r2PosWithR1Loser.get(r2Pos)!.push(pos);
      }

      const lbR1InjectionR2Pos: number[] = [];
      const lbR1ConsolidationR2Pos: number[] = [];
      const lbR1ByeR2Pos: number[] = [];
      const lbR1R2PosOrder: number[] = [];
      for (let r2Pos = 0; r2Pos < w2; r2Pos++) {
        const count = (r2PosWithR1Loser.get(r2Pos) ?? []).length;
        if (count >= 2) lbR1ConsolidationR2Pos.push(r2Pos);
        else if (count === 1) lbR1InjectionR2Pos.push(r2Pos);
        else lbR1ByeR2Pos.push(r2Pos);
        if (count > 0) lbR1R2PosOrder.push(r2Pos);
      }
      const lbR1Count = lbR1R2PosOrder.length;

      // ── Slot reservation tracking ─────────────────────────────────────
      const claimed = new Set<string>();
      function claimSlot(matchId: string, slot: "A" | "B") {
        claimed.add(`${matchId}:${slot}`);
      }
      function findFreeSlot(matchId: string): "A" | "B" | null {
        if (!claimed.has(`${matchId}:A`)) return "A";
        if (!claimed.has(`${matchId}:B`)) return "B";
        return null;
      }

      // ── Build wbToLBRound mapping ─────────────────────────────────────
      const lbR2Teams = lbR1Count + lbR1ConsolidationR2Pos.length + lbR1ByeR2Pos.length;
      const lbR2RoundIdx = lbR1Count > 0 ? 2 : 1;
      const lbR2Count = (lowerByRound.get(lbR2RoundIdx) ?? []).length;

      const wbToLBRound = new Map<number, number>();
      wbToLBRound.set(2, lbR2RoundIdx);
      {
        let lbSurvivors = lbR2Count + (lbR2Teams % 2);
        let lbRI = lbR2RoundIdx + 1;
        for (let k = 3; k <= upperRounds; k++) {
          const wbCount = size / Math.pow(2, k);
          wbToLBRound.set(k, lbRI);
          const injCount = Math.min(lbSurvivors, wbCount);
          lbSurvivors = injCount + Math.abs(lbSurvivors - wbCount);
          lbRI++;
          if (k < upperRounds && lbSurvivors > 1) {
            lbSurvivors = Math.floor(lbSurvivors / 2) + (lbSurvivors % 2);
            lbRI++;
          }
        }
      }

      // ── WB R1: winners → WB R2, losers → LB R1 ───────────────────────
      // WB R1 positionInRound uses absolute bracket positions (0..size/2-1),
      // but WB R2 uses compact positions (0..w2-1).
      // Strategy: sort WB R1 by position, then the i-th WB R1 feeds WB R2[floor(i/2)].
      const wbR2Matches = upperByRound.get(2) ?? [];
      const lbR1Matches = lowerByRound.get(1) ?? [];

      for (let wi = 0; wi < wbR1Matches.length; wi++) {
        const m = wbR1Matches[wi]; // already sorted by positionInRound
        const pos = m.positionInRound;
        const r2Pos = Math.floor(pos / 2); // absolute r2Pos in size/4 space
        const data: Record<string, unknown> = {};

        // WB R2 match index = r2Pos (compact index equals absolute r2Pos for WB R2)
        const nextWBMatch = wbR2Matches[r2Pos];
        if (nextWBMatch) {
          data.nextMatchWinId = nextWBMatch.id;
          // Pre-claim slots already filled by BYE advances (teamAId/teamBId set at creation)
          if (nextWBMatch.teamAId) claimSlot(nextWBMatch.id, "A");
          if (nextWBMatch.teamBId) claimSlot(nextWBMatch.id, "B");
          const freeSlot = findFreeSlot(nextWBMatch.id) ?? "B";
          data.nextSlotWin = freeSlot;
          claimSlot(nextWBMatch.id, freeSlot);
        }

        const lbR1Idx = lbR1R2PosOrder.indexOf(r2Pos);
        if (lbR1Idx >= 0 && lbR1Matches[lbR1Idx]) {
          const r1LosersForR2Pos = r2PosWithR1Loser.get(r2Pos) ?? [];
          if (r1LosersForR2Pos.length >= 2) {
            const posInPair = r1LosersForR2Pos.indexOf(pos);
            const slot: "A" | "B" = posInPair === 0 ? "A" : "B";
            data.nextMatchLoseId = lbR1Matches[lbR1Idx].id;
            data.nextSlotLose = slot;
            claimSlot(lbR1Matches[lbR1Idx].id, slot);
          } else {
            data.nextMatchLoseId = lbR1Matches[lbR1Idx].id;
            data.nextSlotLose = "B";
            claimSlot(lbR1Matches[lbR1Idx].id, "B");
          }
        }

        await tx.match.update({ where: { id: m.id }, data });
      }

      // ── WB R3+ losers → LB injection rounds, slot B (claim first) ────
      for (let k = 3; k <= upperRounds; k++) {
        const uMatches = upperByRound.get(k) ?? [];
        const nextWB = upperByRound.get(k + 1);
        const maxWB = Math.max(...[...upperByRound.keys()]);
        const lbTargetRound = wbToLBRound.get(k);
        const lbTargetMatches = lbTargetRound !== undefined ? (lowerByRound.get(lbTargetRound) ?? []) : [];

        for (let i = 0; i < uMatches.length; i++) {
          const data: Record<string, unknown> = {};

          if (nextWB) {
            const target = nextWB.find(x => x.positionInRound === Math.floor(i / 2));
            if (target) { data.nextMatchWinId = target.id; data.nextSlotWin = i % 2 === 0 ? "A" : "B"; }
          } else if (grandFinal && k === maxWB) {
            data.nextMatchWinId = grandFinal.id;
            data.nextSlotWin = "A";
          }

          const target = lbTargetMatches[i];
          if (target) {
            data.nextMatchLoseId = target.id;
            data.nextSlotLose = "B";
            claimSlot(target.id, "B");
          }

          await tx.match.update({ where: { id: uMatches[i].id }, data });
        }
      }

      // ── WB R2 losers → LB R1 (injection) or LB R2 (free slot) ────────
      const lbR2Matches = lowerByRound.get(lbR2RoundIdx) ?? [];
      const wbR2Overflow: string[] = [];

      for (let i = 0; i < wbR2Matches.length; i++) {
        const m = wbR2Matches[i];
        const absR2Pos = i; // WB R2 compact index = absolute r2Pos (0..w2-1)
        const data: Record<string, unknown> = {};

        const nextWB = upperByRound.get(3);
        const maxWB = Math.max(...[...upperByRound.keys()]);
        if (nextWB) {
          const target = nextWB.find(x => x.positionInRound === Math.floor(i / 2));
          if (target) { data.nextMatchWinId = target.id; data.nextSlotWin = i % 2 === 0 ? "A" : "B"; }
        } else if (grandFinal && maxWB === 2) {
          data.nextMatchWinId = grandFinal.id;
          data.nextSlotWin = "A";
        }

        // Mirror: WB R2 at absR2Pos faces LB R1 at mirrored position (anti-rematch)
        const mirrorR2Pos = w2 - 1 - absR2Pos;
        const lbR1IdxForMirror = lbR1R2PosOrder.indexOf(mirrorR2Pos);

        if (lbR1IdxForMirror >= 0 && lbR1InjectionR2Pos.includes(mirrorR2Pos)) {
          if (lbR1Matches[lbR1IdxForMirror]) {
            data.nextMatchLoseId = lbR1Matches[lbR1IdxForMirror].id;
            data.nextSlotLose = "A";
            claimSlot(lbR1Matches[lbR1IdxForMirror].id, "A");
          }
        } else {
          // Find free slot in LB R2 (prefer slot B first, then slot A)
          let placed = false;
          for (let j = 0; j < lbR2Matches.length; j++) {
            const freeSlot = findFreeSlot(lbR2Matches[j].id);
            if (freeSlot === "B") {
              data.nextMatchLoseId = lbR2Matches[j].id;
              data.nextSlotLose = "B";
              claimSlot(lbR2Matches[j].id, "B");
              placed = true;
              break;
            }
          }
          if (!placed) {
            for (let j = 0; j < lbR2Matches.length; j++) {
              const freeSlot = findFreeSlot(lbR2Matches[j].id);
              if (freeSlot === "A") {
                data.nextMatchLoseId = lbR2Matches[j].id;
                data.nextSlotLose = "A";
                claimSlot(lbR2Matches[j].id, "A");
                placed = true;
                break;
              }
            }
          }
          if (!placed) {
            wbR2Overflow.push(m.id);
          }
        }

        await tx.match.update({ where: { id: m.id }, data });
      }

      // Handle WB R2 overflow: BYE past LB R2 → find first free slot in later LB rounds
      for (const overflowMatchId of wbR2Overflow) {
        for (const lr of lbRounds) {
          if (lr <= lbR2RoundIdx) continue;
          const roundMatches = lowerByRound.get(lr)!;
          let placed = false;
          for (const rm of roundMatches) {
            const freeSlot = findFreeSlot(rm.id);
            if (freeSlot) {
              await tx.match.update({ where: { id: overflowMatchId }, data: { nextMatchLoseId: rm.id, nextSlotLose: freeSlot } });
              claimSlot(rm.id, freeSlot);
              placed = true;
              break;
            }
          }
          if (placed) break;
        }
      }

      // ── LB: wire winners forward ──────────────────────────────────────
      // LB R1 winners → LB R2 slot A (one-to-one, deterministic)
      // All other LB rounds → find next round with free slot
      for (const lr of lbRounds) {
        const lMatches = lowerByRound.get(lr) ?? [];

        for (let i = 0; i < lMatches.length; i++) {
          if (lr === maxLR) {
            if (grandFinal) {
              await tx.match.update({ where: { id: lMatches[i].id }, data: { nextMatchWinId: grandFinal.id, nextSlotWin: "B" } });
            }
            continue;
          }

          // LB R1 → LB R2
          // Case A — consolidation branches (2 WB R1 losers): LBR1[i] → LBR2[i] slot A
          //           WB R2 loser will inject into LBR2[i] slot B
          // Case B — injection branches (1 WB R1 loser, WB R2 loser already consumed in LBR1):
          //           LBR1 survivors consolidate → LBR1[0]&[1] → LBR2[0], LBR1[2]&[3] → LBR2[1], etc.
          if (lr === 1) {
            const nextMatches = lowerByRound.get(lbR2RoundIdx) ?? [];
            let target: typeof nextMatches[0] | undefined;
            if (lbR1ConsolidationR2Pos.length > 0) {
              // Case A: 1-to-1 mapping
              target = nextMatches[i];
            } else {
              // Case B: consolidation of LB R1 survivors
              target = nextMatches[Math.floor(i / 2)];
            }
            if (target) {
              // Pre-claim slots filled by WB R2 losers (teamBId set)
              if (target.teamAId) claimSlot(target.id, "A");
              if (target.teamBId) claimSlot(target.id, "B");
              const slot = findFreeSlot(target.id) ?? "A";
              await tx.match.update({ where: { id: lMatches[i].id }, data: { nextMatchWinId: target.id, nextSlotWin: slot } });
              claimSlot(target.id, slot);
            }
            continue;
          }

          // All other LB rounds: find next round with a free slot
          let placed = false;
          for (const nextRound of lbRounds) {
            if (nextRound <= lr) continue;
            const nextMatches = lowerByRound.get(nextRound)!;
            for (const nm of nextMatches) {
              const freeSlot = findFreeSlot(nm.id);
              if (freeSlot) {
                await tx.match.update({ where: { id: lMatches[i].id }, data: { nextMatchWinId: nm.id, nextSlotWin: freeSlot } });
                claimSlot(nm.id, freeSlot);
                placed = true;
                break;
              }
            }
            if (placed) break;
          }

          if (!placed && grandFinal) {
            await tx.match.update({ where: { id: lMatches[i].id }, data: { nextMatchWinId: grandFinal.id, nextSlotWin: "B" } });
          }
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
    await tx.matchEvent.deleteMany({ where: { match: { tournamentId: id, phase: "CROSS_POOL" } } });
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
    await tx.matchEvent.deleteMany({ where: { match: { tournamentId: id, phase: "BRACKET" } } });
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
    // Delete only DE matches (round > 1 or bracketSide L/G), keep SE round 1 matches
    await tx.matchEvent.deleteMany({
      where: { match: { tournamentId: id, phase: "BRACKET", OR: [{ roundIndex: { gt: 1 } }, { bracketSide: "L" }, { bracketSide: "G" }] } }
    });
    await tx.match.deleteMany({
      where: { tournamentId: id, phase: "BRACKET", OR: [{ roundIndex: { gt: 1 } }, { bracketSide: "L" }, { bracketSide: "G" }] }
    });

    // Fetch the SE round 1 matches we kept
    const seMatches = await tx.match.findMany({
      where: { tournamentId: id, phase: "BRACKET", roundIndex: 1, bracketSide: "W" },
      orderBy: { positionInRound: "asc" },
    });

    // Shift DE roundIndex: upper bracket W gets +1, lower bracket L stays as-is, G stays as-is
    // This way SE is round 1, DE upper starts at round 2
    const created: Array<{ id: string; roundIndex: number; bracketSide: string | null; positionInRound: number }> = [];
    for (const match of deMatches) {
      const shiftedRoundIndex = match.bracketSide === "W" ? match.roundIndex + 1 : match.roundIndex;
      const m = await tx.match.create({
        data: {
          tournamentId: id,
          phase: "BRACKET",
          bracketSide: match.bracketSide ?? null,
          roundIndex: shiftedRoundIndex,
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

    // DE linking — same logic but on the shifted rounds
    const maxUR = Math.max(...created.filter(m => m.bracketSide === "W").map(m => m.roundIndex), 0);
    const minUR = Math.min(...created.filter(m => m.bracketSide === "W").map(m => m.roundIndex));
    const maxLR = Math.max(...created.filter(m => m.bracketSide === "L").map(m => m.roundIndex), 0);
    const grandFinal = created.filter(m => m.bracketSide === "G").sort((a, b) => a.roundIndex - b.roundIndex)[0];

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

    // Upper bracket linking (DE rounds, shifted by +1)
    const upperRoundKeys = Array.from(upperByRound.keys()).sort((a, b) => a - b);
    for (let idx = 0; idx < upperRoundKeys.length; idx++) {
      const ur = upperRoundKeys[idx];
      const uMatches = upperByRound.get(ur) ?? [];
      const nextUr = upperRoundKeys[idx + 1];
      const uNext = nextUr ? (upperByRound.get(nextUr) ?? []) : [];
      const isLastUpper = ur === maxUR;

      // For losers routing: map DE upper round index (1-based relative) to lower bracket round
      const relativeRound = idx + 1; // 1st DE upper round = 1, 2nd = 2, etc.
      let lrForLosers: number;
      if (relativeRound === 1) lrForLosers = 1;
      else lrForLosers = 2 * relativeRound - 2;
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
          if (relativeRound === 1) {
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

    // Link SE round 1 winners → DE upper bracket
    // For each SE match, find which DE match contains its winner (by teamId)
    // and set nextMatchWinId + nextSlotWin so the bracket tree draws connections.
    // We need to read the created DE matches from DB to get their teamAId/teamBId.
    const deAllMatches = await tx.match.findMany({
      where: { tournamentId: id, phase: "BRACKET", roundIndex: { gte: minUR }, bracketSide: "W" },
      orderBy: [{ roundIndex: "asc" }, { positionInRound: "asc" }],
    });
    // For each SE match, the winner's teamId tells us where they land in DE
    for (const se of seMatches) {
      if (!se.winnerTeamId) continue;
      // Find the DE match that has this winner as teamA or teamB
      for (const de of deAllMatches) {
        if (de.teamAId === se.winnerTeamId) {
          await tx.match.update({
            where: { id: se.id },
            data: { nextMatchWinId: de.id, nextSlotWin: "A" },
          });
          break;
        }
        if (de.teamBId === se.winnerTeamId) {
          await tx.match.update({
            where: { id: se.id },
            data: { nextMatchWinId: de.id, nextSlotWin: "B" },
          });
          break;
        }
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

  if (tournament.teams.length % 2 !== 0) {
    return { error: `Le format Swiss requiert un nombre pair d'équipes. Vous avez ${tournament.teams.length} équipes sélectionnées.` };
  }

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

  await prisma.matchEvent.deleteMany({ where: { match: { tournamentId: id, phase: "SWISS" } } });
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

  // Format-specific guards
  const poolCount = (tournament as any).poolCount ?? 2;

  // MTP_OPEN: lancer via les actions dédiées (launchMtpPoolAction, etc.)
  if ((tournament as any).saturdayFormat === "MTP_OPEN") {
    // Just set status to LIVE, no match generation here
    await prisma.tournament.update({ where: { id }, data: { status: "LIVE" } });
    revalidatePath(`/tournament/${id}`);
    revalidatePath(`/tournament/${id}/edit`);
    return { ok: true };
  }

  // Saturday format guards
  if (tournament.saturdayFormat === "SWISS" && selectedCount % 2 !== 0) {
    return { error: `Le format Swiss requiert un nombre pair d'équipes. Vous avez ${selectedCount} équipes sélectionnées.` };
  }
  if (tournament.saturdayFormat === "SPLIT_POOLS" && selectedCount < poolCount * 2) {
    return { error: `Le format ${poolCount} poules requiert au minimum ${poolCount * 2} équipes (2 par poule). Vous avez ${selectedCount} équipes.` };
  }
  if (tournament.saturdayFormat === "ALL_DAY" && selectedCount < 3) {
    return { error: `Le format Single Pool requiert au minimum 3 équipes. Vous avez ${selectedCount} équipes.` };
  }

  // Cross-pool balance guard
  if (tournament.crossPool && tournament.saturdayFormat === "SPLIT_POOLS") {
    const base = Math.floor(selectedCount / poolCount);
    const extra = selectedCount % poolCount;
    if (extra !== 0 && base === 0) {
      return { error: `Pas assez d'équipes pour ${poolCount} poules de cross-pool.` };
    }
    if (extra !== 0 && base < 2) {
      return { error: `Les poules de cross-pool sont trop inégales (${selectedCount} équipes, ${poolCount} poules). Ajoutez ou retirez des équipes pour équilibrer.` };
    }
  }

  // Sunday format guards
  if (tournament.sundayFormat === "SWISS_SPLIT_SE" && selectedCount < 18) {
    return { error: `Le format Swiss Split SE requiert au minimum 18 équipes. Vous avez ${selectedCount} équipes sélectionnées.` };
  }
  if ((tournament.sundayFormat === "DE" || tournament.sundayFormat === "SE") && selectedCount < 4) {
    return { error: `Le format bracket requiert au minimum 4 équipes. Vous avez ${selectedCount} équipes.` };
  }

  // Verrouiller + passer LIVE
  await prisma.tournament.update({
    where: { id },
    data: { status: "LIVE", locked: true },
  });

  // Générer les matchs selon le format choisi
  // Berlin Mixed: pas de matchs auto-générés au lancement — l'orga gère manuellement via BerlinMixedActions
  // Graz: génère seulement Pool A (5 rounds samedi matin) — Pool B lancé séparément
  if (tournament.saturdayFormat === "SWISS") {
    const res = await generateSwissRoundAction(id);
    if ("error" in res && res.error) return { error: `Lancement OK mais erreur Swiss : ${res.error}` };
  } else if (tournament.saturdayFormat === "GRAZ") {
    const res = await launchGrazPoolAction(id, "Pool A");
    if ("error" in res && res.error) return { error: `Lancement OK mais erreur Graz Pool A : ${res.error}` };
  } else if (tournament.saturdayFormat !== "BERLIN_MIXED") {
    const res = await generatePoolsAction(id);
    if ("error" in res && res.error) return { error: `Lancement OK mais erreur Poules : ${res.error}` };
  }

  revalidatePath(`/tournament/${id}`);
  revalidatePath(`/tournament/${id}/edit`);
  return { ok: true };
}

/**
 * Reset matches only: delete all match events + matches across ALL phases,
 * but keep pools, team selections, and tournament status intact.
 */
export async function resetMatchesAction(
  id: string
): Promise<{ ok?: boolean; error?: string }> {
  const denied = await requireTournamentOrgaAccess(id);
  if (denied) return denied;

  const tournament = await prisma.tournament.findUnique({ where: { id } });
  if (!tournament) return { error: "Tournoi introuvable." };

  const teamPlayers = await prisma.teamPlayer.findMany({
    where: { team: { tournamentId: id } },
    select: { playerId: true },
  });
  const playerIds = [...new Set(teamPlayers.map((tp) => tp.playerId))];

  await prisma.$transaction(async (tx) => {
    await tx.matchEvent.deleteMany({ where: { match: { tournamentId: id } } });
    await tx.match.deleteMany({ where: { tournamentId: id } });
    if (tournament.status === "COMPLETED") {
      await tx.tournament.update({ where: { id }, data: { status: "LIVE" } });
    }
  }, { timeout: 15000 });

  // Recompute badges for affected players
  for (const playerId of playerIds) {
    try {
      const newBadges = await computeCareerBadges(playerId);
      await prisma.player.update({ where: { id: playerId }, data: { badges: newBadges } });
    } catch { /* non-blocking */ }
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

  // Collect all player IDs from this tournament before deleting
  const teamPlayers = await prisma.teamPlayer.findMany({
    where: { team: { tournamentId: id } },
    select: { playerId: true },
  });
  const playerIds = [...new Set(teamPlayers.map((tp) => tp.playerId))];

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

  // Recompute badges for all affected players (events deleted = badges may change)
  for (const playerId of playerIds) {
    try {
      const newBadges = await computeCareerBadges(playerId);
      await prisma.player.update({ where: { id: playerId }, data: { badges: newBadges } });
    } catch {
      // Non-blocking: don't fail the reset if badge recompute fails
    }
  }

  revalidatePath(`/tournament/${id}`);
  revalidatePath(`/tournament/${id}/edit`);
  return { ok: true };
}

/**
 * Génère les 5 rounds de jour 1 pour une pool Graz (A ou B).
 * Pool A : samedi matin (saturdayPoolAStart ou dateStart)
 * Pool B : samedi après-midi (saturdayPoolBStart ou dateStart+3h)
 */
export async function launchGrazPoolAction(
  id: string,
  poolName: "Pool A" | "Pool B"
): Promise<{ ok?: boolean; error?: string }> {
  const denied = await requireTournamentOrgaAccess(id);
  if (denied) return denied;

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: {
      teams: { where: { selected: true } },
      pools: { include: { teams: { include: { team: true } } } },
    },
  });
  if (!tournament) return { error: "Tournoi introuvable." };
  if ((tournament as any).saturdayFormat !== "GRAZ") return { error: "Ce tournoi n'utilise pas le format Graz." };

  // Check if this pool's rounds already exist
  const poolAlreadyGenerated = await prisma.match.findFirst({
    where: {
      tournamentId: id,
      phase: "GRAZ_RR",
      dayIndex: "SAT",
      pool: { name: poolName },
    },
  });
  if (poolAlreadyGenerated) return { error: `Les matchs du jour 1 pour ${poolName} ont déjà été générés.` };

  // Get or create pool record
  let poolRecord = tournament.pools.find((p) => p.name === poolName);

  // Generate the two pools from teams if not already assigned
  const grazPools = generateGrazPools(tournament.teams);
  const targetPool = grazPools.find((p) => p.name === poolName);
  if (!targetPool) return { error: `Pool ${poolName} introuvable.` };

  const courtNames = Array.from({ length: tournament.courtsCount }, (_, i) => `Court ${i + 1}`);

  // Start time: Pool A = saturdayPoolAStart ?? dateStart, Pool B = saturdayPoolBStart ?? dateStart+3h
  const dateStart = new Date((tournament as any).dateStart);
  let startAt: Date;
  if (poolName === "Pool A") {
    startAt = (tournament as any).saturdayPoolAStart
      ? new Date((tournament as any).saturdayPoolAStart)
      : dateStart;
  } else {
    startAt = (tournament as any).saturdayPoolBStart
      ? new Date((tournament as any).saturdayPoolBStart)
      : new Date(dateStart.getTime() + 3 * 60 * 60 * 1000);
  }

  const newMatches = generateGrazPoolRounds(
    targetPool,
    courtNames,
    startAt,
    "SAT",
    tournament.gameDurationMin,
    1,
    5
  );

  await prisma.$transaction(async (tx) => {
    // Create pool record if needed
    if (!poolRecord) {
      const created = await tx.pool.create({
        data: { tournamentId: id, name: poolName, session: null },
      });
      await tx.poolTeam.createMany({
        data: targetPool.teams.map((team) => ({ poolId: created.id, teamId: team.id })),
      });
      poolRecord = { ...created, teams: [] } as any;
    }

    for (const match of newMatches) {
      await tx.match.create({
        data: {
          tournamentId: id,
          phase: "GRAZ_RR",
          poolId: poolRecord!.id,
          bracketSide: null,
          roundIndex: match.roundIndex,
          positionInRound: match.positionInRound ?? 0,
          courtName: match.courtName,
          startAt: match.startAt,
          dayIndex: "SAT",
          status: "SCHEDULED",
          teamAId: match.teamAId,
          teamBId: match.teamBId,
        },
      });
    }
  }, { timeout: 15000 });

  revalidatePath(`/tournament/${id}`);
  revalidatePath(`/tournament/${id}/edit`);
  return { ok: true };
}

/**
 * Génère les rounds 6-7 du dimanche matin pour les deux pools Graz,
 * en alternant : Round 6 Pool A, Round 6 Pool B, Round 7 Pool A, Round 7 Pool B.
 */
export async function launchGrazSundayRRAction(
  id: string
): Promise<{ ok?: boolean; error?: string }> {
  const denied = await requireTournamentOrgaAccess(id);
  if (denied) return denied;

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: {
      teams: { where: { selected: true } },
      pools: { include: { teams: { include: { team: true } } } },
    },
  });
  if (!tournament) return { error: "Tournoi introuvable." };
  if ((tournament as any).saturdayFormat !== "GRAZ") return { error: "Ce tournoi n'utilise pas le format Graz." };

  // Check all day 1 matches are done
  const day1Matches = await prisma.match.findMany({
    where: { tournamentId: id, phase: "GRAZ_RR", dayIndex: "SAT" },
  });
  if (day1Matches.length === 0) return { error: "Générez d'abord les matchs du samedi." };
  const unfinishedDay1 = day1Matches.filter((m) => m.status !== "FINISHED");
  if (unfinishedDay1.length > 0) return { error: `${unfinishedDay1.length} match(s) du samedi non terminé(s).` };

  // Check rounds 6-7 not already generated
  const sundayRRExists = await prisma.match.findFirst({
    where: { tournamentId: id, phase: "GRAZ_RR", dayIndex: "SUN" },
  });
  if (sundayRRExists) return { error: "Les matchs du dimanche matin sont déjà générés." };

  const grazPools = generateGrazPools(tournament.teams);
  const poolA = grazPools.find((p) => p.name === "Pool A")!;
  const poolB = grazPools.find((p) => p.name === "Pool B")!;
  const poolARecord = tournament.pools.find((p) => p.name === "Pool A");
  const poolBRecord = tournament.pools.find((p) => p.name === "Pool B");

  const courtNames = Array.from({ length: tournament.courtsCount }, (_, i) => `Court ${i + 1}`);
  const slotMin = tournament.gameDurationMin + 5;

  // Alternate rounds: R6-A, R6-B, R7-A, R7-B
  const allNewMatches: Array<{ m: ReturnType<typeof generateGrazPoolRounds>[0]; poolId: string }> = [];
  const placeholderDate = new Date(); // placeholder, will be overwritten below

  for (let round = 6; round <= 7; round++) {
    const aMatches = generateGrazPoolRounds(poolA, courtNames, placeholderDate, "SUN", tournament.gameDurationMin, round, round);
    const bMatches = generateGrazPoolRounds(poolB, courtNames, placeholderDate, "SUN", tournament.gameDurationMin, round, round);
    for (const m of aMatches) allNewMatches.push({ m, poolId: poolARecord?.id ?? "" });
    for (const m of bMatches) allNewMatches.push({ m, poolId: poolBRecord?.id ?? "" });
  }

  // Re-schedule with actual times: now + 5min
  let cursor = new Date(Date.now() + 5 * 60 * 1000);
  const scheduled = allNewMatches.map(({ m, poolId }) => {
    const startAt = new Date(cursor);
    cursor = new Date(cursor.getTime() + slotMin * 60000);
    return { ...m, startAt, poolId };
  });

  await prisma.$transaction(async (tx) => {
    for (const m of scheduled) {
      await tx.match.create({
        data: {
          tournamentId: id,
          phase: "GRAZ_RR",
          poolId: m.poolId || null,
          bracketSide: null,
          roundIndex: m.roundIndex,
          positionInRound: m.positionInRound ?? 0,
          courtName: m.courtName,
          startAt: m.startAt,
          dayIndex: "SUN",
          status: "SCHEDULED",
          teamAId: m.teamAId,
          teamBId: m.teamBId,
        },
      });
    }
  }, { timeout: 15000 });

  revalidatePath(`/tournament/${id}`);
  revalidatePath(`/tournament/${id}/edit`);
  return { ok: true };
}

// ─── Graz Reset actions ───────────────────────────────────────────────────────

export async function resetGrazPhaseAction(
  id: string,
  phase: "SUNDAY_RR" | "REGROUP" | "SE"
): Promise<{ ok?: boolean; error?: string }> {
  const denied = await requireTournamentOrgaAccess(id);
  if (denied) return denied;

  if (phase === "SUNDAY_RR") {
    // Delete SUN RR matches + cascade: also delete Regroup, SE, and regroup pools
    await prisma.match.deleteMany({ where: { tournamentId: id, phase: "GRAZ_SE" } });
    await prisma.match.deleteMany({ where: { tournamentId: id, phase: "GRAZ_REGROUP" } });
    // Delete regroup pools (Regroup-Top etc.)
    const regroupPools = await prisma.pool.findMany({ where: { tournamentId: id, name: { startsWith: "Regroup-" } } });
    for (const p of regroupPools) {
      await prisma.poolTeam.deleteMany({ where: { poolId: p.id } });
      await prisma.pool.delete({ where: { id: p.id } });
    }
    await prisma.match.deleteMany({ where: { tournamentId: id, phase: "GRAZ_RR", dayIndex: "SUN" } });
  } else if (phase === "REGROUP") {
    // Delete SE + Regroup + regroup pools
    await prisma.match.deleteMany({ where: { tournamentId: id, phase: "GRAZ_SE" } });
    await prisma.match.deleteMany({ where: { tournamentId: id, phase: "GRAZ_REGROUP" } });
    const regroupPools = await prisma.pool.findMany({ where: { tournamentId: id, name: { startsWith: "Regroup-" } } });
    for (const p of regroupPools) {
      await prisma.poolTeam.deleteMany({ where: { poolId: p.id } });
      await prisma.pool.delete({ where: { id: p.id } });
    }
  } else if (phase === "SE") {
    await prisma.match.deleteMany({ where: { tournamentId: id, phase: "GRAZ_SE" } });
  }

  revalidatePath(`/tournament/${id}`);
  revalidatePath(`/tournament/${id}/edit`);
  return { ok: true };
}

// ─── Graz Phase 2 : Regroup ───────────────────────────────────────────────────

export async function launchGrazRegroupAction(
  id: string
): Promise<{ ok?: boolean; error?: string }> {
  const denied = await requireTournamentOrgaAccess(id);
  if (denied) return denied;

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: {
      teams: { where: { selected: true } },
      pools: { include: { teams: { include: { team: true } } } },
      matches: { where: { phase: "GRAZ_RR" }, include: { teamA: true, teamB: true } },
    },
  });
  if (!tournament) return { error: "Tournoi introuvable." };
  if ((tournament as any).saturdayFormat !== "GRAZ") return { error: "Ce tournoi n'utilise pas le format Graz." };

  // All 7 RR rounds must be finished
  const rrMatches = tournament.matches;
  if (rrMatches.length === 0) return { error: "Aucun match RR trouvé." };
  const unfinished = rrMatches.filter((m) => m.status !== "FINISHED");
  if (unfinished.length > 0) return { error: `${unfinished.length} match(s) RR non terminé(s).` };

  // Regroup already generated?
  const existing = await prisma.match.findFirst({ where: { tournamentId: id, phase: "GRAZ_REGROUP" } });
  if (existing) return { error: "Le Regroup a déjà été généré." };

  // Compute standings for each pool
  const poolARecord = tournament.pools.find((p) => p.name === "Pool A");
  const poolBRecord = tournament.pools.find((p) => p.name === "Pool B");
  if (!poolARecord || !poolBRecord) return { error: "Pools introuvables." };

  const poolATeams = poolARecord.teams.map((pt) => pt.team);
  const poolBTeams = poolBRecord.teams.map((pt) => pt.team);
  const poolAMatches = rrMatches.filter((m) => m.poolId === poolARecord.id);
  const poolBMatches = rrMatches.filter((m) => m.poolId === poolBRecord.id);

  const poolAStandings = computeStandings(poolATeams, poolAMatches as any, (tournament as any).scoringSystem);
  const poolBStandings = computeStandings(poolBTeams, poolBMatches as any, (tournament as any).scoringSystem);

  // Build regroup groups
  const groups = assignRegroupTeamIds(poolAStandings, poolBStandings);

  // Build set of already-played pairs (skip intra-pool matches)
  const playedPairs = buildPlayedPairs(rrMatches);

  const courtNames = Array.from({ length: tournament.courtsCount }, (_, i) => `Court ${i + 1}`);

  // Start time: now + 10min (orga just clicked the button, matches start soon)
  const regroupStart = new Date(Date.now() + 10 * 60 * 1000);

  const newMatches = generateRegroupMatches(groups, playedPairs, courtNames, regroupStart, tournament.gameDurationMin);

  // Create pool records for each regroup group and persist matches
  await prisma.$transaction(async (tx) => {
    for (const group of groups) {
      const pool = await tx.pool.create({
        data: { tournamentId: id, name: `Regroup-${group.name}`, session: null },
      });
      // Assign pool teams
      await tx.poolTeam.createMany({
        data: group.teamIds.map((teamId) => ({ poolId: pool.id, teamId })),
      });
      // Create matches for this group
      const groupMatches = newMatches.filter((m) => m.poolName === group.name);
      for (const match of groupMatches) {
        await tx.match.create({
          data: {
            tournamentId: id,
            phase: "GRAZ_REGROUP",
            poolId: pool.id,
            bracketSide: null,
            roundIndex: match.roundIndex,
            positionInRound: match.positionInRound ?? 0,
            courtName: match.courtName,
            startAt: match.startAt,
            dayIndex: "SUN",
            status: "SCHEDULED",
            teamAId: match.teamAId,
            teamBId: match.teamBId,
          },
        });
      }
    }
  }, { timeout: 20000 });

  revalidatePath(`/tournament/${id}`);
  revalidatePath(`/tournament/${id}/edit`);
  return { ok: true };
}

// ─── Graz Phase 3 : SE ────────────────────────────────────────────────────────

export async function launchGrazSEAction(
  id: string
): Promise<{ ok?: boolean; error?: string }> {
  const denied = await requireTournamentOrgaAccess(id);
  if (denied) return denied;

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: {
      teams: { where: { selected: true } },
      pools: { include: { teams: { include: { team: true } } } },
      matches: { where: { phase: { in: ["GRAZ_RR", "GRAZ_REGROUP"] } } },
    },
  });
  if (!tournament) return { error: "Tournoi introuvable." };
  if ((tournament as any).saturdayFormat !== "GRAZ") return { error: "Ce tournoi n'utilise pas le format Graz." };

  // All regroup matches must be finished
  const regroupMatches = tournament.matches.filter((m) => m.phase === "GRAZ_REGROUP");
  if (regroupMatches.length === 0) return { error: "Générez d'abord le Regroup." };
  const unfinished = regroupMatches.filter((m) => m.status !== "FINISHED");
  if (unfinished.length > 0) return { error: `${unfinished.length} match(s) Regroup non terminé(s).` };

  // SE already generated?
  const existing = await prisma.match.findFirst({ where: { tournamentId: id, phase: "GRAZ_SE" } });
  if (existing) return { error: "Le SE a déjà été généré." };

  // Compute standings for each regroup group (RR matches + Regroup matches combined)
  const rrMatches = tournament.matches.filter((m) => m.phase === "GRAZ_RR");
  const regroupPools = tournament.pools.filter((p) => p.name.startsWith("Regroup-"));

  const regroupStandings = new Map<string, ReturnType<typeof computeStandings>>();

  for (const pool of regroupPools) {
    const groupName = pool.name.replace("Regroup-", ""); // "Top", "Mid 1", etc.
    const teamIds = pool.teams.map((pt) => pt.teamId);
    const teams = pool.teams.map((pt) => pt.team);

    // Combine RR intra-pool matches + Regroup matches for this group
    const relevantRR = rrMatches.filter(
      (m) => m.teamAId && m.teamBId && teamIds.includes(m.teamAId) && teamIds.includes(m.teamBId)
    );
    const relevantRegroup = regroupMatches.filter((m) => m.poolId === pool.id);
    const allRelevant = [...relevantRR, ...relevantRegroup];

    const standings = computeStandings(teams, allRelevant as any, (tournament as any).scoringSystem);
    regroupStandings.set(groupName, standings);
  }

  const seTeamIds = selectSETeams(regroupStandings);
  if (seTeamIds.length < 4) return { error: "Pas assez d'équipes qualifiées pour le SE." };

  // Start time: now + 15min (orga just clicked the button)
  const seStart = new Date(Date.now() + 15 * 60 * 1000);

  const courtNames = Array.from({ length: tournament.courtsCount }, (_, i) => `Court ${i + 1}`);
  const seMatches = generateGrazSE(seTeamIds, courtNames, seStart, tournament.gameDurationMin);

  // Persist SE matches and wire nextMatch links
  await prisma.$transaction(async (tx) => {
    // Create all SE matches and collect their IDs
    const createdIds: string[] = [];
    for (const match of seMatches) {
      const created = await tx.match.create({
        data: {
          tournamentId: id,
          phase: "GRAZ_SE",
          poolId: null,
          bracketSide: match.bracketSide ?? null,
          roundIndex: match.roundIndex,
          positionInRound: match.positionInRound ?? 0,
          courtName: match.courtName,
          startAt: match.startAt,
          dayIndex: "SUN",
          status: "SCHEDULED",
          teamAId: match.teamAId,
          teamBId: match.teamBId,
        },
      });
      createdIds.push(created.id);
    }

    // seMatches order: [QF1(0), QF2(1), SF1(2), SF2(3), 3rd(4), Final(5)]
    const [qf1Id, qf2Id, sf1Id, sf2Id, thirdId, finalId] = createdIds;

    // QF1 winner → SF1 slot B, loser → 3rd (no — losers don't go to 3rd from QF)
    await tx.match.update({ where: { id: qf1Id }, data: { nextMatchWinId: sf1Id, nextSlotWin: "B" } });
    // QF2 winner → SF2 slot B
    await tx.match.update({ where: { id: qf2Id }, data: { nextMatchWinId: sf2Id, nextSlotWin: "B" } });
    // SF1 winner → Final slot A, loser → 3rd slot A
    await tx.match.update({ where: { id: sf1Id }, data: { nextMatchWinId: finalId, nextSlotWin: "A", nextMatchLoseId: thirdId, nextSlotLose: "A" } });
    // SF2 winner → Final slot B, loser → 3rd slot B
    await tx.match.update({ where: { id: sf2Id }, data: { nextMatchWinId: finalId, nextSlotWin: "B", nextMatchLoseId: thirdId, nextSlotLose: "B" } });
  }, { timeout: 20000 });

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

// ─── MTP Open actions ─────────────────────────────────────────────────────────

export async function launchMtpPoolAction(
  id: string,
  pool: "A" | "B"
): Promise<{ ok?: boolean; error?: string }> {
  const denied = await requireTournamentOrgaAccess(id);
  if (denied) return denied;

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: {
      teams: { where: { selected: true } },
      pools: { include: { teams: true } },
    },
  });
  if (!tournament) return { error: "Tournoi introuvable." };
  if ((tournament as any).saturdayFormat !== "MTP_OPEN") return { error: "Format MTP Open requis." };

  const phase = pool === "A" ? "MTP_POOL_A" : "MTP_POOL_B";
  const poolName = `Pool ${pool}`;

  const existing = await prisma.match.findFirst({ where: { tournamentId: id, phase } });
  if (existing) return { error: `${poolName} déjà générée.` };

  // Use manually assigned pool if it exists in DB, otherwise fallback to splitMtpPools
  const dbPool = tournament.pools.find((p) => p.name === poolName);
  let teams: typeof tournament.teams;
  if (dbPool && dbPool.teams.length > 0) {
    teams = dbPool.teams.map((pt) => tournament.teams.find((t) => t.id === pt.teamId)!).filter(Boolean);
  } else {
    const { poolA, poolB } = splitMtpPools(tournament.teams);
    teams = pool === "A" ? poolA : poolB;
  }
  if (teams.length < 2) return { error: "Pas assez d'équipes." };

  const courtNames = Array.from({ length: Math.max(tournament.courtsCount, 1) }, (_, i) => `Court ${i + 1}`);
  const t = tournament as any;
  const baseDate = new Date(tournament.dateStart);
  const startAt = pool === "A"
    ? (t.mtpPoolAStart ? new Date(t.mtpPoolAStart) : baseDate)
    : (t.mtpPoolBStart ? new Date(t.mtpPoolBStart) : new Date(baseDate.getTime() + 3 * 60 * 60 * 1000));

  const matches = generateMtpPool(teams, phase as any, poolName, courtNames, startAt, tournament.gameDurationMin);

  await prisma.$transaction(async (tx) => {
    // Create pool record
    let poolRecord = await tx.pool.findFirst({ where: { tournamentId: id, name: poolName } });
    if (!poolRecord) {
      poolRecord = await tx.pool.create({ data: { tournamentId: id, name: poolName, session: null } });
      await tx.poolTeam.createMany({ data: teams.map((t) => ({ poolId: poolRecord!.id, teamId: t.id })) });
    }
    for (const m of matches) {
      await tx.match.create({
        data: {
          tournamentId: id, phase, poolId: poolRecord.id,
          bracketSide: null, roundIndex: m.roundIndex, positionInRound: m.positionInRound,
          courtName: m.courtName, startAt: m.startAt, dayIndex: "SAT",
          status: "SCHEDULED", teamAId: m.teamAId, teamBId: m.teamBId,
        },
      });
    }
  }, { timeout: 15000 });

  revalidatePath(`/tournament/${id}`);
  revalidatePath(`/tournament/${id}/edit`);
  return { ok: true };
}

export async function launchMtpNextRoundAction(
  id: string,
  pool: "A" | "B"
): Promise<{ ok?: boolean; error?: string }> {
  const denied = await requireTournamentOrgaAccess(id);
  if (denied) return denied;

  const phase = pool === "A" ? "MTP_POOL_A" : "MTP_POOL_B";
  const poolName = `Pool ${pool}`;

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: {
      teams: { where: { selected: true } },
      matches: { where: { phase } },
      pools: { include: { teams: true } },
    },
  });
  if (!tournament) return { error: "Tournoi introuvable." };
  if ((tournament as any).saturdayFormat !== "MTP_OPEN") return { error: "Format MTP Open requis." };

  const existingMatches = tournament.matches;
  if (existingMatches.length === 0) return { error: "Aucun match trouvé pour cette pool." };

  const maxRound = Math.max(...existingMatches.map((m) => m.roundIndex));
  const swissRounds = (tournament as any).swissRounds ?? 6;
  if (maxRound >= swissRounds) return { error: `Tous les ${swissRounds} rounds ont déjà été générés.` };

  const currentRoundMatches = existingMatches.filter((m) => m.roundIndex === maxRound);
  const unfinished = currentRoundMatches.filter((m) => m.status !== "FINISHED");
  if (unfinished.length > 0) return { error: `Le round ${maxRound} n'est pas encore terminé (${unfinished.length} match(s) restant(s)).` };

  // Already have next round?
  const nextRoundExists = existingMatches.some((m) => m.roundIndex === maxRound + 1);
  if (nextRoundExists) return { error: `Le round ${maxRound + 1} a déjà été généré.` };

  // Compute standings — use manually assigned pool if available
  const dbPool = tournament.pools.find((p) => p.name === poolName);
  let poolTeams: typeof tournament.teams;
  if (dbPool && dbPool.teams.length > 0) {
    poolTeams = dbPool.teams.map((pt) => tournament.teams.find((t) => t.id === pt.teamId)!).filter(Boolean);
  } else {
    const { poolA, poolB } = splitMtpPools(tournament.teams);
    poolTeams = pool === "A" ? poolA : poolB;
  }
  const standings = computeStandings(poolTeams, existingMatches as any, (tournament as any).scoringSystem);

  // Build played pairs set
  const playedPairs = new Set<string>(
    existingMatches
      .filter((m) => m.teamAId && m.teamBId)
      .map((m) => [m.teamAId!, m.teamBId!].sort().join("_"))
  );

  // Compute start time: last match end time + 5 min break
  const lastMatchTimes = existingMatches
    .filter((m) => m.roundIndex === maxRound && m.startAt)
    .map((m) => new Date(m.startAt!).getTime());
  const slotMin = tournament.gameDurationMin + 5;
  const roundBreak = 5;
  const lastEnd = lastMatchTimes.length > 0
    ? new Date(Math.max(...lastMatchTimes) + slotMin * 60 * 1000)
    : new Date();
  const nextStart = new Date(lastEnd.getTime() + roundBreak * 60 * 1000);

  const courtNames = Array.from({ length: Math.max(tournament.courtsCount, 1) }, (_, i) => `Court ${i + 1}`);

  const standingsForSwiss = standings.map((s) => ({ teamId: s.teamId, points: s.points }));
  const newMatches = generateMtpSwissNextRound(
    poolTeams, standingsForSwiss, playedPairs,
    phase as any, poolName, courtNames, nextStart,
    tournament.gameDurationMin, maxRound + 1
  );

  const poolRecord = await prisma.pool.findFirst({ where: { tournamentId: id, name: poolName } });
  if (!poolRecord) return { error: "Pool introuvable en base." };

  await prisma.$transaction(async (tx) => {
    for (const m of newMatches) {
      await tx.match.create({
        data: {
          tournamentId: id, phase, poolId: poolRecord.id,
          bracketSide: null, roundIndex: m.roundIndex, positionInRound: m.positionInRound,
          courtName: m.courtName, startAt: m.startAt, dayIndex: "SAT",
          status: "SCHEDULED", teamAId: m.teamAId, teamBId: m.teamBId,
        },
      });
    }
  }, { timeout: 15000 });

  revalidatePath(`/tournament/${id}`);
  revalidatePath(`/tournament/${id}/edit`);
  return { ok: true };
}

/** Resolve MTP pool teams: use manually assigned DB pool if available, else splitMtpPools */
function resolveMtpPoolTeams<T extends { id: string }>(
  teams: T[],
  pools: { name: string; teams: { teamId: string }[] }[]
): { poolA: T[]; poolB: T[] } {
  const dbPoolA = pools.find((p) => p.name === "Pool A");
  const dbPoolB = pools.find((p) => p.name === "Pool B");
  if (dbPoolA && dbPoolA.teams.length > 0 && dbPoolB && dbPoolB.teams.length > 0) {
    const poolA = dbPoolA.teams.map((pt) => teams.find((t) => t.id === pt.teamId)!).filter(Boolean);
    const poolB = dbPoolB.teams.map((pt) => teams.find((t) => t.id === pt.teamId)!).filter(Boolean);
    return { poolA, poolB };
  }
  return splitMtpPools(teams as any) as unknown as { poolA: T[]; poolB: T[] };
}

export async function launchMtpCrossPoolAction(id: string): Promise<{ ok?: boolean; error?: string }> {
  const denied = await requireTournamentOrgaAccess(id);
  if (denied) return denied;

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: {
      teams: { where: { selected: true } },
      matches: { where: { phase: { in: ["MTP_POOL_A", "MTP_POOL_B"] } } },
      pools: { include: { teams: true } },
    },
  });
  if (!tournament) return { error: "Tournoi introuvable." };
  if ((tournament as any).saturdayFormat !== "MTP_OPEN") return { error: "Format MTP Open requis." };

  const existingCross = await prisma.match.findFirst({ where: { tournamentId: id, phase: "CROSS_POOL" } });
  if (existingCross) return { error: "Le cross-pool a déjà été généré." };

  const poolAMatches = tournament.matches.filter((m) => m.phase === "MTP_POOL_A");
  const poolBMatches = tournament.matches.filter((m) => m.phase === "MTP_POOL_B");
  if (poolAMatches.length === 0 || poolBMatches.length === 0) return { error: "Générez d'abord les deux pools." };
  if (!poolAMatches.every((m) => m.status === "FINISHED") || !poolBMatches.every((m) => m.status === "FINISHED")) {
    return { error: "Tous les matchs des pools doivent être terminés." };
  }

  const { poolA, poolB } = resolveMtpPoolTeams(tournament.teams, tournament.pools);
  const poolAStandings = computeStandings(poolA as any, poolAMatches as any, (tournament as any).scoringSystem);
  const poolBStandings = computeStandings(poolB as any, poolBMatches as any, (tournament as any).scoringSystem);

  if (poolAStandings.length === 0 || poolBStandings.length === 0) return { error: "Il faut des équipes classées dans chaque pool pour le cross-pool." };

  const teamMap = new Map(tournament.teams.map((t) => [t.id, t]));
  const poolATeams = poolAStandings.map((s) => teamMap.get(s.teamId)!).filter(Boolean);
  const poolBTeams = poolBStandings.map((s) => teamMap.get(s.teamId)!).filter(Boolean);
  if (poolATeams.length === 0 || poolBTeams.length === 0) return { error: "Données insuffisantes pour le cross-pool." };

  const courtNames = Array.from({ length: Math.max(tournament.courtsCount, 1) }, (_, i) => `Court ${i + 1}`);
  const t = tournament as any;
  const sundayStart = t.mtpSundayStart ? new Date(t.mtpSundayStart) : new Date(tournament.dateEnd);
  const matches = generateMtpCrossPool(poolATeams, poolBTeams, courtNames, sundayStart, tournament.gameDurationMin);

  await prisma.$transaction(async (tx) => {
    for (const m of matches) {
      await tx.match.create({
        data: {
          tournamentId: id, phase: "CROSS_POOL", bracketSide: null,
          roundIndex: m.roundIndex, positionInRound: m.positionInRound,
          courtName: m.courtName, startAt: m.startAt, dayIndex: "SUN",
          status: "SCHEDULED", teamAId: m.teamAId, teamBId: m.teamBId,
        },
      });
    }
  }, { timeout: 15000 });

  revalidatePath(`/tournament/${id}`);
  revalidatePath(`/tournament/${id}/edit`);
  return { ok: true };
}

export async function launchMtpBarrageAction(id: string): Promise<{ ok?: boolean; error?: string }> {
  const denied = await requireTournamentOrgaAccess(id);
  if (denied) return denied;

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: {
      teams: { where: { selected: true } },
      matches: { where: { phase: { in: ["MTP_POOL_A", "MTP_POOL_B", "CROSS_POOL"] } } },
      pools: { include: { teams: true } },
    },
  });
  if (!tournament) return { error: "Tournoi introuvable." };
  if ((tournament as any).saturdayFormat !== "MTP_OPEN") return { error: "Format MTP Open requis." };

  const existingBarrage = await prisma.match.findFirst({ where: { tournamentId: id, phase: "MTP_BARRAGE" } });
  if (existingBarrage) return { error: "Le barrage a déjà été généré." };

  const poolAMatches = tournament.matches.filter((m) => m.phase === "MTP_POOL_A");
  const poolBMatches = tournament.matches.filter((m) => m.phase === "MTP_POOL_B");
  const crossMatches = tournament.matches.filter((m) => m.phase === "CROSS_POOL");
  if (poolAMatches.length === 0 || poolBMatches.length === 0) return { error: "Générez d'abord les deux pools." };
  if (crossMatches.length === 0) return { error: "Générez d'abord le cross-pool." };
  if (!crossMatches.every((m) => m.status === "FINISHED")) {
    return { error: "Tous les matchs cross-pool doivent être terminés." };
  }

  const { poolA, poolB } = resolveMtpPoolTeams(tournament.teams, tournament.pools);
  const poolAStandings = computeStandings(poolA as any, poolAMatches as any, (tournament as any).scoringSystem);
  const poolBStandings = computeStandings(poolB as any, poolBMatches as any, (tournament as any).scoringSystem);
  const combined = combineMtpStandings(poolAStandings, poolBStandings);

  if (combined.length < 16) return { error: "Il faut au moins 16 équipes classées." };
  const seeds13to20 = combined.slice(12, 20);
  const teamMap = new Map(tournament.teams.map((t) => [t.id, t]));
  const barrageTeams = seeds13to20.map((s) => teamMap.get(s.teamId)!).filter(Boolean);
  if (barrageTeams.length < 8) return { error: "Données insuffisantes pour le barrage." };

  const courtNames = Array.from({ length: Math.max(tournament.courtsCount, 1) }, (_, i) => `Court ${i + 1}`);
  const t = tournament as any;
  const sundayStart = t.mtpSundayStart ? new Date(t.mtpSundayStart) : new Date(tournament.dateEnd);
  // Barrage starts after cross-pool: offset by (10 matches / 2 courts) * slotMin
  const slotMin = tournament.gameDurationMin + 5;
  const crossDuration = Math.ceil(10 / Math.max(tournament.courtsCount, 1)) * slotMin;
  const barrageStart = new Date(sundayStart.getTime() + crossDuration * 60 * 1000);
  const matches = generateMtpBarrage(barrageTeams, courtNames, barrageStart, tournament.gameDurationMin);

  await prisma.$transaction(async (tx) => {
    for (const m of matches) {
      await tx.match.create({
        data: {
          tournamentId: id, phase: "MTP_BARRAGE", bracketSide: null,
          roundIndex: m.roundIndex, positionInRound: m.positionInRound,
          courtName: m.courtName, startAt: m.startAt, dayIndex: "SUN",
          status: "SCHEDULED", teamAId: m.teamAId, teamBId: m.teamBId,
        },
      });
    }
  }, { timeout: 15000 });

  revalidatePath(`/tournament/${id}`);
  revalidatePath(`/tournament/${id}/edit`);
  return { ok: true };
}

export async function launchMtpDEAction(id: string): Promise<{ ok?: boolean; error?: string }> {
  const denied = await requireTournamentOrgaAccess(id);
  if (denied) return denied;

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: {
      teams: { where: { selected: true } },
      matches: { where: { phase: { in: ["MTP_POOL_A", "MTP_POOL_B", "MTP_BARRAGE"] } } },
      pools: { include: { teams: true } },
    },
  });
  if (!tournament) return { error: "Tournoi introuvable." };
  if ((tournament as any).saturdayFormat !== "MTP_OPEN") return { error: "Format MTP Open requis." };

  const existingDE = await prisma.match.findFirst({ where: { tournamentId: id, phase: "MTP_DE" } });
  if (existingDE) return { error: "Le bracket DE a déjà été généré." };

  const barrageMatches = tournament.matches.filter((m) => m.phase === "MTP_BARRAGE");
  if (barrageMatches.length < 4) return { error: "Générez d'abord le barrage." };
  if (!barrageMatches.every((m) => m.status === "FINISHED")) return { error: "Tous les matchs du barrage doivent être terminés." };

  const poolAMatches = tournament.matches.filter((m) => m.phase === "MTP_POOL_A");
  const poolBMatches = tournament.matches.filter((m) => m.phase === "MTP_POOL_B");
  const { poolA, poolB } = resolveMtpPoolTeams(tournament.teams, tournament.pools);
  const poolAStandings = computeStandings(poolA as any, poolAMatches as any, (tournament as any).scoringSystem);
  const poolBStandings = computeStandings(poolB as any, poolBMatches as any, (tournament as any).scoringSystem);
  const combined = combineMtpStandings(poolAStandings, poolBStandings);

  const teamMap = new Map(tournament.teams.map((t) => [t.id, t]));

  // Top 12 direct qualifiers
  const top12 = combined.slice(0, 12).map((s) => teamMap.get(s.teamId)!).filter(Boolean);

  // 4 barrage winners (by original pool rank = combined rank index 12-19 of winner)
  const seeds13to20 = combined.slice(12, 20);
  const barrageWinners: Array<{ team: typeof tournament.teams[0]; originalRank: number }> = [];
  for (const bm of barrageMatches) {
    if (!bm.winnerTeamId) continue;
    const winner = teamMap.get(bm.winnerTeamId);
    if (!winner) continue;
    const originalRank = seeds13to20.findIndex((s) => s.teamId === bm.winnerTeamId);
    barrageWinners.push({ team: winner, originalRank });
  }
  // Sort barrage winners by their original pool rank (better rank = higher seed)
  barrageWinners.sort((a, b) => a.originalRank - b.originalRank);
  const barrageWinnerTeams = barrageWinners.map((w) => w.team);

  const seeded16 = [...top12, ...barrageWinnerTeams];
  if (seeded16.length < 16) return { error: `Seulement ${seeded16.length} équipes disponibles, il en faut 16.` };

  const courtNames = Array.from({ length: Math.max(tournament.courtsCount, 1) }, (_, i) => `Court ${i + 1}`);
  const t = tournament as any;
  // DE starts after barrage — estimate from last barrage match startAt + some buffer
  const lastBarrage = barrageMatches.reduce((latest, m) => m.startAt > latest ? m.startAt : latest, new Date(0));
  const deStart = t.mtpSundayStart
    ? new Date(new Date(t.mtpSundayStart).getTime() + (tournament.gameDurationMin + 5) * 60 * 1000 * 3) // after 4 barrage rounds
    : new Date(lastBarrage.getTime() + (tournament.gameDurationMin + 30) * 60 * 1000);

  const matches = generateMtpDE(seeded16, courtNames, deStart, tournament.gameDurationMin, (tournament as any).gfReset ?? false);

  await prisma.$transaction(async (tx) => {
    const createdIds: string[] = [];
    for (const m of matches) {
      const created = await tx.match.create({
        data: {
          tournamentId: id, phase: "MTP_DE",
          bracketSide: m.bracketSide as any,
          roundIndex: m.roundIndex, positionInRound: m.positionInRound,
          courtName: m.courtName, startAt: m.startAt, dayIndex: "SUN",
          status: "SCHEDULED", teamAId: m.teamAId, teamBId: m.teamBId,
        },
      });
      createdIds.push(created.id);
    }

    // Wire nextMatchWinId / nextMatchLoseId for winners bracket
    // WB: R1→R2→R3→R4(WBF), LB: losers drop down
    const wbMatches = matches.map((m, i) => ({ ...m, dbId: createdIds[i] })).filter((m) => m.bracketSide === "W");
    const lbMatches = matches.map((m, i) => ({ ...m, dbId: createdIds[i] })).filter((m) => m.bracketSide === "L");
    const gfMatch = matches.map((m, i) => ({ ...m, dbId: createdIds[i] })).find((m) => m.bracketSide === "G");

    // WB round wiring
    const wbRounds = [1, 2, 3, 4];
    for (let ri = 0; ri < wbRounds.length - 1; ri++) {
      const cur = wbMatches.filter((m) => m.roundIndex === wbRounds[ri]).sort((a, b) => a.positionInRound - b.positionInRound);
      const next = wbMatches.filter((m) => m.roundIndex === wbRounds[ri + 1]).sort((a, b) => a.positionInRound - b.positionInRound);
      for (let i = 0; i < cur.length; i++) {
        const nextPos = Math.floor(i / 2);
        const nextM = next[nextPos];
        if (nextM) {
          await tx.match.update({ where: { id: cur[i].dbId }, data: { nextMatchWinId: nextM.dbId, nextSlotWin: i % 2 === 0 ? "A" : "B" } });
        }
      }
    }

    // WB Final → Grand Final (slot A = WB winner)
    const wbFinal = wbMatches.find((m) => m.roundIndex === 4);
    if (wbFinal && gfMatch) {
      await tx.match.update({ where: { id: wbFinal.dbId }, data: { nextMatchWinId: gfMatch.dbId, nextSlotWin: "A" } });
    }

    // LB Final (roundIndex 6) → Grand Final (slot B = LB champion)
    const lbFinal = lbMatches.find((m) => m.roundIndex === 6);
    if (lbFinal && gfMatch) {
      await tx.match.update({ where: { id: lbFinal.dbId }, data: { nextMatchWinId: gfMatch.dbId, nextSlotWin: "B" } });
    }

    // LB round wiring (N=16)
    // LR1 (4 matches) → LR2 (4 matches): 1:1 mapping, LBR1[i] → LBR2[i] slot A
    // LR2 (4 matches) → LR3 (2 matches): consolidation pairs (floor(i/2))
    // LR3 (2 matches) → LR4 (2 matches): each to slot B (WBR3 losers take slot A)
    // LR4 (2 matches) → LR5 (1 match): both feed LR5 (LB semis)
    // LR5 (1 match)   → LR6 (1 match): slot A (WBF loser takes slot B)
    const lbR1 = lbMatches.filter((m) => m.roundIndex === 1).sort((a, b) => a.positionInRound - b.positionInRound);
    const lbR2 = lbMatches.filter((m) => m.roundIndex === 2).sort((a, b) => a.positionInRound - b.positionInRound);
    const lbR3 = lbMatches.filter((m) => m.roundIndex === 3).sort((a, b) => a.positionInRound - b.positionInRound);
    const lbR4 = lbMatches.filter((m) => m.roundIndex === 4).sort((a, b) => a.positionInRound - b.positionInRound);
    const lbR5 = lbMatches.filter((m) => m.roundIndex === 5).sort((a, b) => a.positionInRound - b.positionInRound);
    const lbR6 = lbMatches.filter((m) => m.roundIndex === 6).sort((a, b) => a.positionInRound - b.positionInRound);

    // LR1 → LR2: 1:1 mapping (LBR1[i] winner → LBR2[i] slot A)
    // Each LBR2 match pairs one LBR1 winner (slot A) with one WBR2 loser (slot B)
    for (let i = 0; i < lbR1.length; i++) {
      const nextM = lbR2[i];
      if (nextM) await tx.match.update({ where: { id: lbR1[i].dbId }, data: { nextMatchWinId: nextM.dbId, nextSlotWin: "A" } });
    }
    // LR2 → LR3 (pairs 0+1→LR3p0, 2+3→LR3p1)
    for (let i = 0; i < lbR2.length; i++) {
      const nextM = lbR3[Math.floor(i / 2)];
      if (nextM) await tx.match.update({ where: { id: lbR2[i].dbId }, data: { nextMatchWinId: nextM.dbId, nextSlotWin: i % 2 === 0 ? "A" : "B" } });
    }
    // LR3 → LR4 slot B (WBR3 losers take slot A)
    for (let i = 0; i < lbR3.length; i++) {
      if (lbR4[i]) await tx.match.update({ where: { id: lbR3[i].dbId }, data: { nextMatchWinId: lbR4[i].dbId, nextSlotWin: "B" } });
    }
    // LR4 → LR5 (both feed: p0→slotA, p1→slotB)
    for (let i = 0; i < lbR4.length; i++) {
      if (lbR5[0]) await tx.match.update({ where: { id: lbR4[i].dbId }, data: { nextMatchWinId: lbR5[0].dbId, nextSlotWin: i === 0 ? "A" : "B" } });
    }
    // LR5 → LR6 slot A (WBF loser takes slot B)
    if (lbR5[0] && lbR6[0]) {
      await tx.match.update({ where: { id: lbR5[0].dbId }, data: { nextMatchWinId: lbR6[0].dbId, nextSlotWin: "A" } });
    }

    // WB R1 losers → LB R1 (losers 0-3 → slot B, losers 4-7 → slot A)
    const wbR1 = wbMatches.filter((m) => m.roundIndex === 1).sort((a, b) => a.positionInRound - b.positionInRound);
    for (let i = 0; i < lbR1.length; i++) {
      if (wbR1[i + 4]) await tx.match.update({ where: { id: wbR1[i + 4].dbId }, data: { nextMatchLoseId: lbR1[i].dbId, nextSlotLose: "A" } });
      if (wbR1[i]) await tx.match.update({ where: { id: wbR1[i].dbId }, data: { nextMatchLoseId: lbR1[i].dbId, nextSlotLose: "B" } });
    }

    // WB R2 losers → LB R2 slot B (mirror mapping to avoid rematches)
    // WBR2[i] loser → LBR2[w2 - 1 - i] slot B, so they face a LBR1 winner they haven't played
    const wbR2 = wbMatches.filter((m) => m.roundIndex === 2).sort((a, b) => a.positionInRound - b.positionInRound);
    for (let i = 0; i < wbR2.length; i++) {
      const mirrorIdx = wbR2.length - 1 - i;
      if (lbR2[mirrorIdx]) await tx.match.update({ where: { id: wbR2[i].dbId }, data: { nextMatchLoseId: lbR2[mirrorIdx].dbId, nextSlotLose: "B" } });
    }

    // WB R3 losers → LB R4 slot A
    const wbR3 = wbMatches.filter((m) => m.roundIndex === 3).sort((a, b) => a.positionInRound - b.positionInRound);
    for (let i = 0; i < wbR3.length; i++) {
      if (lbR4[i]) await tx.match.update({ where: { id: wbR3[i].dbId }, data: { nextMatchLoseId: lbR4[i].dbId, nextSlotLose: "A" } });
    }

    // WB Final loser → LB R6 slot B (LB Final)
    if (wbFinal && lbR6[0]) {
      await tx.match.update({ where: { id: wbFinal.dbId }, data: { nextMatchLoseId: lbR6[0].dbId, nextSlotLose: "B" } });
    }
  }, { timeout: 20000 });

  revalidatePath(`/tournament/${id}`);
  revalidatePath(`/tournament/${id}/edit`);
  return { ok: true };
}

export async function resetMtpPhaseAction(
  id: string,
  phase: "POOL_A" | "POOL_B" | "CROSS_POOL" | "BARRAGE" | "DE"
): Promise<{ ok?: boolean; error?: string }> {
  const denied = await requireTournamentOrgaAccess(id);
  if (denied) return denied;

  const phaseMap: Record<string, string[]> = {
    POOL_A: ["MTP_POOL_A"],
    POOL_B: ["MTP_POOL_B"],
    CROSS_POOL: ["CROSS_POOL"],
    BARRAGE: ["MTP_BARRAGE"],
    DE: ["MTP_DE"],
  };

  // Cascading reset: resetting POOL_A/B clears everything; CROSS_POOL clears barrage+DE; BARRAGE clears DE
  const toClear: string[] = [];
  if (phase === "POOL_A" || phase === "POOL_B") {
    toClear.push("MTP_POOL_A", "MTP_POOL_B", "CROSS_POOL", "MTP_BARRAGE", "MTP_DE");
  } else if (phase === "CROSS_POOL") {
    toClear.push("CROSS_POOL", "MTP_BARRAGE", "MTP_DE");
  } else if (phase === "BARRAGE") {
    toClear.push("MTP_BARRAGE", "MTP_DE");
  } else {
    toClear.push(...phaseMap[phase]);
  }

  await prisma.$transaction(async (tx) => {
    await tx.matchEvent.deleteMany({ where: { match: { tournamentId: id, phase: { in: toClear as any[] } } } });
    await tx.match.deleteMany({ where: { tournamentId: id, phase: { in: toClear as any[] } } });
    if (phase === "POOL_A" || phase === "POOL_B") {
      // Also wipe any legacy POOL/BRACKET matches left over from a standard launch
      await tx.matchEvent.deleteMany({ where: { match: { tournamentId: id, phase: { in: ["POOL", "BRACKET", "CROSS_POOL", "SWISS"] as any[] } } } });
      await tx.match.deleteMany({ where: { tournamentId: id, phase: { in: ["POOL", "BRACKET", "CROSS_POOL", "SWISS"] as any[] } } });
      // Remove all pool records (MTP + legacy standard pools)
      const allPools = await tx.pool.findMany({ where: { tournamentId: id } });
      for (const pool of allPools) {
        await tx.poolTeam.deleteMany({ where: { poolId: pool.id } });
        await tx.pool.delete({ where: { id: pool.id } });
      }
    }
  });

  revalidatePath(`/tournament/${id}`);
  revalidatePath(`/tournament/${id}/edit`);
  return { ok: true };
}

export async function updateMtpTimesAction(
  tournamentId: string,
  mtpPoolAStart: string | null,
  mtpPoolBStart: string | null,
  mtpSundayStart: string | null
): Promise<{ ok?: boolean; error?: string }> {
  "use server";
  const denied = await requireTournamentOrgaAccess(tournamentId);
  if (denied) return denied;
  await (prisma.tournament.update as any)({
    where: { id: tournamentId },
    data: {
      mtpPoolAStart: mtpPoolAStart ? new Date(mtpPoolAStart) : null,
      mtpPoolBStart: mtpPoolBStart ? new Date(mtpPoolBStart) : null,
      mtpSundayStart: mtpSundayStart ? new Date(mtpSundayStart) : null,
    },
  });
  revalidatePath(`/tournament/${tournamentId}`);
  revalidatePath(`/tournament/${tournamentId}/edit`);
  return { ok: true };
}

export async function updateBerlinTimesAction(
  tournamentId: string,
  fridayGroupAStart: string | null,
  fridayGroupBStart: string | null
): Promise<{ ok?: boolean; error?: string }> {
  "use server";
  const denied = await requireTournamentOrgaAccess(tournamentId);
  if (denied) return denied;
  await (prisma.tournament.update as any)({
    where: { id: tournamentId },
    data: {
      fridayGroupAStart: fridayGroupAStart ? new Date(fridayGroupAStart) : null,
      fridayGroupBStart: fridayGroupBStart ? new Date(fridayGroupBStart) : null,
    },
  });
  revalidatePath(`/tournament/${tournamentId}`);
  revalidatePath(`/tournament/${tournamentId}/edit`);
  return { ok: true };
}

export async function updatePoolRoundsAction(tournamentId: string, poolRounds: number | null) {
  "use server";
  const denied = await requireTournamentOrgaAccess(tournamentId);
  if (denied) return denied;
  if (poolRounds !== null && (poolRounds < 1 || poolRounds > 50 || !Number.isInteger(poolRounds))) {
    return { error: "Valeur invalide" };
  }
  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { poolRounds },
  });
  revalidatePath(`/tournament/${tournamentId}`);
  return { ok: true };
}
