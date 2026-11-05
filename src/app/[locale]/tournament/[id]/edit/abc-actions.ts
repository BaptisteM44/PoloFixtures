"use server";

/**
 * ABC Chapeau — actions orga du panneau de tirage : ajouter / retirer un
 * joueur (avec ou sans compte), composer les équipes à la main.
 * Toutes passent par lib/abc-teams pour garder inscription et équipe d'accord.
 */

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { getOrgaPlayerId } from "@/lib/orga-auth";
import { apiMsg } from "@/lib/api-messages";
import { normalizeCountry } from "@/lib/country-utils";
import { isAbcLevel, nextTeamName } from "@/lib/abc-draw";
import { moveSoloEntry, deleteAbcTeam } from "@/lib/abc-teams";
import { createNotification } from "@/lib/notify";

type Result<T = object> = ({ ok: true } & T) | { ok?: false; error: string };

export type AbcEntryDTO = {
  id: string;
  player: { id: string; name: string; account: { email: string | null } | null };
  level: string;
  teamId: string | null;
  waitlisted: boolean;
  feePaid: boolean;
  paymentMethod: null;
};

function refresh() {
  revalidatePath("/[locale]/tournament/[id]", "page");
  revalidatePath("/[locale]/tournament/[id]/edit", "page");
}

/** Orga du tournoi, format ABC Chapeau, équipes pas encore validées. */
async function guard(tournamentId: string): Promise<{ error: string } | null> {
  if (!(await getOrgaPlayerId(tournamentId))) return { error: apiMsg("access_denied") };
  const t = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { format: true, selectionLocked: true } });
  if (!t) return { error: apiMsg("tournament_not_found") };
  if (t.format !== "ABC Chapeau") return { error: apiMsg("abc_only") };
  if (t.selectionLocked) return { error: apiMsg("draw_locked") };
  return null;
}

/**
 * Inscrit un joueur à la place de l'orga : un profil existant, ou un joueur
 * sans compte (profil créé comme pour l'ajout manuel dans une équipe — il
 * pourra être fusionné avec son vrai compte plus tard). Ignore les dates
 * d'inscription et la limite de joueurs : c'est l'orga qui décide.
 */
export async function abcAddPlayerAction(
  tournamentId: string,
  player: { type: "existing"; playerId: string } | { type: "manual"; name: string; city?: string | null; country: string },
  level: string,
): Promise<Result<{ entry: AbcEntryDTO }>> {
  const denied = await guard(tournamentId);
  if (denied) return denied;
  if (!isAbcLevel(level)) return { error: apiMsg("abc_invalid_level") };

  let playerId: string;
  if (player.type === "existing") {
    const found = await prisma.player.findUnique({ where: { id: player.playerId }, select: { id: true, name: true } });
    if (!found) return { error: apiMsg("player_not_found") };
    const already = await prisma.tournamentSoloEntry.findUnique({
      where: { tournamentId_playerId: { tournamentId, playerId: found.id } },
    });
    if (already) return { error: apiMsg("abc_already_registered", { p0: found.name }) };
    playerId = found.id;
  } else {
    const name = player.name.trim();
    if (!name || !player.country.trim()) return { error: apiMsg("name_required") };
    const { toSlug } = await import("@/lib/utils");
    const base = toSlug(name);
    let slug = base;
    let si = 2;
    while (await prisma.player.findUnique({ where: { slug } })) slug = `${base}-${si++}`;
    const created = await prisma.player.create({
      data: { name, city: player.city?.trim() || null, country: normalizeCountry(player.country), slug, status: "PENDING", badges: [] },
    });
    playerId = created.id;
  }

  const entry = await prisma.tournamentSoloEntry.create({
    data: { tournamentId, playerId, level, waitlisted: false },
    include: { player: { select: { id: true, name: true, account: { select: { email: true } } } } },
  });
  refresh();
  return {
    ok: true,
    entry: {
      id: entry.id,
      player: { id: entry.player.id, name: entry.player.name, account: entry.player.account ? { email: entry.player.account.email } : null },
      level: entry.level,
      teamId: null,
      waitlisted: false,
      feePaid: false,
      paymentMethod: null,
    },
  };
}

/** Désinscrit un joueur (et le sort de son équipe). Son profil reste. */
export async function abcRemoveEntryAction(tournamentId: string, entryId: string): Promise<Result> {
  const denied = await guard(tournamentId);
  if (denied) return denied;
  const entry = await prisma.tournamentSoloEntry.findUnique({ where: { id: entryId } });
  if (!entry || entry.tournamentId !== tournamentId) return { error: apiMsg("abc_entry_not_found") };
  await prisma.$transaction(async (tx) => {
    await moveSoloEntry(tx, tournamentId, entryId, null);
    await tx.tournamentSoloEntry.delete({ where: { id: entryId } });
  });
  refresh();
  return { ok: true };
}

/** Place un joueur dans une équipe, ou le sort de son équipe (teamId = null). */
export async function abcMoveEntryAction(tournamentId: string, entryId: string, teamId: string | null): Promise<Result> {
  const denied = await guard(tournamentId);
  if (denied) return denied;
  const res = await prisma.$transaction((tx) => moveSoloEntry(tx, tournamentId, entryId, teamId));
  if (res.error === "entry_not_found") return { error: apiMsg("abc_entry_not_found") };
  if (res.error === "team_not_found") return { error: apiMsg("abc_team_not_found") };
  refresh();
  return { ok: true };
}

/** Change le niveau d'un inscrit (les joueurs s'auto-évaluent, l'orga corrige). */
export async function abcSetLevelAction(tournamentId: string, entryId: string, level: string): Promise<Result> {
  const denied = await guard(tournamentId);
  if (denied) return denied;
  if (!isAbcLevel(level)) return { error: apiMsg("abc_invalid_level") };
  const entry = await prisma.tournamentSoloEntry.findUnique({ where: { id: entryId } });
  if (!entry || entry.tournamentId !== tournamentId) return { error: apiMsg("abc_entry_not_found") };
  await prisma.tournamentSoloEntry.update({ where: { id: entryId }, data: { level } });
  refresh();
  return { ok: true };
}

/** Crée `count` équipes vides « Équipe N » à remplir à la main (1 par défaut). */
export async function abcCreateTeamAction(tournamentId: string, count = 1): Promise<Result<{ teams: { id: string; name: string }[] }>> {
  const denied = await guard(tournamentId);
  if (denied) return denied;
  const n = Math.min(Math.max(1, Math.floor(count)), 64);
  const existing = await prisma.team.findMany({ where: { tournamentId }, select: { name: true, seed: true } });
  const names = existing.map((t) => t.name);
  let seed = Math.max(0, ...existing.map((t) => t.seed ?? 0));
  const teams: { id: string; name: string }[] = [];
  for (let i = 0; i < n; i++) {
    const name = nextTeamName(names);
    names.push(name);
    teams.push(await prisma.team.create({ data: { tournamentId, name, seed: ++seed }, select: { id: true, name: true } }));
  }
  refresh();
  return { ok: true, teams };
}

/** Supprime une équipe : ses joueurs repassent dans « Non placés ». */
export async function abcDeleteTeamAction(tournamentId: string, teamId: string): Promise<Result> {
  const denied = await guard(tournamentId);
  if (denied) return denied;
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { tournamentId: true } });
  if (!team || team.tournamentId !== tournamentId) return { error: apiMsg("abc_team_not_found") };
  await prisma.$transaction((tx) => deleteAbcTeam(tx, teamId));
  refresh();
  return { ok: true };
}

/**
 * Dévoile les équipes au public (ou les cache à nouveau). Dévoiler demande
 * des équipes validées ; recacher n'est possible qu'avant le lancement.
 * Au dévoilement, chaque joueur·euse (avec compte) reçoit ses coéquipier·es.
 */
export async function abcRevealTeamsAction(tournamentId: string, reveal: boolean): Promise<Result> {
  if (!(await getOrgaPlayerId(tournamentId))) return { error: apiMsg("access_denied") };
  const t = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { id: true, slug: true, name: true, format: true, status: true, selectionLocked: true, teamsRevealedAt: true },
  });
  if (!t) return { error: apiMsg("tournament_not_found") };
  if (t.format !== "ABC Chapeau") return { error: apiMsg("abc_only") };

  if (!reveal) {
    if (t.status !== "UPCOMING") return { error: apiMsg("abc_reveal_started") };
    await prisma.tournament.update({ where: { id: tournamentId }, data: { teamsRevealedAt: null } });
    refresh();
    return { ok: true };
  }

  if (!t.selectionLocked) return { error: apiMsg("abc_reveal_validate_first") };
  if (t.teamsRevealedAt) return { ok: true };
  await prisma.tournament.update({ where: { id: tournamentId }, data: { teamsRevealedAt: new Date() } });

  const teams = await prisma.team.findMany({
    where: { tournamentId, players: { some: {} } },
    select: { name: true, players: { select: { player: { select: { id: true, name: true, account: { select: { id: true } } } } } } },
  });
  for (const team of teams) {
    for (const { player } of team.players) {
      if (!player.account) continue; // profil sans compte : personne pour lire la notif
      const teammates = team.players.filter((x) => x.player.id !== player.id).map((x) => x.player.name).join(", ");
      await createNotification(player.id, "TEAMS_REVEALED", {
        tournamentId: t.id,
        tournamentSlug: t.slug ?? t.id,
        tournamentName: t.name,
        teamName: team.name,
        teammates,
      });
    }
  }
  refresh();
  return { ok: true };
}
