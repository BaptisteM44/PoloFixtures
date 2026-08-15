"use server";

/**
 * Actions du bac à sable — création de tournois fictifs et pilotage du
 * pipeline. Ouvert à tout joueur connecté ; chaque action vérifie en plus
 * testMode+usesPipeline (impossible de toucher un vrai tournoi depuis ici).
 */
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import {
  createStages,
  launchStage,
  resetStages,
  simulateOnePass,
  simulateStage,
  simulateAll,
  applyScore,
} from "@/engine/pipeline-server";
import { getPreset } from "@/engine/presets";
import { validateCustomPipeline } from "@/engine/pipeline-validation";
import { generateTournamentSlug } from "@/lib/slug";
import { hasAtLeastRole } from "@/lib/rbac";

async function requireSandboxAccess(): Promise<{ playerId: string; isAdmin: boolean } | { error: string }> {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!playerId) return { error: "Connexion requise." };
  return { playerId, isAdmin: hasAtLeastRole(session?.user?.role, "ADMIN") };
}

/**
 * Vérifie que le tournoi est bien un bac à sable pipeline ET appartient au
 * joueur connecté (ou que l'appelant est admin) — chaque joueur ne
 * pilote/supprime que ses propres tests, sauf un admin qui peut dépanner.
 */
async function requireSandboxTournament(id: string, playerId: string, isAdmin: boolean) {
  const t = await prisma.tournament.findUnique({
    where: { id },
    select: { id: true, testMode: true, creatorId: true, usesPipeline: true } as never,
  }) as { id: string; testMode: boolean; creatorId: string | null; usesPipeline: boolean } | null;
  if (!t || !t.testMode || !t.usesPipeline) return null;
  if (t.creatorId !== playerId && !isAdmin) return null;
  return t;
}

const FAKE_TEAM_NAMES = [
  "Les Aigles", "Rustines FC", "Mallet Munkys", "Polo Rats", "Les Casse-Rayons",
  "Bec & Roues", "Los Pedales", "Guidon Furieux", "Les Chamois", "Fixie Fever",
  "Roue Libre", "Les Blaireaux", "Pignon Fixe", "La Meute", "Vélo Vipères",
  "Court Circuit", "Les Renards", "Cambouis Club", "La Volée", "Frein Arrière",
  "Les Hérissons", "Tricycle Gang", "Portière Ouverte", "Les Marmottes",
];

const FAKE_PLAYER_NAMES = [
  "Alex", "Camille", "Charlie", "Dominique", "Eden", "Elliot", "Lou", "Marley",
  "Maxime", "Morgan", "Noa", "Robin", "Sacha", "Sam", "Stevie", "Yaël",
];

/**
 * Crée les équipes fictives + 3 joueurs fictifs par équipe (pour que les
 * vraies pages se comportent comme avec de vraies inscriptions : bouton ⋯
 * noms des joueurs, etc.). Les joueurs sont marqués REJECTED (invisibles
 * partout côté public) avec un slug `sandbox-{tournoi}-{n}` qui permet de
 * les supprimer avec le tournoi.
 */
async function seedFakeTeams(tournamentId: string, teamCount: number) {
  await prisma.team.createMany({
    data: Array.from({ length: teamCount }, (_, i) => ({
      tournamentId,
      name: FAKE_TEAM_NAMES[i] ?? `Équipe ${i + 1}`,
      seed: i + 1,
    })),
  });
  const teams = await prisma.team.findMany({
    where: { tournamentId },
    orderBy: { seed: "asc" },
    select: { id: true, name: true },
  });
  let n = 0;
  for (const team of teams) {
    for (let j = 0; j < 3; j++) {
      const firstName = FAKE_PLAYER_NAMES[(n + j) % FAKE_PLAYER_NAMES.length];
      const player = await prisma.player.create({
        data: {
          name: `${firstName} ${team.name.split(" ").pop() ?? ""}`.trim(),
          slug: `sandbox-${tournamentId}-${n + j}`,
          country: "XX",
          status: "REJECTED",
        },
        select: { id: true },
      });
      await prisma.teamPlayer.create({
        data: { teamId: team.id, playerId: player.id, isCaptain: j === 0 },
      });
    }
    n += 3;
  }
}

export async function createSandboxAction(input: {
  presetKey: string;
  teamCount: number;
  courtsCount: number;
  gameDurationMin: number;
}): Promise<{ id?: string; error?: string }> {
  const access = await requireSandboxAccess();
  if ("error" in access) return { error: access.error };

  const preset = getPreset(input.presetKey);
  if (!preset) return { error: "Preset inconnu." };
  const teamCount = Math.max(preset.minTeams, Math.min(input.teamCount, 64));

  const now = new Date();
  const name = `🧪 ${preset.label} — ${teamCount} équipes`;
  const slug = await generateTournamentSlug(name, "sandbox", now.getFullYear());
  const t = await prisma.tournament.create({
    data: {
      name,
      slug,
      continentCode: "EU",
      country: "BE",
      city: "Bac à sable",
      dateStart: now,
      dateEnd: new Date(now.getTime() + 36 * 3600_000),
      format: "pipeline",
      gameDurationMin: Math.max(5, Math.min(input.gameDurationMin || 12, 40)),
      maxTeams: teamCount,
      registrationFeePerTeam: 0,
      registrationFeeCurrency: "EUR",
      contactEmail: "sandbox@polo.local",
      saturdayFormat: "ALL_DAY",
      sundayFormat: "SE",
      status: "UPCOMING",
      courtsCount: Math.max(1, Math.min(input.courtsCount || 2, 4)),
      timezone: "Europe/Brussels",
      usesPipeline: true,
      testMode: true,
      createdViaSandbox: true,
      hidden: true,
      approved: true,
      creatorId: access.playerId,
    } as never,
  });

  await seedFakeTeams(t.id, teamCount);

  await createStages(t.id, preset.build(teamCount));

  revalidatePath("/sandbox");
  return { id: t.id };
}

/** Crée un tournoi de test à partir d'un pipeline composé librement dans le builder. */
export async function createCustomSandboxAction(input: {
  name: string;
  teamCount: number;
  courtsCount: number;
  gameDurationMin: number;
  stages: unknown;
}): Promise<{ id?: string; error?: string }> {
  const access = await requireSandboxAccess();
  if ("error" in access) return { error: access.error };

  const validated = validateCustomPipeline(input.stages);
  if (!validated.ok) return { error: validated.error };

  const teamCount = Math.max(2, Math.min(input.teamCount || 16, 64));
  const now = new Date();
  const name = `🧪 ${input.name || "Custom"} — ${teamCount} équipes`;
  const slug = await generateTournamentSlug(name, "sandbox", now.getFullYear());
  const t = await prisma.tournament.create({
    data: {
      name,
      slug,
      continentCode: "EU",
      country: "BE",
      city: "Bac à sable",
      dateStart: now,
      dateEnd: new Date(now.getTime() + 36 * 3600_000),
      format: "pipeline",
      gameDurationMin: Math.max(5, Math.min(input.gameDurationMin || 12, 40)),
      maxTeams: teamCount,
      registrationFeePerTeam: 0,
      registrationFeeCurrency: "EUR",
      contactEmail: "sandbox@polo.local",
      saturdayFormat: "ALL_DAY",
      sundayFormat: "SE",
      status: "UPCOMING",
      courtsCount: Math.max(1, Math.min(input.courtsCount || 2, 4)),
      timezone: "Europe/Brussels",
      usesPipeline: true,
      testMode: true,
      createdViaSandbox: true,
      hidden: true,
      approved: true,
      creatorId: access.playerId,
    } as never,
  });

  await seedFakeTeams(t.id, teamCount);

  await createStages(t.id, validated.stages);

  revalidatePath("/sandbox");
  return { id: t.id };
}

export async function launchStageAction(tournamentId: string, stageOrder: number) {
  const access = await requireSandboxAccess();
  if ("error" in access) return { error: access.error };
  if (!(await requireSandboxTournament(tournamentId, access.playerId, access.isAdmin))) return { error: "Tournoi bac à sable introuvable." };
  const res = await launchStage(tournamentId, stageOrder);
  revalidatePath(`/sandbox/${tournamentId}`);
  return res;
}

export async function simulatePassAction(tournamentId: string) {
  const access = await requireSandboxAccess();
  if ("error" in access) return { error: access.error };
  if (!(await requireSandboxTournament(tournamentId, access.playerId, access.isAdmin))) return { error: "Tournoi bac à sable introuvable." };
  const res = await simulateOnePass(tournamentId);
  revalidatePath(`/sandbox/${tournamentId}`);
  return res;
}

export async function simulateStageAction(tournamentId: string) {
  const access = await requireSandboxAccess();
  if ("error" in access) return { error: access.error };
  if (!(await requireSandboxTournament(tournamentId, access.playerId, access.isAdmin))) return { error: "Tournoi bac à sable introuvable." };
  const res = await simulateStage(tournamentId);
  revalidatePath(`/sandbox/${tournamentId}`);
  return res;
}

export async function simulateAllAction(tournamentId: string) {
  const access = await requireSandboxAccess();
  if ("error" in access) return { error: access.error };
  if (!(await requireSandboxTournament(tournamentId, access.playerId, access.isAdmin))) return { error: "Tournoi bac à sable introuvable." };
  const res = await simulateAll(tournamentId);
  revalidatePath(`/sandbox/${tournamentId}`);
  return res;
}

export async function resetStagesAction(tournamentId: string, fromOrder: number) {
  const access = await requireSandboxAccess();
  if ("error" in access) return { error: access.error };
  if (!(await requireSandboxTournament(tournamentId, access.playerId, access.isAdmin))) return { error: "Tournoi bac à sable introuvable." };
  const res = await resetStages(tournamentId, fromOrder);
  await prisma.tournament.update({ where: { id: tournamentId }, data: { status: fromOrder === 0 ? "UPCOMING" : "LIVE" } }).catch(() => {});
  revalidatePath(`/sandbox/${tournamentId}`);
  return res;
}

export async function setScoreAction(tournamentId: string, matchId: string, scoreA: number, scoreB: number) {
  const access = await requireSandboxAccess();
  if ("error" in access) return { error: access.error };
  if (!(await requireSandboxTournament(tournamentId, access.playerId, access.isAdmin))) return { error: "Tournoi bac à sable introuvable." };
  const match = await prisma.match.findUnique({ where: { id: matchId }, select: { tournamentId: true } });
  if (match?.tournamentId !== tournamentId) return { error: "Match étranger au tournoi." };
  const res = await applyScore(matchId, scoreA, scoreB);
  revalidatePath(`/sandbox/${tournamentId}`);
  return res;
}

export async function deleteSandboxAction(tournamentId: string) {
  const access = await requireSandboxAccess();
  if ("error" in access) return { error: access.error };
  const t = await requireSandboxTournament(tournamentId, access.playerId, access.isAdmin);
  if (!t) return { error: "Tournoi bac à sable introuvable." };

  await prisma.$transaction(async (tx) => {
    await tx.matchEvent.deleteMany({ where: { match: { tournamentId } } });
    await tx.match.deleteMany({ where: { tournamentId } });
    await tx.stageEntry.deleteMany({ where: { stage: { tournamentId } } });
    await tx.stage.deleteMany({ where: { tournamentId } });
    await tx.poolTeam.deleteMany({ where: { pool: { tournamentId } } });
    await tx.pool.deleteMany({ where: { tournamentId } });
    await tx.teamPlayer.deleteMany({ where: { team: { tournamentId } } });
    await tx.team.deleteMany({ where: { tournamentId } });
    // Joueurs fictifs créés avec les équipes (marqués par leur slug).
    await tx.player.deleteMany({ where: { slug: { startsWith: `sandbox-${tournamentId}-` } } });
    await tx.tournament.delete({ where: { id: tournamentId } });
  }, { timeout: 20000 });

  revalidatePath("/sandbox");
  return { ok: true };
}
