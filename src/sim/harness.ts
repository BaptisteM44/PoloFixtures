/**
 * Harnais de simulation — Phase 0 de la refonte formats.
 *
 * Joue des tournois COMPLETS contre la DB locale jetable en passant par :
 *   - les vraies actions serveur (launch, generate, regroup, SE…)
 *   - la vraie route de saisie de score (PUT /api/matches/[id])
 * pour auditer fidèlement chaque format tel qu'il tourne en prod.
 *
 * SÉCURITÉ : refuse de tourner si la DB n'est pas bikepolo_sim sur localhost:5433.
 */
import { prisma } from "@/lib/db";
import { PUT as putMatch } from "@/app/api/matches/[id]/route";
import type { MatchPhase, SaturdayFormat, SundayFormat } from "@prisma/client";
import { assertSimDatabase, resetSimDb, mulberry32 } from "./sim-db";

// Ré-exports (compat) — les utilitaires DB vivent dans sim-db.ts (module léger)
export { assertSimDatabase, resetSimDb, mulberry32 };

const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── Création de tournoi de test ─────────────────────────────────────────────

export type SimTournamentOpts = {
  saturdayFormat: SaturdayFormat;
  sundayFormat: SundayFormat;
  teamCount: number;
  courtsCount?: number;
  poolCount?: number;
  crossPool?: boolean;
  swissRounds?: number;
  bracketSize?: number;
  thirdPlaceMatch?: boolean;
  gfReset?: boolean;
  saturdayRounds?: number;
  status?: "UPCOMING" | "LIVE";
};

export async function createSimTournament(opts: SimTournamentOpts): Promise<string> {
  const t = await prisma.tournament.create({
    data: {
      name: `SIM ${opts.saturdayFormat}+${opts.sundayFormat} ${opts.teamCount}t`,
      continentCode: "EU",
      country: "BE",
      city: "SimCity",
      dateStart: new Date("2026-08-01T09:00:00Z"),
      dateEnd: new Date("2026-08-02T18:00:00Z"),
      format: "sim",
      gameDurationMin: 12,
      maxTeams: opts.teamCount,
      registrationFeePerTeam: 0,
      registrationFeeCurrency: "EUR",
      contactEmail: "sim@test.local",
      saturdayFormat: opts.saturdayFormat,
      sundayFormat: opts.sundayFormat,
      status: opts.status ?? "UPCOMING",
      courtsCount: opts.courtsCount ?? 2,
      poolCount: opts.poolCount ?? 1,
      crossPool: opts.crossPool ?? false,
      swissRounds: opts.swissRounds ?? 5,
      bracketSize: opts.bracketSize ?? opts.teamCount,
      thirdPlaceMatch: opts.thirdPlaceMatch ?? false,
      gfReset: opts.gfReset ?? false,
      ...(opts.saturdayRounds != null ? ({ saturdayRounds: opts.saturdayRounds } as Record<string, unknown>) : {}),
      testMode: true,
      hidden: true,
    } as never,
  });
  await prisma.team.createMany({
    data: Array.from({ length: opts.teamCount }, (_, i) => ({
      tournamentId: t.id,
      name: `Team ${String(i + 1).padStart(2, "0")}`,
      seed: i + 1,
    })),
  });
  return t.id;
}

// ─── Jouer les matchs via la VRAIE route de score ────────────────────────────

export async function playMatch(matchId: string, scoreA: number, scoreB: number): Promise<void> {
  const req = new Request(`http://sim.local/api/matches/${matchId}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "FINISHED", scoreA, scoreB }),
  });
  const res = await putMatch(req, { params: { id: matchId } });
  if (res.status >= 400) {
    throw new Error(`playMatch ${matchId} → HTTP ${res.status}: ${await res.text()}`);
  }
}

/**
 * Joue tous les matchs jouables (les 2 équipes assignées, non terminés),
 * en boucle : la propagation bracket et les auto-générations de rounds
 * remplissent de nouveaux matchs au fur et à mesure.
 * Pas d'égalités générées (v1 : usage nominal).
 */
export async function playAllPlayable(tournamentId: string, rng: () => number): Promise<number> {
  let played = 0;
  for (let guard = 0; ; guard++) {
    if (guard > 80) throw new Error(`playAllPlayable: boucle de génération suspecte (>80 itérations, ${played} matchs joués)`);
    const playable = await prisma.match.findMany({
      where: {
        tournamentId,
        status: { in: ["SCHEDULED", "LIVE"] },
        teamAId: { not: null },
        teamBId: { not: null },
      },
      orderBy: [{ roundIndex: "asc" }, { startAt: "asc" }, { id: "asc" }],
    });
    if (playable.length === 0) {
      // Laisser retomber les générations fire-and-forget de la route, puis re-vérifier
      await settle(200);
      const again = await prisma.match.count({
        where: { tournamentId, status: { in: ["SCHEDULED", "LIVE"] }, teamAId: { not: null }, teamBId: { not: null } },
      });
      if (again === 0) return played;
      continue;
    }
    for (const m of playable) {
      const fresh = await prisma.match.findUnique({ where: { id: m.id }, select: { status: true } });
      if (!fresh || fresh.status === "FINISHED") continue;
      let a = Math.floor(rng() * 6);
      let b = Math.floor(rng() * 6);
      if (a === b) a += 1; // pas d'égalité en v1
      await playMatch(m.id, a, b);
      played++;
    }
    await settle(120);
  }
}

/**
 * Boucle générique "générer le round suivant puis jouer" pour les formats
 * à rounds pilotés par action (Kiosque, MTP, Big Apple Swiss…).
 * S'arrête quand plus aucune action ne produit de succès.
 */
export async function loopRounds(
  tournamentId: string,
  rng: () => number,
  actions: Array<() => Promise<{ ok?: boolean; error?: string } | { error: string } | null | undefined>>
): Promise<void> {
  for (let i = 0; i < 30; i++) {
    await playAllPlayable(tournamentId, rng);
    let progressed = false;
    for (const act of actions) {
      const res = await act().catch((e) => ({ error: String(e) }));
      if (res && !("error" in res && res.error)) progressed = true;
    }
    if (!progressed) {
      await playAllPlayable(tournamentId, rng);
      return;
    }
  }
  throw new Error("loopRounds: >30 itérations, format sans fin ?");
}

// ─── Invariants ──────────────────────────────────────────────────────────────

const BRACKET_PHASES: MatchPhase[] = ["BRACKET", "GRAZ_SE", "KIOSQUE_SE", "MTP_DE", "BIG_APPLE_SE", "TOP32", "BOTTOM16"];

export type InvariantReport = {
  problems: string[];
  stats: { totalMatches: number; finished: number; status: string };
};

export async function checkInvariants(tournamentId: string): Promise<InvariantReport> {
  const problems: string[] = [];
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { teams: { where: { selected: true } }, matches: true },
  });
  if (!tournament) return { problems: ["tournoi introuvable"], stats: { totalMatches: 0, finished: 0, status: "?" } };

  const allMatches = tournament.matches;
  const teamIds = new Set(tournament.teams.map((t) => t.id));
  const byId = new Map(allMatches.map((m) => [m.id, m]));

  // Cas légitime : le match "GF reset" (bracketSide BG) reste vide si le joueur
  // du winner bracket (slot A) gagne la grande finale — il n'est jamais activé.
  const isDormantGfReset = (m: (typeof allMatches)[number]) => {
    if (m.bracketSide !== "BG" || m.teamAId || m.teamBId) return false;
    const gf = allMatches.find((g) => g.phase === m.phase && g.bracketSide === "G" && g.status === "FINISHED");
    return !!gf && !!gf.winnerTeamId && gf.winnerTeamId === gf.teamAId;
  };
  const matches = allMatches.filter((m) => !isDormantGfReset(m));

  // 1. Matchs bloqués : non terminés alors que les 2 équipes sont là
  const stuck = matches.filter((m) => m.status !== "FINISHED" && m.teamAId && m.teamBId);
  if (stuck.length > 0) {
    problems.push(`${stuck.length} match(s) BLOQUÉ(S) non joué(s): ${stuck.slice(0, 5).map((m) => `${m.phase} R${m.roundIndex}#${m.positionInRound}`).join(", ")}`);
  }

  // 2. Slots jamais remplis : matchs avec au moins un slot vide à la fin
  const emptySlots = matches.filter((m) => m.status !== "FINISHED" && (!m.teamAId || !m.teamBId));
  if (emptySlots.length > 0) {
    problems.push(`${emptySlots.length} match(s) avec SLOT VIDE jamais rempli: ${emptySlots.slice(0, 5).map((m) => `${m.phase} R${m.roundIndex}#${m.positionInRound}[${m.teamAId ? "A✓" : "A∅"}${m.teamBId ? "B✓" : "B∅"}]`).join(", ")}`);
  }

  // 3. Vainqueur manquant sur match de bracket terminé
  const noWinner = matches.filter((m) => m.status === "FINISHED" && BRACKET_PHASES.includes(m.phase) && !m.winnerTeamId);
  if (noWinner.length > 0) {
    problems.push(`${noWinner.length} match(s) de bracket terminés SANS winnerTeamId (${noWinner.slice(0, 3).map((m) => `${m.phase} R${m.roundIndex}`).join(", ")})`);
  }

  // 4. Cohérence de propagation : le vainqueur doit être dans le match suivant
  for (const m of matches) {
    if (m.status !== "FINISHED" || !m.winnerTeamId) continue;
    if (m.nextMatchWinId) {
      const next = byId.get(m.nextMatchWinId);
      if (next && next.teamAId !== m.winnerTeamId && next.teamBId !== m.winnerTeamId) {
        problems.push(`PROPAGATION cassée: vainqueur de ${m.phase} R${m.roundIndex}#${m.positionInRound} absent du match suivant ${next.phase} R${next.roundIndex}#${next.positionInRound}`);
      }
    }
    if (m.nextMatchLoseId && m.teamAId && m.teamBId) {
      const loser = m.winnerTeamId === m.teamAId ? m.teamBId : m.teamAId;
      const next = byId.get(m.nextMatchLoseId);
      if (next && next.teamAId !== loser && next.teamBId !== loser) {
        problems.push(`PROPAGATION perdant cassée: perdant de ${m.phase} R${m.roundIndex}#${m.positionInRound} absent de ${next.phase} R${next.roundIndex}#${next.positionInRound}`);
      }
    }
  }

  // 5. Équipe contre elle-même / équipes étrangères
  for (const m of matches) {
    if (m.teamAId && m.teamAId === m.teamBId) problems.push(`Match ${m.phase} R${m.roundIndex}: équipe contre elle-même`);
    if (m.teamAId && !teamIds.has(m.teamAId)) problems.push(`Match ${m.phase} R${m.roundIndex}: teamA étrangère au tournoi`);
    if (m.teamBId && !teamIds.has(m.teamBId)) problems.push(`Match ${m.phase} R${m.roundIndex}: teamB étrangère au tournoi`);
  }

  // 6. Doublons de créneau : une équipe sur 2 matchs au même horaire exact
  const slotMap = new Map<string, string>();
  for (const m of matches) {
    for (const tid of [m.teamAId, m.teamBId]) {
      if (!tid) continue;
      const key = `${tid}|${m.startAt.toISOString()}`;
      if (slotMap.has(key)) problems.push(`CONFLIT horaire: équipe sur 2 matchs à ${m.startAt.toISOString()} (${m.phase} + ${slotMap.get(key)})`);
      else slotMap.set(key, m.phase);
    }
  }

  // 7. Le tournoi doit être passé COMPLETED (la finale a un vainqueur détecté)
  if (tournament.status !== "COMPLETED") {
    problems.push(`Statut final = ${tournament.status}, attendu COMPLETED (détection de fin de tournoi cassée pour ce format ?)`);
  }

  return {
    problems,
    stats: {
      totalMatches: matches.length,
      finished: matches.filter((m) => m.status === "FINISHED").length,
      status: tournament.status,
    },
  };
}

// ─── Rapport d'audit ─────────────────────────────────────────────────────────

export type AuditRow = { format: string; ok: boolean; matches: number; detail: string };
export const auditRows: AuditRow[] = [];

export function printAuditReport(): void {
  const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length));
  console.log("\n╔════════════════════ AUDIT FORMATS — PHASE 0 ════════════════════╗");
  for (const r of auditRows) {
    console.log(`║ ${r.ok ? "✅" : "❌"} ${pad(r.format, 34)} ${pad(String(r.matches) + " matchs", 12)} ${r.ok ? "OK" : r.detail.slice(0, 60)}`);
  }
  console.log("╚══════════════════════════════════════════════════════════════════╝\n");
  for (const r of auditRows.filter((r) => !r.ok)) {
    console.log(`─── ❌ ${r.format} ───\n${r.detail}\n`);
  }
}
