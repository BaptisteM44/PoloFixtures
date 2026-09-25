/**
 * Notifications liées au cycle de vie des sondages. Tout est idempotent
 * (horodatages sur Poll + dédoublonnage par joueur), donc on peut appeler ces
 * fonctions aussi souvent qu'on veut : au fil des actions ET via le balayage
 * périodique (sweepPolls), qui rattrape ce qui dépend de l'heure (ouverture
 * programmée, rappel avant fermeture, résultats à date).
 */
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notify";
import { findPollAudience } from "@/lib/poll-access";
import { hashPlayerVoter } from "@/lib/poll-hash";
import { areResultsVisibleToVoters, isPollOpen, isPollRestricted } from "@/lib/poll-vote";

const REMINDER_WINDOW_MS = 24 * 3600_000;
// Pas de rappel si le sondage vient d'ouvrir : on ne double pas la notif d'ouverture.
const REMINDER_MIN_AGE_MS = 12 * 3600_000;
export const VOTE_MILESTONES = [1, 10, 25, 50, 100, 250, 500, 1000];

async function notifyMany(ids: string[], type: Parameters<typeof createNotification>[1], payload: Record<string, string | number>) {
  for (let i = 0; i < ids.length; i += 20) {
    await Promise.all(ids.slice(i, i + 20).map((id) => createNotification(id, type, payload)));
  }
}

const pollSelect = {
  id: true, question: true, status: true, openAt: true, closeAt: true, blockedAt: true, createdById: true,
  options: true, multipleChoice: true, showResults: true, resultsAt: true,
  eligibleClubIds: true, eligibleCountries: true, eligibleContinents: true,
  openNotifiedAt: true, reminderSentAt: true, resultsNotifiedAt: true,
} as const;

/** Joueurs ayant déjà reçu la notif d'ouverture de ce sondage. */
async function alreadyNotified(pollId: string, type: "POLL_OPENED" | "POLL_CLOSING_SOON"): Promise<Set<string>> {
  const rows = await prisma.notification.findMany({
    where: { type, payload: { path: ["pollId"], equals: pollId } },
    select: { playerId: true },
  });
  return new Set(rows.map((r) => r.playerId));
}

/** Inscrits qui ont voté (émargement vérifié) — retrouvés via leur hash. */
async function registeredVoters(pollId: string): Promise<string[]> {
  const hashes = new Set(
    (await prisma.pollVoter.findMany({ where: { pollId, isGuest: false, verified: true }, select: { voterHash: true } }))
      .map((v) => v.voterHash),
  );
  if (hashes.size === 0) return [];
  const players = await prisma.player.findMany({ where: { account: { isNot: null } }, select: { id: true } });
  return players.filter((p) => hashes.has(hashPlayerVoter(pollId, p.id))).map((p) => p.id);
}

/**
 * Notifie le public visé d'un sondage ciblé actuellement ouvert, sauf ceux
 * déjà notifiés (utile quand le ciblage s'élargit en cours de route). Un
 * sondage ouvert à tous ne notifie personne : il est signalé par la pastille.
 */
export async function notifyPollAudience(pollId: string, now = new Date()) {
  const poll = await prisma.poll.findUnique({ where: { id: pollId }, select: pollSelect });
  if (!poll || !isPollOpen(poll, now)) return;
  if (isPollRestricted(poll)) {
    const done = await alreadyNotified(poll.id, "POLL_OPENED");
    const audience = (await findPollAudience(poll)).filter((id) => !done.has(id));
    await notifyMany(audience, "POLL_OPENED", { pollId: poll.id, pollQuestion: poll.question.slice(0, 120) });
  }
  if (!poll.openNotifiedAt) await prisma.poll.update({ where: { id: poll.id }, data: { openNotifiedAt: now } });
}

/** Rappel « ferme dans moins de 24 h » aux concernés qui n'ont pas voté. */
async function sendClosingReminder(poll: { id: string; question: string } & Parameters<typeof findPollAudience>[0]) {
  const [audience, voters] = await Promise.all([findPollAudience(poll), registeredVoters(poll.id)]);
  const votedSet = new Set(voters);
  await notifyMany(audience.filter((id) => !votedSet.has(id)), "POLL_CLOSING_SOON", {
    pollId: poll.id, pollQuestion: poll.question.slice(0, 120),
  });
  await prisma.poll.update({ where: { id: poll.id }, data: { reminderSentAt: new Date() } });
}

/** « Les résultats sont dispo » aux votants inscrits (modes AT_DATE / AT_CLOSE). */
async function sendResultsAvailable(poll: { id: string; question: string }) {
  const voters = await registeredVoters(poll.id);
  await notifyMany(voters, "POLL_RESULTS_AVAILABLE", { pollId: poll.id, pollQuestion: poll.question.slice(0, 120) });
  await prisma.poll.update({ where: { id: poll.id }, data: { resultsNotifiedAt: new Date() } });
}

/** Palier de votes atteint → notif au créateur (une seule fois par palier). */
export async function checkVoteMilestone(pollId: string) {
  try {
    const poll = await prisma.poll.findUnique({ where: { id: pollId }, select: { id: true, question: true, createdById: true } });
    if (!poll?.createdById) return;
    const count = await prisma.pollVoter.count({ where: { pollId, verified: true } });
    if (!VOTE_MILESTONES.includes(count)) return;
    const already = await prisma.notification.count({
      where: {
        playerId: poll.createdById, type: "POLL_VOTE_MILESTONE",
        AND: [{ payload: { path: ["pollId"], equals: pollId } }, { payload: { path: ["count"], equals: count } }],
      },
    });
    if (already > 0) return;
    await createNotification(poll.createdById, "POLL_VOTE_MILESTONE", { pollId, pollQuestion: poll.question.slice(0, 120), count });
  } catch (e) {
    console.error("[poll-notify] milestone failed:", e);
  }
}

/**
 * Balayage : ferme les sondages échus, envoie les notifs d'ouverture (y compris
 * programmées), les rappels et les « résultats dispo ». `pollId` restreint le
 * balayage à un sondage (appelé juste après une modification).
 */
export async function sweepPolls(opts: { pollId?: string; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const scope = opts.pollId ? { id: opts.pollId } : {};

  // 1) Fermeture automatique à closeAt (les résultats « à la fermeture » en dépendent).
  await prisma.poll.updateMany({ where: { ...scope, status: "OPEN", closeAt: { lt: now } }, data: { status: "CLOSED" } });

  const polls = await prisma.poll.findMany({
    where: {
      ...scope,
      blockedAt: null,
      status: { in: ["OPEN", "CLOSED"] },
      OR: [{ openNotifiedAt: null }, { reminderSentAt: null }, { resultsNotifiedAt: null }],
    },
    select: pollSelect,
  });

  for (const poll of polls) {
    try {
      const open = isPollOpen(poll, now);
      // 2) Ouverture (immédiate ou programmée).
      if (open && !poll.openNotifiedAt) {
        await notifyPollAudience(poll.id, now);
        poll.openNotifiedAt = now;
      }
      // 3) Rappel : ciblé, ouvert depuis un moment, ferme dans moins de 24 h.
      if (
        open && !poll.reminderSentAt && poll.closeAt && isPollRestricted(poll) &&
        poll.closeAt.getTime() - now.getTime() <= REMINDER_WINDOW_MS &&
        poll.openNotifiedAt && now.getTime() - poll.openNotifiedAt.getTime() >= REMINDER_MIN_AGE_MS
      ) {
        await sendClosingReminder(poll);
      }
      // 4) Résultats devenus visibles (seulement quand ils ne l'étaient pas au vote).
      if (
        !poll.resultsNotifiedAt && (poll.showResults === "AT_DATE" || poll.showResults === "AT_CLOSE") &&
        areResultsVisibleToVoters(poll, now)
      ) {
        await sendResultsAvailable(poll);
      }
    } catch (e) {
      console.error("[poll-notify] sweep failed for", poll.id, e);
    }
  }
}

// Balayage opportuniste (sans cron) : au plus une fois toutes les 5 minutes par
// instance, déclenché par les visites (pastille du header).
let lastSweep = 0;
export function maybeSweepPolls() {
  const now = Date.now();
  if (now - lastSweep < 5 * 60_000) return;
  lastSweep = now;
  sweepPolls().catch((e) => console.error("[poll-notify] sweep failed:", e));
}
