/**
 * Ciblage des sondages et validation des cibles hors périmètre.
 *
 * Un joueur cible librement ses propres clubs (membre ou gérant) et son pays.
 * Tout le reste passe par une demande (PollApproval) :
 *  - un autre club → validée par les gérants/admins de CE club (ou l'admin du site) ;
 *  - un autre pays, un continent, ou « tout le monde » → validée par l'admin du site.
 * Le ciblage EFFECTIF (Poll.eligible*) ne contient que ce qui est autorisé ;
 * une demande acceptée y est fusionnée. L'admin du site cible librement.
 */
import { prisma } from "@/lib/db";
import { createNotification, notifyAllAdmins } from "@/lib/notify";
import { loadVoterProfile } from "@/lib/poll-access";
import { isPollOpen } from "@/lib/poll-vote";
import { notifyPollAudience } from "@/lib/poll-notify";

export type Targeting = { clubIds: string[]; countries: string[]; continents: string[] };

export type ApprovalRequest =
  | { kind: "club"; clubId: string }
  | { kind: "admin"; countries: string[]; continents: string[]; global: boolean };

const norm = (s: string) => s.trim().toLowerCase();
const uniq = <T,>(xs: T[]) => [...new Set(xs)];

export function cleanTargeting(t: Targeting): Targeting {
  return {
    clubIds: uniq(t.clubIds),
    countries: uniq(t.countries.map((c) => c.trim()).filter(Boolean)),
    continents: uniq(t.continents),
  };
}

export const isGlobal = (t: Targeting) => t.clubIds.length === 0 && t.countries.length === 0 && t.continents.length === 0;

/**
 * Sépare un ciblage demandé entre ce qui est accordé d'office (périmètre du
 * créateur, cibles déjà validées ou déjà en place) et ce qui doit être validé.
 */
export function splitTargeting(
  requested: Targeting,
  allowed: { clubIds: string[]; countries: string[]; continents: string[]; global: boolean },
): { effective: Targeting; requests: ApprovalRequest[] } {
  const effective: Targeting = { clubIds: [], countries: [], continents: [] };
  const requests: ApprovalRequest[] = [];
  const foreignCountries: string[] = [];
  const foreignContinents: string[] = [];

  for (const id of requested.clubIds) {
    if (allowed.clubIds.includes(id)) effective.clubIds.push(id);
    else requests.push({ kind: "club", clubId: id });
  }
  for (const c of requested.countries) {
    if (allowed.countries.some((a) => norm(a) === norm(c))) effective.countries.push(c);
    else foreignCountries.push(c);
  }
  for (const c of requested.continents) {
    if (allowed.continents.includes(c)) effective.continents.push(c);
    else foreignContinents.push(c);
  }
  const wantsGlobal = isGlobal(requested);
  if (foreignCountries.length > 0 || foreignContinents.length > 0 || (wantsGlobal && !allowed.global)) {
    requests.push({ kind: "admin", countries: foreignCountries, continents: foreignContinents, global: wantsGlobal });
  }
  return { effective, requests };
}

/** Ce qu'un joueur peut cibler sans validation : ses clubs et son pays. */
export async function ownScope(playerId: string) {
  const profile = await loadVoterProfile(playerId);
  return { clubIds: profile?.clubIds ?? [], countries: profile?.country ? [profile.country] : [] };
}

type PollForTargeting = {
  id: string;
  question: string;
  status: "DRAFT" | "OPEN" | "CLOSED";
  createdById: string | null;
  eligibleClubIds: string[];
  eligibleCountries: string[];
  eligibleContinents: string[];
};

/** Cibles déjà acquises pour ce sondage : validées, ou déjà effectives. */
async function allowedFor(poll: PollForTargeting, playerId: string) {
  const [scope, approved] = await Promise.all([
    ownScope(playerId),
    prisma.pollApproval.findMany({ where: { pollId: poll.id, status: "APPROVED" } }),
  ]);
  return {
    clubIds: uniq([...scope.clubIds, ...poll.eligibleClubIds, ...approved.flatMap((a) => (a.clubId ? [a.clubId] : []))]),
    countries: uniq([...scope.countries, ...poll.eligibleCountries, ...approved.flatMap((a) => a.countries)]),
    continents: uniq([...poll.eligibleContinents, ...approved.flatMap((a) => a.continents)]),
    global: approved.some((a) => a.global),
  };
}

/** Aperçu (formulaire) : ce qui passera d'office et ce qui demandera validation. */
export async function previewTargeting(requested: Targeting, playerId: string, isAdmin: boolean, poll?: PollForTargeting | null) {
  const req = cleanTargeting(requested);
  if (isAdmin) return { effective: req, requests: [] as ApprovalRequest[] };
  const allowed = poll
    ? await allowedFor(poll, playerId)
    : { ...(await ownScope(playerId)), continents: [] as string[], global: false };
  return splitTargeting(req, allowed);
}

/** Sur un sondage déjà ouvert, on peut élargir le public, pas le réduire. */
export function narrows(current: Targeting, requested: Targeting): boolean {
  if (isGlobal(current)) return !isGlobal(requested);
  return (
    current.clubIds.some((id) => !requested.clubIds.includes(id)) ||
    current.countries.some((c) => !requested.countries.some((r) => norm(r) === norm(c))) ||
    current.continents.some((c) => !requested.continents.includes(c))
  );
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.some((y) => norm(x) === norm(y)));

/**
 * Applique un ciblage demandé : met à jour le ciblage effectif, remplace les
 * demandes non tranchées (en attente / refusées) par celles nécessaires, et
 * prévient les valideurs des NOUVELLES demandes uniquement.
 */
export async function applyTargeting(
  poll: PollForTargeting,
  requested: Targeting,
  actor: { playerId: string; isAdmin: boolean; name?: string | null },
): Promise<{ effective: Targeting; requests: ApprovalRequest[] }> {
  const req = cleanTargeting(requested);
  const { effective, requests } = actor.isAdmin
    ? { effective: req, requests: [] as ApprovalRequest[] }
    : splitTargeting(req, await allowedFor(poll, actor.playerId));

  const existing = await prisma.pollApproval.findMany({ where: { pollId: poll.id, status: { in: ["PENDING", "REJECTED"] } } });
  const matches = (row: (typeof existing)[number], r: ApprovalRequest) =>
    row.status === "PENDING" &&
    (r.kind === "club"
      ? row.clubId === r.clubId
      : !row.clubId && row.global === r.global && sameSet(row.countries, r.countries) && sameSet(row.continents, r.continents));

  const keep = new Set<string>();
  const toCreate: ApprovalRequest[] = [];
  for (const r of requests) {
    const row = existing.find((e) => !keep.has(e.id) && matches(e, r));
    if (row) keep.add(row.id);
    else toCreate.push(r);
  }

  await prisma.$transaction([
    prisma.pollApproval.deleteMany({ where: { id: { in: existing.filter((e) => !keep.has(e.id)).map((e) => e.id) } } }),
    prisma.poll.update({
      where: { id: poll.id },
      data: { eligibleClubIds: effective.clubIds, eligibleCountries: effective.countries, eligibleContinents: effective.continents },
    }),
  ]);

  for (const r of toCreate) {
    const row = await prisma.pollApproval.create({
      data: r.kind === "club"
        ? { pollId: poll.id, clubId: r.clubId }
        : { pollId: poll.id, countries: r.countries, continents: r.continents, global: r.global },
    });
    await notifyApprovers(row.id, poll, actor);
  }
  return { effective, requests };
}

/** Qui tranche une demande de club : gérant + admins du club (hors créateur). */
async function clubDeciders(clubId: string): Promise<string[]> {
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { managerId: true, admins: { select: { playerId: true } } },
  });
  if (!club) return [];
  return uniq([club.managerId, ...club.admins.map((a) => a.playerId)]);
}

async function notifyApprovers(approvalId: string, poll: PollForTargeting, actor: { playerId: string; name?: string | null }) {
  const row = await prisma.pollApproval.findUnique({ where: { id: approvalId }, include: { club: { select: { name: true } } } });
  if (!row) return;
  const payload = {
    pollId: poll.id,
    pollQuestion: poll.question.slice(0, 120),
    requesterName: actor.name ?? "",
    target: row.club?.name ?? "",
  };
  const deciders = row.clubId ? (await clubDeciders(row.clubId)).filter((id) => id !== actor.playerId) : [];
  if (deciders.length === 0) {
    await notifyAllAdmins("POLL_APPROVAL_REQUESTED", payload);
  } else {
    for (const id of deciders) await createNotification(id, "POLL_APPROVAL_REQUESTED", payload);
  }
}

/** L'utilisateur peut-il trancher cette demande ? */
export async function canDecide(row: { clubId: string | null }, session: { user?: { role?: string | null; playerId?: string | null } } | null) {
  if (session?.user?.role === "ADMIN") return true;
  const playerId = session?.user?.playerId;
  if (!playerId || !row.clubId) return false;
  return (await clubDeciders(row.clubId)).includes(playerId);
}

/** Demandes en attente que le joueur peut trancher (clubs qu'il gère ; tout pour l'admin). */
export async function pendingApprovalsFor(playerId: string | null, isAdmin: boolean) {
  let clubFilter = {};
  if (!isAdmin) {
    if (!playerId) return [];
    const [managed, admin] = await Promise.all([
      prisma.club.findMany({ where: { managerId: playerId }, select: { id: true } }),
      prisma.clubAdmin.findMany({ where: { playerId }, select: { clubId: true } }),
    ]);
    const ids = uniq([...managed.map((c) => c.id), ...admin.map((a) => a.clubId)]);
    if (ids.length === 0) return [];
    clubFilter = { clubId: { in: ids } };
  }
  const rows = await prisma.pollApproval.findMany({
    where: { status: "PENDING", ...clubFilter, poll: { blockedAt: null } },
    orderBy: { createdAt: "asc" },
    include: {
      club: { select: { id: true, name: true } },
      poll: {
        select: {
          id: true, question: true, description: true, options: true, status: true, createdById: true,
          createdBy: { select: { name: true, slug: true } },
        },
      },
    },
  });
  // Un gérant ne tranche pas une demande sur son propre sondage (sauf admin).
  return isAdmin ? rows : rows.filter((r) => r.poll.createdById !== playerId);
}

/**
 * Tranche une demande. Acceptée : la cible rejoint le ciblage effectif, et si
 * le sondage est déjà ouvert, les nouveaux concernés sont notifiés.
 */
export async function decideApproval(
  approvalId: string,
  decision: { approve: boolean; reason?: string | null },
  deciderId: string | null,
) {
  const row = await prisma.pollApproval.findUnique({
    where: { id: approvalId },
    include: {
      club: { select: { name: true } },
      poll: {
        select: {
          id: true, question: true, status: true, openAt: true, closeAt: true, blockedAt: true, createdById: true,
          options: true, multipleChoice: true,
          eligibleClubIds: true, eligibleCountries: true, eligibleContinents: true,
        },
      },
    },
  });
  if (!row || row.status !== "PENDING") return { ok: false as const, error: "not_pending" };

  await prisma.pollApproval.update({
    where: { id: row.id },
    data: {
      status: decision.approve ? "APPROVED" : "REJECTED",
      reason: decision.reason?.trim() || null,
      decidedById: deciderId,
      decidedAt: new Date(),
    },
  });

  const p = row.poll;
  if (decision.approve) {
    await prisma.poll.update({
      where: { id: p.id },
      data: row.global
        ? { eligibleClubIds: [], eligibleCountries: [], eligibleContinents: [] }
        : {
            eligibleClubIds: uniq([...p.eligibleClubIds, ...(row.clubId ? [row.clubId] : [])]),
            eligibleCountries: uniq([...p.eligibleCountries, ...row.countries]),
            eligibleContinents: uniq([...p.eligibleContinents, ...row.continents]),
          },
    });
  }

  if (p.createdById && p.createdById !== deciderId) {
    const target = row.club?.name ?? (row.global ? "*" : [...row.countries, ...row.continents].join(", "));
    const remaining = await prisma.pollApproval.count({ where: { pollId: p.id, status: "PENDING" } });
    await createNotification(p.createdById, "POLL_APPROVAL_DECIDED", {
      pollId: p.id,
      pollQuestion: p.question.slice(0, 120),
      approved: decision.approve ? "1" : "0",
      target,
      reason: decision.reason?.trim() || "",
      remaining,
    });
  }

  if (decision.approve && isPollOpen(p)) {
    await notifyPollAudience(p.id);
  }
  return { ok: true as const };
}

/** Un brouillon ne s'ouvre qu'une fois toutes ses demandes acceptées. */
export async function openBlocker(pollId: string): Promise<"awaiting_approval" | "approval_rejected" | null> {
  const rows = await prisma.pollApproval.findMany({ where: { pollId, status: { in: ["PENDING", "REJECTED"] } }, select: { status: true } });
  if (rows.some((r) => r.status === "REJECTED")) return "approval_rejected";
  if (rows.length > 0) return "awaiting_approval";
  return null;
}
