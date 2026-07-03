/**
 * AUDIT PHASE 0 — simulation de tournois complets, format par format.
 *
 * Chaque test : crée un tournoi de test → déroule toutes les phases via les
 * vraies actions serveur → joue tous les matchs via la vraie route de score
 * → vérifie les invariants (pas de match bloqué, propagation cohérente,
 * vainqueur final, statut COMPLETED…).
 *
 * Lancer :  npx vitest run -c vitest.sim.config.ts
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { vi } from "vitest";

// ─── Mocks d'environnement (auth, cache, SSE, notifs) ────────────────────────
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  unstable_noStore: () => {},
}));
vi.mock("@/lib/orga-auth", () => ({
  getOrgaPlayerId: async () => "sim-player",
}));
vi.mock("@/lib/auth", () => ({
  auth: async () => ({ user: { id: "sim-user", playerId: "sim-player", role: "ADMIN" } }),
}));
vi.mock("@/lib/sse", () => ({
  publishMatchUpdate: () => {},
  publishNewMatches: () => {},
  publishTournamentUpdate: () => {},
}));
vi.mock("@/lib/notify", () => ({
  notifyTeamPlayers: async () => {},
  createNotification: async () => {},
}));
vi.mock("@/lib/web-push", () => ({
  sendPushToPlayer: async () => {},
}));

import { prisma } from "@/lib/db";
import {
  assertSimDatabase,
  resetSimDb,
  createSimTournament,
  playAllPlayable,
  loopRounds,
  checkInvariants,
  mulberry32,
  auditRows,
  printAuditReport,
  type SimTournamentOpts,
} from "./harness";
import {
  launchTournamentAction,
  generateBracketAction,
  generateCrossPoolAction,
  generateCrossPoolSEAction,
  launchGrazPoolAction,
  launchGrazSundayRRAction,
  launchGrazRegroupAction,
  launchGrazSEAction,
  launchKiosquePoolRoundAction,
  launchKiosqueRegroupAction,
  launchKiosqueNextRoundAction,
  launchKiosqueSEAction,
  launchMtpPoolAction,
  launchMtpNextRoundAction,
  launchMtpCrossPoolAction,
  launchMtpBarrageAction,
  launchMtpDEAction,
  launchBigAppleSwissRoundAction,
  launchBigApplePlacementAction,
  launchBigAppleSEAction,
} from "@/app/[locale]/tournament/[id]/edit/actions";
import {
  saveSplitSwissGroupsAction,
  generateSplitSwissRoundAction,
  generateSplitSwissBracketAction,
} from "@/app/[locale]/tournament/[id]/edit/split-swiss-actions";

// ─── Aide : dérouler un scénario et enregistrer le résultat d'audit ──────────

type Step = { name: string; run: (id: string, rng: () => number) => Promise<void> };

function expectOk(name: string) {
  return (res: { ok?: boolean; error?: string } | { error?: string } | null | undefined) => {
    if (res && "error" in res && res.error) throw new Error(`${name}: ${res.error}`);
  };
}

async function runScenario(label: string, opts: SimTournamentOpts, steps: Step[]): Promise<void> {
  const rng = mulberry32(42);
  const id = await createSimTournament(opts);
  let failure = "";
  try {
    for (const step of steps) {
      await step.run(id, rng);
    }
  } catch (e) {
    failure = e instanceof Error ? e.message : String(e);
  }
  const report = await checkInvariants(id);
  const detail = [failure && `ERREUR pendant "${label}": ${failure}`, ...report.problems].filter(Boolean).join("\n");
  const ok = !failure && report.problems.length === 0;
  auditRows.push({ format: label, ok, matches: report.stats.finished, detail });
  expect(detail, `${label}\n${detail}`).toBe("");
}

const play: Step = { name: "jouer", run: (id, rng) => playAllPlayable(id, rng).then(() => {}) };
const launch: Step = {
  name: "lancer",
  run: async (id) => expectOk("launchTournament")(await launchTournamentAction(id)),
};
const bracket: Step = {
  name: "bracket",
  run: async (id) => expectOk("generateBracket")(await generateBracketAction(id)),
};

// ─── Scénarios par format ─────────────────────────────────────────────────────

beforeAll(async () => {
  await assertSimDatabase();
});

beforeEach(async () => {
  await resetSimDb();
});

afterAll(() => {
  printAuditReport();
});

describe("Formats standards", () => {
  it("ALL_DAY + SE (8 équipes, 3e place)", async () => {
    await runScenario("ALL_DAY + SE ×8 (+3e)", {
      saturdayFormat: "ALL_DAY", sundayFormat: "SE", teamCount: 8, bracketSize: 8, thirdPlaceMatch: true,
    }, [launch, play, bracket, play]);
  });

  it("ALL_DAY + DE (8 équipes)", async () => {
    await runScenario("ALL_DAY + DE ×8", {
      saturdayFormat: "ALL_DAY", sundayFormat: "DE", teamCount: 8, bracketSize: 8,
    }, [launch, play, bracket, play]);
  });

  it("SPLIT_POOLS(2) + SE (16 équipes, 3e place)", async () => {
    await runScenario("SPLIT_POOLS×2 + SE ×16 (+3e)", {
      saturdayFormat: "SPLIT_POOLS", sundayFormat: "SE", teamCount: 16, poolCount: 2, bracketSize: 16, thirdPlaceMatch: true,
    }, [launch, play, bracket, play]);
  });

  it("SPLIT_POOLS(2) + DE (16 équipes)", async () => {
    await runScenario("SPLIT_POOLS×2 + DE ×16", {
      saturdayFormat: "SPLIT_POOLS", sundayFormat: "DE", teamCount: 16, poolCount: 2, bracketSize: 16,
    }, [launch, play, bracket, play]);
  });

  it("SPLIT_POOLS(2) + DE + GF reset (16 équipes)", async () => {
    await runScenario("SPLIT_POOLS×2 + DE ×16 (GF reset)", {
      saturdayFormat: "SPLIT_POOLS", sundayFormat: "DE", teamCount: 16, poolCount: 2, bracketSize: 16, gfReset: true,
    }, [launch, play, bracket, play]);
  });

  it("SPLIT_POOLS(2) + cross-pool + SE (16 équipes)", async () => {
    await runScenario("SPLIT_POOLS×2 + CROSS + SE ×16", {
      saturdayFormat: "SPLIT_POOLS", sundayFormat: "SE", teamCount: 16, poolCount: 2, crossPool: true, bracketSize: 8,
    }, [
      launch, play,
      { name: "crossPool", run: async (id) => expectOk("generateCrossPool")(await generateCrossPoolAction(id)) },
      play,
      { name: "crossPoolSE", run: async (id) => expectOk("generateCrossPoolSE")(await generateCrossPoolSEAction(id)) },
      play,
    ]);
  });

  it("SWISS + SE (16 équipes, 5 rounds)", async () => {
    await runScenario("SWISS(5) + SE ×16", {
      saturdayFormat: "SWISS", sundayFormat: "SE", teamCount: 16, swissRounds: 5, bracketSize: 8, thirdPlaceMatch: true,
    }, [launch, play, bracket, play]);
  });

  it("SWISS + DE (16 équipes, 5 rounds)", async () => {
    await runScenario("SWISS(5) + DE ×16", {
      saturdayFormat: "SWISS", sundayFormat: "DE", teamCount: 16, swissRounds: 5, bracketSize: 8,
    }, [launch, play, bracket, play]);
  });

  it("SWISS + SWISS_SPLIT_SE (18 équipes, 6 rounds)", async () => {
    await runScenario("SWISS(6) + SWISS_SPLIT_SE ×18", {
      saturdayFormat: "SWISS", sundayFormat: "SWISS_SPLIT_SE", teamCount: 18, swissRounds: 6, bracketSize: 18,
    }, [launch, play, bracket, play]);
  });

  it("SPLIT_POOLS(2) + SPLIT_SE (16 équipes)", async () => {
    await runScenario("SPLIT_POOLS×2 + SPLIT_SE ×16", {
      saturdayFormat: "SPLIT_POOLS", sundayFormat: "SPLIT_SE", teamCount: 16, poolCount: 2, bracketSize: 16,
    }, [launch, play, bracket, play]);
  });
});

describe("Formats spéciaux", () => {
  it("GRAZ (16 équipes)", async () => {
    await runScenario("GRAZ ×16", {
      saturdayFormat: "GRAZ", sundayFormat: "SE", teamCount: 16, poolCount: 2, swissRounds: 7, bracketSize: 8, thirdPlaceMatch: true, courtsCount: 1,
    }, [
      launch, play, // Pool A (5 rounds samedi)
      { name: "poolB", run: async (id) => expectOk("grazPoolB")(await launchGrazPoolAction(id, "Pool B")) },
      play,
      { name: "sundayRR", run: async (id) => expectOk("grazSundayRR")(await launchGrazSundayRRAction(id)) },
      play,
      { name: "regroup", run: async (id) => expectOk("grazRegroup")(await launchGrazRegroupAction(id)) },
      play,
      { name: "SE", run: async (id) => expectOk("grazSE")(await launchGrazSEAction(id)) },
      play,
    ]);
  });

  it("KIOSQUE (16 équipes)", async () => {
    await runScenario("KIOSQUE ×16", {
      saturdayFormat: "KIOSQUE", sundayFormat: "SE", teamCount: 16, poolCount: 2, swissRounds: 5, bracketSize: 8,
    }, [
      launch, // génère round 1 des 2 pools
      { name: "poolRounds", run: (id, rng) => loopRounds(id, rng, [
        () => launchKiosquePoolRoundAction(id, "Pool A"),
        () => launchKiosquePoolRoundAction(id, "Pool B"),
      ]) },
      { name: "regroup", run: async (id) => expectOk("kiosqueRegroup")(await launchKiosqueRegroupAction(id)) },
      { name: "regroupRounds", run: (id, rng) => loopRounds(id, rng, [
        () => launchKiosqueNextRoundAction(id, "Top 4"),
        () => launchKiosqueNextRoundAction(id, "Bottom 12"),
      ]) },
      { name: "SE", run: async (id) => expectOk("kiosqueSE")(await launchKiosqueSEAction(id)) },
      play,
    ]);
  });

  it("MTP_OPEN (20 équipes)", async () => {
    await runScenario("MTP_OPEN ×20", {
      saturdayFormat: "MTP_OPEN", sundayFormat: "DE", teamCount: 20, poolCount: 2, swissRounds: 9, bracketSize: 16, gfReset: true,
    }, [
      launch, // LIVE seulement
      { name: "poolA", run: async (id) => expectOk("mtpPoolA")(await launchMtpPoolAction(id, "A")) },
      { name: "poolB", run: async (id) => expectOk("mtpPoolB")(await launchMtpPoolAction(id, "B")) },
      { name: "poolRounds", run: (id, rng) => loopRounds(id, rng, [
        () => launchMtpNextRoundAction(id, "A"),
        () => launchMtpNextRoundAction(id, "B"),
      ]) },
      { name: "crossPool", run: async (id) => expectOk("mtpCross")(await launchMtpCrossPoolAction(id)) },
      play,
      { name: "barrage", run: async (id) => expectOk("mtpBarrage")(await launchMtpBarrageAction(id)) },
      play,
      { name: "DE", run: async (id) => expectOk("mtpDE")(await launchMtpDEAction(id)) },
      play,
    ]);
  });

  it("BIG_APPLE (16 équipes)", async () => {
    await runScenario("BIG_APPLE ×16", {
      saturdayFormat: "BIG_APPLE", sundayFormat: "SE", teamCount: 16, poolCount: 2, swissRounds: 7, bracketSize: 8, thirdPlaceMatch: true,
    }, [
      launch, play, // RR complet des 2 pools
      { name: "swiss", run: (id, rng) => loopRounds(id, rng, [() => launchBigAppleSwissRoundAction(id)]) },
      { name: "placement", run: async (id) => expectOk("baPlacement")(await launchBigApplePlacementAction(id)) },
      play,
      { name: "SE", run: async (id) => expectOk("baSE")(await launchBigAppleSEAction(id)) },
      play,
    ]);
  });

  it("SPLIT_SWISS (16 équipes)", async () => {
    await runScenario("SPLIT_SWISS ×16", {
      saturdayFormat: "SPLIT_SWISS", sundayFormat: "DE", teamCount: 16, swissRounds: 5, saturdayRounds: 5, bracketSize: 16, status: "LIVE",
    }, [
      { name: "groups", run: async (id) => {
        const teams = await prisma.team.findMany({ where: { tournamentId: id }, orderBy: { seed: "asc" } });
        const groupA = teams.filter((_, i) => i % 2 === 0).map((t) => t.id);
        const groupB = teams.filter((_, i) => i % 2 === 1).map((t) => t.id);
        expectOk("saveGroups")(await saveSplitSwissGroupsAction(id, groupA, groupB));
      } },
      { name: "swissRounds", run: (id, rng) => loopRounds(id, rng, [
        () => generateSplitSwissRoundAction(id, "A"),
        () => generateSplitSwissRoundAction(id, "B"),
      ]) },
      { name: "bracket", run: async (id) => expectOk("splitSwissBracket")(await generateSplitSwissBracketAction(id)) },
      play,
    ]);
  });
});
