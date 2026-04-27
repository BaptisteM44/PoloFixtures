/**
 * One-off script: Fix GRAZ_RR match pairings for Hendlbar Open 2026 🐔
 * Tournament ID: cmo3iwi0i00051p8f51cozbir
 *
 * SAFE: Only UPDATEs existing matches (teamAId/teamBId/startAt)
 *       and CREATEs missing matches. Never deletes anything.
 *
 * Run: npx tsx prisma/fix-graz-pairings.ts
 * Run (dry-run): npx tsx prisma/fix-graz-pairings.ts --dry
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes("--dry");

const TOURNAMENT_ID = "cmo3iwi0i00051p8f51cozbir";
const POOL_A_ID = "cmobl8fd30002134j148tjo2p";
const POOL_B_ID = "cmobl8fdh000c134j2l5hr3fp";
const TZ_OFFSET_H = 2; // Graz CEST (UTC+2) en avril

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Converts a "HH:MM" local (CEST) time on a given UTC base-date to a UTC Date */
function cest(baseUTC: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(baseUTC);
  // baseUTC is already at midnight UTC of that day (set via setUTCHours below)
  d.setUTCHours(h - TZ_OFFSET_H, m, 0, 0);
  return d;
}

/** Build a UTC midnight Date for a given YYYY-MM-DD */
function utcDay(yyyy: number, mm: number, dd: number): Date {
  return new Date(Date.UTC(yyyy, mm - 1, dd));
}

// ─── Données ──────────────────────────────────────────────────────────────────

const SAT = utcDay(2026, 4, 25); // samedi 25 avril 2026
const SUN = utcDay(2026, 4, 26); // dimanche 26 avril 2026

/**
 * Pool A — Day 1 (SAT)
 * Chaque entrée: [teamA, teamB, heure CEST]
 */
const POOL_A_DAY1: [string, string, string][] = [
  // R1
  ["CRUCCHI", "LOS NUGGETS", "8:15"],
  ["DIAGONAL BOI", "LIK", "8:30"],
  ["ADRIATIC BLUES", "Banana Bike Boys", "8:45"],
  ["CAIGO", "KRAKUSKI Z CZEKOLADĄ", "9:00"],
  // R2
  ["CRUCCHI", "DIAGONAL BOI", "9:15"],
  ["LOS NUGGETS", "LIK", "9:30"],
  ["ADRIATIC BLUES", "CAIGO", "9:45"],
  ["Banana Bike Boys", "KRAKUSKI Z CZEKOLADĄ", "10:00"],
  // R3
  ["CRUCCHI", "LIK", "10:15"],
  ["LOS NUGGETS", "DIAGONAL BOI", "10:30"],
  ["ADRIATIC BLUES", "KRAKUSKI Z CZEKOLADĄ", "10:45"],
  ["Banana Bike Boys", "CAIGO", "11:00"],
  // R4
  ["CRUCCHI", "ADRIATIC BLUES", "11:15"],
  ["LOS NUGGETS", "Banana Bike Boys", "11:30"],
  ["DIAGONAL BOI", "CAIGO", "11:45"],
  ["LIK", "KRAKUSKI Z CZEKOLADĄ", "12:00"],
  // R5
  ["CRUCCHI", "Banana Bike Boys", "12:15"],
  ["LOS NUGGETS", "ADRIATIC BLUES", "12:30"],
  ["DIAGONAL BOI", "KRAKUSKI Z CZEKOLADĄ", "12:45"],
  ["LIK", "CAIGO", "13:00"],
];

/**
 * Pool B — Day 1 (SAT)
 */
const POOL_B_DAY1: [string, string, string][] = [
  // R1
  ["CHICKEN BANANA", "HENDL WITH CARE", "13:15"],
  ["MEDUSA", "GRAZIELLA", "13:30"],
  ["SAFETY THIRD", "GOLEM", "13:45"],
  ["STEELCITY", "WEDEGEHNTE", "14:00"],
  // R2
  ["CHICKEN BANANA", "MEDUSA", "14:15"],
  ["HENDL WITH CARE", "GRAZIELLA", "14:30"],
  ["SAFETY THIRD", "STEELCITY", "14:45"],
  ["GOLEM", "WEDEGEHNTE", "15:00"],
  // R3
  ["CHICKEN BANANA", "GRAZIELLA", "15:15"],
  ["HENDL WITH CARE", "MEDUSA", "15:30"],
  ["SAFETY THIRD", "WEDEGEHNTE", "15:45"],
  ["GOLEM", "STEELCITY", "16:00"],
  // R4
  ["CHICKEN BANANA", "SAFETY THIRD", "16:15"],
  ["HENDL WITH CARE", "GOLEM", "16:30"],
  ["MEDUSA", "STEELCITY", "16:45"],
  ["GRAZIELLA", "WEDEGEHNTE", "17:00"],
  // R5
  ["CHICKEN BANANA", "GOLEM", "17:15"],
  ["HENDL WITH CARE", "SAFETY THIRD", "17:30"],
  ["MEDUSA", "WEDEGEHNTE", "17:45"],
  ["GRAZIELLA", "STEELCITY", "18:00"],
];

/**
 * Day 2 (SUN) — Rounds 6 et 7 pour les deux pools
 * AN = Pool B (afternoon/morning pool B), M = Pool A (morning pool A)
 */
const DAY2: { pool: "A" | "B"; round: 6 | 7; teamA: string; teamB: string; time: string }[] = [
  // Pool B R6 ("AN R6")
  { pool: "B", round: 6, teamA: "CHICKEN BANANA", teamB: "STEELCITY", time: "8:15" },
  { pool: "B", round: 6, teamA: "HENDL WITH CARE", teamB: "WEDEGEHNTE", time: "8:30" },
  { pool: "B", round: 6, teamA: "MEDUSA", teamB: "SAFETY THIRD", time: "8:45" },
  { pool: "B", round: 6, teamA: "GRAZIELLA", teamB: "GOLEM", time: "9:00" },
  // Pool A R6 ("M R6")
  { pool: "A", round: 6, teamA: "CRUCCHI", teamB: "CAIGO", time: "9:15" },
  { pool: "A", round: 6, teamA: "LOS NUGGETS", teamB: "KRAKUSKI Z CZEKOLADĄ", time: "9:30" },
  { pool: "A", round: 6, teamA: "DIAGONAL BOI", teamB: "ADRIATIC BLUES", time: "9:45" },
  { pool: "A", round: 6, teamA: "LIK", teamB: "Banana Bike Boys", time: "10:00" },
  // Pool B R7 ("AN R7")
  { pool: "B", round: 7, teamA: "CHICKEN BANANA", teamB: "WEDEGEHNTE", time: "10:15" },
  { pool: "B", round: 7, teamA: "HENDL WITH CARE", teamB: "STEELCITY", time: "10:30" },
  { pool: "B", round: 7, teamA: "MEDUSA", teamB: "GOLEM", time: "10:45" },
  { pool: "B", round: 7, teamA: "GRAZIELLA", teamB: "SAFETY THIRD", time: "11:00" },
  // Pool A R7 ("M R7")
  { pool: "A", round: 7, teamA: "CRUCCHI", teamB: "KRAKUSKI Z CZEKOLADĄ", time: "11:15" },
  { pool: "A", round: 7, teamA: "LOS NUGGETS", teamB: "CAIGO", time: "11:30" },
  { pool: "A", round: 7, teamA: "LIK", teamB: "ADRIATIC BLUES", time: "11:45" },
  { pool: "A", round: 7, teamA: "DIAGONAL BOI", teamB: "Banana Bike Boys", time: "12:00" },
];

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(DRY_RUN ? "🔍 DRY RUN — aucune écriture en base" : "✏️  MODE RÉEL — écriture en base");
  console.log("");

  // 1. Charger les équipes
  const teams = await prisma.team.findMany({
    where: { tournamentId: TOURNAMENT_ID },
    select: { id: true, name: true },
  });

  const teamMap = new Map<string, string>(); // lowercase name → id
  for (const t of teams) {
    teamMap.set(t.name.toLowerCase(), t.id);
  }

  function tid(name: string): string {
    const id = teamMap.get(name.toLowerCase());
    if (!id) {
      // Fallback: match partiel pour les noms avec diacritiques (ex: Krakuski z Czekolada vs Czekoladą)
      const norm = (s: string) =>
        s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      for (const [k, v] of teamMap) {
        if (norm(k) === norm(name)) return v;
      }
      throw new Error(`❌ Équipe introuvable: "${name}"`);
    }
    return id;
  }

  // 2. Vérifier les 20 matchs existants
  const existing = await prisma.match.findMany({
    where: { tournamentId: TOURNAMENT_ID, phase: "GRAZ_RR" },
    orderBy: [{ roundIndex: "asc" }, { id: "asc" }],
  });

  if (existing.length !== 20) {
    throw new Error(`Attendu 20 matchs GRAZ_RR existants, trouvé ${existing.length}. Abandon.`);
  }

  // ── Étape 1: UPDATE les 20 matchs existants → Pool A Day 1 ──────────────────
  console.log("── Étape 1: UPDATE 20 matchs existants → Pool A Day 1 ──────────────");
  for (let i = 0; i < 20; i++) {
    const match = existing[i];
    const [nameA, nameB, time] = POOL_A_DAY1[i];
    const roundIndex = Math.floor(i / 4) + 1;
    const positionInRound = i % 4;
    const startAt = cest(SAT, time);

    console.log(
      `  UPDATE match ${match.id} → R${roundIndex} [${time}] ${nameA} vs ${nameB}`
    );

    if (!DRY_RUN) {
      await prisma.match.update({
        where: { id: match.id },
        data: {
          teamAId: tid(nameA),
          teamBId: tid(nameB),
          poolId: POOL_A_ID,
          roundIndex,
          positionInRound,
          startAt,
          dayIndex: "SAT",
        },
      });
    }
  }

  // ── Étape 2: CREATE 20 matchs Pool B Day 1 ───────────────────────────────────
  console.log("");
  console.log("── Étape 2: CREATE 20 matchs Pool B Day 1 ──────────────────────────");
  for (let i = 0; i < 20; i++) {
    const [nameA, nameB, time] = POOL_B_DAY1[i];
    const roundIndex = Math.floor(i / 4) + 1;
    const positionInRound = i % 4;
    const startAt = cest(SAT, time);

    console.log(`  CREATE Pool B R${roundIndex} [${time}] ${nameA} vs ${nameB}`);

    if (!DRY_RUN) {
      await prisma.match.create({
        data: {
          tournamentId: TOURNAMENT_ID,
          phase: "GRAZ_RR",
          poolId: POOL_B_ID,
          roundIndex,
          positionInRound,
          courtName: "Court 1",
          startAt,
          dayIndex: "SAT",
          status: "SCHEDULED",
          teamAId: tid(nameA),
          teamBId: tid(nameB),
        },
      });
    }
  }

  // ── Étape 3: CREATE 16 matchs Day 2 (R6 + R7) ───────────────────────────────
  console.log("");
  console.log("── Étape 3: CREATE 16 matchs Day 2 (R6 + R7) ──────────────────────");
  for (const m of DAY2) {
    const poolId = m.pool === "A" ? POOL_A_ID : POOL_B_ID;
    const startAt = cest(SUN, m.time);

    console.log(`  CREATE Pool ${m.pool} R${m.round} [${m.time}] ${m.teamA} vs ${m.teamB}`);

    if (!DRY_RUN) {
      await prisma.match.create({
        data: {
          tournamentId: TOURNAMENT_ID,
          phase: "GRAZ_RR",
          poolId,
          roundIndex: m.round,
          positionInRound: 0,
          courtName: "Court 1",
          startAt,
          dayIndex: "SUN",
          status: "SCHEDULED",
          teamAId: tid(m.teamA),
          teamBId: tid(m.teamB),
        },
      });
    }
  }

  console.log("");
  console.log(`✅ Terminé ! 20 matchs mis à jour + 36 matchs créés.`);
  if (DRY_RUN) {
    console.log("   (dry-run : rien n'a été écrit en base)");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
