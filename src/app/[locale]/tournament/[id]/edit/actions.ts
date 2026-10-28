"use server";

import { prisma } from "@/lib/db";
import { canonicalCountryName, normalizeCountry } from "@/lib/country-utils";
import { z } from "zod";
import { generateTournamentSlug } from "@/lib/slug";
import { revalidatePath } from "next/cache";
import { notifyTeamPlayers } from "@/lib/notify";
import { INFO_TILE_KEYS } from "@/lib/infoTilesDefaults";
import { getOrgaPlayerId } from "@/lib/orga-auth";
import { apiMsg } from "@/lib/api-messages";

async function requireTournamentOrgaAccess(tournamentId: string): Promise<{ error: string } | null> {
  const playerId = await getOrgaPlayerId(tournamentId);
  if (!playerId) return { error: apiMsg("access_denied") };
  return null;
}

const updateSchema = z.object({
  id: z.string(),
  name: z.string().min(2),
  // Fuseau IANA du lieu (ex. "America/New_York") : horaires du planning,
  // fin automatique à 21h locale, galerie photos.
  timezone: z.string().max(64).optional(),
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
  status: z.enum(["UPCOMING", "LIVE", "COMPLETED"]),
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
  externalRegistrationUrl: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? null : v),
    z.string().url().nullable()
  ),
  hostClubId: z.string().optional().nullable(),
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
  // Pays sous sa forme officielle (cf. création) + espaces parasites retirés.
  data.country = canonicalCountryName(data.country) ?? data.country.trim();
  data.city = data.city.trim();
  // Fuseau : ignoré s'il n'est pas un fuseau IANA valide (formulaire trafiqué).
  if (data.timezone !== undefined) {
    try { new Intl.DateTimeFormat("en", { timeZone: data.timezone }); } catch { delete data.timezone; }
    if (data.timezone === "") delete data.timezone;
  }
  const denied = await requireTournamentOrgaAccess(data.id);
  if (denied) return denied;

  const tournament = await prisma.tournament.findUnique({ where: { id: data.id } });
  if (!tournament) return { error: apiMsg("not_found") };

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
  const { id: _id, links: _links, meals: _meals, faq: _faq, accommodationCapacity: _ac, telegramUrl: _tg, chatMode: _cm, streamYoutubeUrl: _syu, status: _statusFromForm, hostClubId: _hcid, format: _format, ...rest } = data;

  // Le `format` = type d'inscription (2v2, 3v3, ABC Chapeau…) et reste éditable,
  // y compris pour un tournoi pipeline (usesPipeline pilote le déroulé, pas le
  // type d'inscription). Le formulaire soumet toujours une valeur choisie
  // explicitement (le <select> inclut désormais le format courant même hors
  // liste standard), donc on l'écrit telle quelle. Seul garde-fou minimal : on
  // n'écrase pas avec une chaîne vide (formulaire cassé / champ absent).
  const formatUpdate = data.format && data.format.trim() !== ""
    ? { format: data.format }
    : {};

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
        ...formatUpdate,
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
        chatMode: data.chatMode,
        testMode: data.testMode,
        hidden: data.hidden,
        // Les champs des anciens formats (saturdayFormat, poolCount…) ne sont
        // plus jamais réécrits : ils ne servent qu'à afficher les archives.
        externalRegistrationUrl: data.externalRegistrationUrl ?? null,
        hostClubId: data.hostClubId || null,
      }
    });
  } catch (err) {
    console.error("[updateTournamentAction] Prisma error:", err);
    return { error: err instanceof Error ? err.message : String(err) };
  }

  revalidatePath(`/tournament/${data.id}`);
  return { ok: true };
}

export async function addSponsorAction(
  tournamentId: string,
  name: string,
  url: string | null,
  logoPath: string | null
): Promise<{ ok?: boolean; error?: string }> {
  const denied = await requireTournamentOrgaAccess(tournamentId);
  if (denied) return denied;

  if (!name.trim()) return { error: apiMsg("act_nom_requis") };
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
  if (!trimmed) return { error: apiMsg("act_nom_ne_peut_pas_etre_vide") };
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

/**
 * Bloque toute modification de la sélection/WL une fois que l'orga a validé
 * sa liste finale (Tournament.selectionLocked). Il faut déverrouiller
 * explicitement (toggleSelectionLockAction) avant de pouvoir retoucher.
 */
async function requireSelectionUnlocked(tournamentId: string): Promise<{ error: string } | null> {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { selectionLocked: true } });
  if ((tournament as any)?.selectionLocked) {
    return { error: apiMsg("act_selection_validee_figee_deverrouille_abord_modifier") };
  }
  return null;
}

/** Après une action de sélection : sans ça, la page publique (et le cache du
 *  navigateur) montrait encore l'ancienne liste IN / liste d'attente. */
function refreshTournamentPages() {
  revalidatePath("/[locale]/tournament/[id]", "page");
  revalidatePath("/[locale]/tournament/[id]/edit", "page");
}

/** Une équipe qui passe IN quitte la liste d'attente : on libère son rang et
 *  on resserre les suivants (même logique que removeFromWaitlistAction). */
async function leaveWaitlist(tournamentId: string, teamId: string) {
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { waitlistPosition: true } });
  if (!team || team.waitlistPosition === null) return;
  const removedRank = team.waitlistPosition;
  await prisma.team.update({ where: { id: teamId }, data: { waitlistPosition: null } });
  const toRenumber = await prisma.team.findMany({
    where: { tournamentId, waitlistPosition: { gt: removedRank } },
    select: { id: true, waitlistPosition: true },
    orderBy: { waitlistPosition: "asc" },
  });
  for (const t of toRenumber) {
    await prisma.team.update({ where: { id: t.id }, data: { waitlistPosition: (t.waitlistPosition ?? 0) - 1 } });
  }
}

export async function toggleTeamSelectedAction(
  teamId: string,
  tournamentId: string,
  selected: boolean
): Promise<{ ok?: boolean; error?: string }> {
  const denied = await requireTournamentOrgaAccess(tournamentId);
  if (denied) return denied;
  const locked = await requireSelectionUnlocked(tournamentId);
  if (locked) return locked;

  await prisma.team.update({ where: { id: teamId }, data: { selected } });
  if (selected) await leaveWaitlist(tournamentId, teamId);
  refreshTournamentPages();
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
  const locked = await requireSelectionUnlocked(tournamentId);
  if (locked) return locked;

  await prisma.team.update({
    where: { id: teamId },
    data: { guaranteed, ...(guaranteed ? { selected: true } : {}) },
  });
  if (guaranteed) await leaveWaitlist(tournamentId, teamId);
  // Quand on retire un garanti, remettre toutes les WL en pool libre
  if (!guaranteed) {
    await prisma.team.updateMany({
      where: { tournamentId, selected: false },
      data: { waitlistPosition: null },
    });
  }
  refreshTournamentPages();
  return { ok: true };
}

/**
 * « Valider toutes » : toutes les équipes inscrites passent IN d'un coup (y
 * compris celles en liste d'attente), en une seule écriture. Avant, le bouton
 * lançait une action par équipe sans lire les réponses : si la sélection était
 * verrouillée, rien n'était enregistré mais l'écran affichait tout IN ; et les
 * équipes déjà en liste d'attente n'étaient jamais envoyées.
 */
export async function guaranteeAllTeamsAction(tournamentId: string): Promise<{ ok?: boolean; error?: string; count?: number }> {
  const denied = await requireTournamentOrgaAccess(tournamentId);
  if (denied) return denied;
  const locked = await requireSelectionUnlocked(tournamentId);
  if (locked) return locked;
  const res = await prisma.team.updateMany({
    where: { tournamentId },
    data: { guaranteed: true, selected: true, waitlistPosition: null },
  });
  refreshTournamentPages();
  return { ok: true, count: res.count };
}

export async function drawTeamsAction(
  tournamentId: string,
  count: number,
  preDrawnIds?: string[]
): Promise<{ ok?: boolean; error?: string }> {
  const denied = await requireTournamentOrgaAccess(tournamentId);
  if (denied) return denied;
  const locked = await requireSelectionUnlocked(tournamentId);
  if (locked) return locked;

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
  refreshTournamentPages();
  return { ok: true };
}

/**
 * Valide (ou déverrouille) la sélection finale des équipes. Indépendant du
 * tirage : un tournoi sans surbooking, ou dont le tirage a été fait hors
 * plateforme, se valide aussi. Une fois verrouillée, la WL est figée et
 * seules les équipes IN peuvent être marquées payées.
 */
export async function toggleSelectionLockAction(
  tournamentId: string,
  locked: boolean
): Promise<{ ok?: boolean; error?: string }> {
  const denied = await requireTournamentOrgaAccess(tournamentId);
  if (denied) return denied;

  await prisma.tournament.update({ where: { id: tournamentId }, data: { selectionLocked: locked } });
  // Valider la sélection = les équipes IN sont celles qui jouent : les autres
  // (pas IN, ou en liste d'attente) sortent de la sélection. Sans ça, une
  // équipe inscrite mais jamais validée restait « sélectionnée » et entrait
  // quand même dans la 1re étape (ex : 19 équipes au lieu de 12).
  if (locked) {
    const hasIn = await prisma.team.count({ where: { tournamentId, guaranteed: true } });
    if (hasIn > 0) await prisma.team.updateMany({ where: { tournamentId, guaranteed: false }, data: { selected: false } });
  }
  revalidatePath(`/tournament/${tournamentId}/edit`);
  revalidatePath(`/tournament/${tournamentId}`);
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
  const locked = await requireSelectionUnlocked(tournamentId);
  if (locked) return locked;

  if (candidateIds.length === 0) return { error: apiMsg("act_aucune_equipe_candidate") };

  // Vérifie que ces équipes appartiennent bien au tournoi et ne sont pas déjà garanties
  const valid = await prisma.team.findMany({
    where: { tournamentId, id: { in: candidateIds }, guaranteed: false },
    select: { id: true },
  });
  if (valid.length === 0) return { error: apiMsg("act_aucune_equipe_valide_tirage") };

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
  refreshTournamentPages();
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
  const locked = await requireSelectionUnlocked(tournamentId);
  if (locked) return locked;

  if (candidateIds.length === 0) return { error: apiMsg("act_aucune_equipe_candidate") };

  const valid = await prisma.team.findMany({
    where: { tournamentId, id: { in: candidateIds }, guaranteed: false, waitlistPosition: null },
    select: { id: true },
  });
  if (valid.length === 0) return { error: apiMsg("act_aucune_equipe_valide_tirage") };

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
  refreshTournamentPages();
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
  const locked = await requireSelectionUnlocked(tournamentId);
  if (locked) return locked;

  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { waitlistPosition: true } });
  if (!team || team.waitlistPosition === null) return { error: apiMsg("act_equipe_introuvable_ou_pas_wl") };

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

  refreshTournamentPages();
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
    if (!player) return { error: apiMsg("player_not_found") };
    const alreadyIn = await prisma.teamPlayer.findFirst({
      where: { playerId: playerData.playerId, team: { tournamentId } }
    });
    if (alreadyIn) return { error: apiMsg("act_deja_equipe_tournoi", { p0: player.name }) };
    await prisma.teamPlayer.create({ data: { teamId, playerId: playerData.playerId, isCaptain: false } });
  } else {
    const { toSlug } = await import("@/lib/utils");
    const base = toSlug(playerData.name);
    let slug = base;
    let si = 2;
    while (await prisma.player.findUnique({ where: { slug } })) slug = `${base}-${si++}`;
    const created = await prisma.player.create({
      data: { name: playerData.name, city: playerData.city ?? null, country: normalizeCountry(playerData.country), slug, status: "PENDING", badges: [] }
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
  if (!trimmed) return { error: apiMsg("act_nom_ne_peut_pas_etre_vide") };

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
  if (!tournament) return { error: apiMsg("tournament_not_found") };
  if (tournament.submissionStatus !== "REJECTED") return { error: apiMsg("act_tournoi_n_pas_etat_rejected") };

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
  const denied = await requireTournamentOrgaAccess(tournamentId);
  if (denied) return denied;

  const parsed = infoTilesLayoutSchema.safeParse(layout);
  if (!parsed.success) {
    return { error: apiMsg("act_donnees_layout_invalides") };
  }
  const clean = parsed.data.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }));
  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { infoTilesLayout: clean },
  });
  revalidatePath(`/tournament/${tournamentId}`);
  return { ok: true };
}

export async function generateRefTokenAction(tournamentId: string) {
  "use server";
  const denied = await requireTournamentOrgaAccess(tournamentId);
  if (denied) return denied;
  const token = crypto.randomUUID();
  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { refToken: token },
  });
  revalidatePath(`/tournament/${tournamentId}/edit`);
  return { ok: true, token };
}

export async function revokeRefTokenAction(tournamentId: string) {
  "use server";
  const denied = await requireTournamentOrgaAccess(tournamentId);
  if (denied) return denied;
  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { refToken: null },
  });
  revalidatePath(`/tournament/${tournamentId}/edit`);
  return { ok: true };
}

// ─── Pipeline (nouveau système de stages, refonte formats) ──────────────────
// Ce tournoi utilise usesPipeline=true : toute la logique de génération vit
// dans src/engine/pipeline-server.ts. Ces actions ne sont que des wrappers
// d'accès (mêmes règles que les autres actions orga) autour du moteur.

export async function launchPipelineStageAction(
  id: string,
  stageOrder: number
): Promise<{ ok?: boolean; error?: string }> {
  const denied = await requireTournamentOrgaAccess(id);
  if (denied) return denied;

  const { launchStage } = await import("@/engine/pipeline-server");
  const res = await launchStage(id, stageOrder);
  // Arbitrage : désignation automatique des équipes arbitres (si une règle est choisie).
  if (res.ok) { const { autoFillReferees } = await import("@/lib/referees"); await autoFillReferees(id); }

  revalidatePath(`/tournament/${id}`);
  revalidatePath(`/tournament/${id}/edit`);
  return res;
}

export async function resetPipelineStagesAction(
  id: string,
  fromOrder: number
): Promise<{ ok?: boolean; error?: string }> {
  const denied = await requireTournamentOrgaAccess(id);
  if (denied) return denied;

  const { resetStages } = await import("@/engine/pipeline-server");
  const res = await resetStages(id, fromOrder);

  revalidatePath(`/tournament/${id}`);
  revalidatePath(`/tournament/${id}/edit`);
  return res;
}

/** Prévisualise qui entre dans une étape (pour la composition manuelle des groupes). */
export async function previewPipelineEntriesAction(
  id: string,
  stageOrder: number
): Promise<{ entries?: Array<{ teamId: string; name: string; groupKey: string; slot: number }>; groups?: number; error?: string }> {
  const denied = await requireTournamentOrgaAccess(id);
  if (denied) return denied;
  const { previewStageEntries } = await import("@/engine/pipeline-server");
  return previewStageEntries(id, stageOrder);
}

/** Enregistre la composition manuelle des groupes d'une étape non lancée. */
export async function setPipelineManualGroupsAction(
  id: string,
  stageOrder: number,
  assignments: Record<string, string>
): Promise<{ ok?: boolean; error?: string }> {
  const denied = await requireTournamentOrgaAccess(id);
  if (denied) return denied;
  const { setStageManualGroups } = await import("@/engine/pipeline-server");
  const res = await setStageManualGroups(id, stageOrder, assignments);
  revalidatePath(`/tournament/${id}/edit`);
  return res;
}

/**
 * Définit le format d'un tournoi via une composition d'étapes custom
 * (builder). Bascule le tournoi en pipeline. Refuse si des matchs sont joués.
 */
export async function setTournamentPipelineAction(
  id: string,
  stages: unknown,
): Promise<{ ok?: boolean; error?: string }> {
  const denied = await requireTournamentOrgaAccess(id);
  if (denied) return denied;
  const { setTournamentPipeline } = await import("@/engine/pipeline-server");
  const res = await setTournamentPipeline(id, stages);
  revalidatePath(`/tournament/${id}`);
  revalidatePath(`/tournament/${id}/edit`);
  return res;
}

/** Applique un preset de pipeline (Poules→SE, Swiss→DE, Big Apple…) au tournoi. */
export async function applyPipelinePresetAction(
  id: string,
  presetKey: string,
): Promise<{ ok?: boolean; error?: string }> {
  const denied = await requireTournamentOrgaAccess(id);
  if (denied) return denied;
  const t = await prisma.tournament.findUnique({ where: { id }, select: { maxTeams: true } });
  if (!t) return { error: apiMsg("tournament_not_found") };
  const { getPreset } = await import("@/engine/presets");
  const preset = getPreset(presetKey);
  if (!preset) return { error: apiMsg("act_preset_inconnu") };
  const stages = preset.build(Math.max(t.maxTeams ?? preset.minTeams, preset.minTeams));
  const { setTournamentPipeline } = await import("@/engine/pipeline-server");
  const res = await setTournamentPipeline(id, stages);
  revalidatePath(`/tournament/${id}`);
  revalidatePath(`/tournament/${id}/edit`);
  return res;
}

/** Revient au round N d'une étape RR/SWISS active (efface N et les suivants). */
export async function resetPipelineToRoundAction(
  id: string,
  stageOrder: number,
  round: number,
  group?: string,
): Promise<{ ok?: boolean; error?: string }> {
  const denied = await requireTournamentOrgaAccess(id);
  if (denied) return denied;
  const { resetToRound } = await import("@/engine/pipeline-server");
  const res = await resetToRound(id, stageOrder, round, group);
  revalidatePath(`/tournament/${id}`);
  revalidatePath(`/tournament/${id}/edit`);
  return res;
}

/** Replanifie les matchs non joués d'une étape à partir de maintenant. */
export async function reschedulePipelineStageAction(
  id: string,
  stageOrder: number,
  fromISO?: string,
): Promise<{ ok?: boolean; error?: string }> {
  const denied = await requireTournamentOrgaAccess(id);
  if (denied) return denied;
  const { rescheduleStage } = await import("@/engine/pipeline-server");
  const res = await rescheduleStage(id, stageOrder, fromISO);
  revalidatePath(`/tournament/${id}`);
  revalidatePath(`/tournament/${id}/edit`);
  return res;
}

/** Lance le prochain groupe non lancé d'une étape RR/SWISS active (sessions séquentielles). */
export async function launchPipelineGroupAction(
  id: string,
  stageOrder: number
): Promise<{ ok?: boolean; error?: string; group?: string }> {
  const denied = await requireTournamentOrgaAccess(id);
  if (denied) return denied;
  const { launchNextGroup } = await import("@/engine/pipeline-server");
  const res = await launchNextGroup(id, stageOrder);
  if (res.ok) { const { autoFillReferees } = await import("@/lib/referees"); await autoFillReferees(id); }
  revalidatePath(`/tournament/${id}`);
  revalidatePath(`/tournament/${id}/edit`);
  return res;
}

/** Pré-seeding : ordre de départ des équipes (avant le lancement). */
export async function setPipelineSeedsAction(id: string, teamIds: string[]): Promise<{ ok?: boolean; error?: string }> {
  const denied = await requireTournamentOrgaAccess(id);
  if (denied) return denied;
  const { setRegistrationSeeds } = await import("@/engine/pipeline-server");
  const res = await setRegistrationSeeds(id, teamIds);
  revalidatePath(`/tournament/${id}`);
  revalidatePath(`/tournament/${id}/edit`);
  return res;
}

/** Échange deux équipes d'une étape lancée mais pas commencée (corriger le 1er tour). */
export async function swapPipelineTeamsAction(id: string, stageOrder: number, teamA: string, teamB: string): Promise<{ ok?: boolean; error?: string }> {
  const denied = await requireTournamentOrgaAccess(id);
  if (denied) return denied;
  const { swapStageTeams } = await import("@/engine/pipeline-server");
  const res = await swapStageTeams(id, stageOrder, teamA, teamB);
  if (res.ok) { const { autoFillReferees } = await import("@/lib/referees"); await autoFillReferees(id); }
  revalidatePath(`/tournament/${id}`);
  revalidatePath(`/tournament/${id}/edit`);
  return res;
}

/** Modifie une étape non lancée (nom, type, config, sources, horaire). */
export async function updatePipelineStageAction(
  id: string,
  stageOrder: number,
  patch: {
    name?: string;
    type?: string;
    config?: Record<string, unknown>;
    entryRules?: unknown;
    startAt?: string | null;
  }
): Promise<{ ok?: boolean; error?: string }> {
  const denied = await requireTournamentOrgaAccess(id);
  if (denied) return denied;
  const { updateStageDef } = await import("@/engine/pipeline-server");
  const res = await updateStageDef(id, stageOrder, patch as never);
  revalidatePath(`/tournament/${id}`);
  revalidatePath(`/tournament/${id}/edit`);
  return res;
}

/** Ajoute une étape en fin de pipeline. */
export async function addPipelineStageAction(
  id: string,
  def: { name: string; type: string; config: Record<string, unknown>; entryRules: unknown }
): Promise<{ ok?: boolean; error?: string }> {
  const denied = await requireTournamentOrgaAccess(id);
  if (denied) return denied;
  const { addStageDef } = await import("@/engine/pipeline-server");
  const res = await addStageDef(id, def as never);
  revalidatePath(`/tournament/${id}`);
  revalidatePath(`/tournament/${id}/edit`);
  return res;
}

/** Supprime une étape non lancée. */
export async function removePipelineStageAction(
  id: string,
  stageOrder: number
): Promise<{ ok?: boolean; error?: string }> {
  const denied = await requireTournamentOrgaAccess(id);
  if (denied) return denied;
  const { removeStageDef } = await import("@/engine/pipeline-server");
  const res = await removeStageDef(id, stageOrder);
  revalidatePath(`/tournament/${id}`);
  revalidatePath(`/tournament/${id}/edit`);
  return res;
}

/** Monte/descend une étape non lancée dans le pipeline. */
export async function movePipelineStageAction(
  id: string,
  stageOrder: number,
  dir: -1 | 1
): Promise<{ ok?: boolean; error?: string }> {
  const denied = await requireTournamentOrgaAccess(id);
  if (denied) return denied;
  const { moveStageDef } = await import("@/engine/pipeline-server");
  const res = await moveStageDef(id, stageOrder, dir);
  revalidatePath(`/tournament/${id}`);
  revalidatePath(`/tournament/${id}/edit`);
  return res;
}

/**
 * Simule les scores restants de l'étape active (au hasard) — réservé aux
 * tournois de test (testMode), pour vérifier un pipeline sans arbitrer
 * chaque match à la main.
 */
export async function simulatePipelineStageAction(id: string): Promise<{ ok?: boolean; error?: string }> {
  const denied = await requireTournamentOrgaAccess(id);
  if (denied) return denied;
  const t = await prisma.tournament.findUnique({ where: { id }, select: { testMode: true } });
  if (!t?.testMode) return { error: apiMsg("act_simulation_reservee_tournois_test") };

  const { simulateStage } = await import("@/engine/pipeline-server");
  const res = await simulateStage(id);

  revalidatePath(`/tournament/${id}`);
  revalidatePath(`/tournament/${id}/edit`);
  return res;
}

/**
 * Clôture immédiate des inscriptions (fin d'inscription = maintenant), sans
 * passer par le formulaire complet. `reopen` retire la date de fin.
 */
export async function setRegistrationClosedAction(tournamentId: string, closed: boolean): Promise<{ ok?: boolean; error?: string }> {
  const denied = await requireTournamentOrgaAccess(tournamentId);
  if (denied) return denied;
  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { registrationEnd: closed ? new Date() : null },
  });
  refreshTournamentPages();
  return { ok: true };
}
