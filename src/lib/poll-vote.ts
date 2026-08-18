import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

export type PollLite = {
  id: string;
  status: "DRAFT" | "OPEN" | "CLOSED";
  options: string[];
  multipleChoice: boolean;
  minChoices?: number | null;
  maxChoices?: number | null;
  openAt: Date | null;
  closeAt: Date | null;
};

export type PollResultsVisibility = {
  showResults: "IMMEDIATE" | "AT_DATE" | "AT_CLOSE" | "HIDDEN";
  resultsAt: Date | null;
  status: "DRAFT" | "OPEN" | "CLOSED";
};

/**
 * Les résultats sont-ils visibles pour un VOTANT (pas l'admin, qui voit toujours
 * tout) ? Dépend du mode choisi par l'orga : dès le vote, à une date précise,
 * seulement à la fermeture du sondage, ou jamais.
 */
export function areResultsVisibleToVoters(poll: PollResultsVisibility, now = new Date()): boolean {
  switch (poll.showResults) {
    case "IMMEDIATE": return true;
    case "AT_DATE": return !!poll.resultsAt && now >= poll.resultsAt;
    case "AT_CLOSE": return poll.status === "CLOSED";
    case "HIDDEN": return false;
  }
}

/** Un sondage accepte-t-il des votes MAINTENANT (statut + fenêtre de dates) ? */
export function isPollOpen(poll: PollLite, now = new Date()): boolean {
  if (poll.status !== "OPEN") return false;
  if (poll.openAt && now < poll.openAt) return false;
  if (poll.closeAt && now > poll.closeAt) return false;
  return true;
}

/** Valide que les choix soumis appartiennent bien aux options du sondage, et
 * respectent les bornes min/max (multi-choix). */
export function validateChoices(poll: PollLite, choices: string[]): string | null {
  if (choices.length === 0) return "Aucun choix sélectionné.";
  if (!poll.multipleChoice && choices.length > 1) return "Un seul choix autorisé.";
  const dedup = new Set(choices);
  if (dedup.size !== choices.length) return "Choix en double.";
  for (const c of choices) {
    if (!poll.options.includes(c)) return "Choix invalide.";
  }
  if (poll.multipleChoice) {
    if (poll.minChoices != null && choices.length < poll.minChoices) {
      return `Choisis au moins ${poll.minChoices} réponse(s).`;
    }
    if (poll.maxChoices != null && choices.length > poll.maxChoices) {
      return `Choisis au maximum ${poll.maxChoices} réponse(s).`;
    }
  }
  return null;
}

export type CastResult =
  | { ok: true }
  | { ok: false; reason: "already_voted" | "closed" | "invalid" };

/**
 * Dépose un vote de façon ATOMIQUE et ANONYME :
 *  - crée l'émargement (PollVoter avec voterHash) → bloque le double-vote via la
 *    contrainte unique (pollId, voterHash) ;
 *  - crée le(s) bulletin(s) (PollBallot) SANS aucun lien vers l'émargement.
 * Tout dans une seule transaction : si l'émargement existe déjà (P2002), rien
 * n'est écrit → pas de bulletin fantôme.
 *
 * `allowRevote` (inscrits) : si l'émargement existe déjà, on REMPLACE le vote —
 * suppression des anciens bulletins (via ballotIds) + dépôt des nouveaux, en une
 * transaction. Le commentaire est porté par le 1er bulletin.
 */
export async function castVote(params: {
  pollId: string;
  voterHash: string;
  choices: string[];
  isGuest: boolean;
  guestInfo?: Prisma.InputJsonValue | null;
  verified: boolean;
  // Identité du votant INSCRIT (stats démographiques) — reste sur l'émargement,
  // jamais sur le bulletin. undefined/null pour les guests.
  playerId?: string | null;
  comment?: string | null;
  allowRevote?: boolean;
}): Promise<CastResult> {
  const buildBallots = () =>
    params.choices.map((choice, i) => ({
      pollId: params.pollId,
      choice,
      // Commentaire porté par le 1er bulletin uniquement (évite les doublons).
      comment: i === 0 ? (params.comment ?? null) : null,
    }));

  try {
    await prisma.$transaction(async (tx) => {
      // 1) Émargement — la contrainte unique fait foi pour l'anti-double-vote.
      const voter = await tx.pollVoter.create({
        data: {
          pollId: params.pollId,
          voterHash: params.voterHash,
          playerId: params.playerId ?? null,
          isGuest: params.isGuest,
          verified: params.verified,
          guestInfo: params.guestInfo ?? undefined,
        },
        select: { id: true },
      });
      // 2) Bulletin(s) — anonyme, aucun champ ne pointe vers le votant.
      const created = await Promise.all(
        buildBallots().map((data) => tx.pollBallot.create({ data, select: { id: true } })),
      );
      // 3) Mémorise les ids des bulletins sur l'émargement (pour un futur re-vote).
      await tx.pollVoter.update({
        where: { id: voter.id },
        data: { ballotIds: created.map((b) => b.id) },
      });
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      // Émargement déjà présent : soit on refuse (déjà voté), soit on remplace.
      if (params.allowRevote) {
        return await replaceVote(params, buildBallots);
      }
      return { ok: false, reason: "already_voted" };
    }
    throw e;
  }
}

/**
 * Re-vote d'un votant existant (inscrit) : supprime ses anciens bulletins
 * (retrouvés via ballotIds sur l'émargement) et dépose les nouveaux, en une
 * transaction. Met à jour ballotIds. L'anonymat est préservé (on ne lit jamais
 * le contenu des anciens bulletins, on les supprime par id).
 */
async function replaceVote(
  params: { pollId: string; voterHash: string; comment?: string | null },
  buildBallots: () => { pollId: string; choice: string; comment: string | null }[],
): Promise<CastResult> {
  await prisma.$transaction(async (tx) => {
    const voter = await tx.pollVoter.findUnique({
      where: { pollId_voterHash: { pollId: params.pollId, voterHash: params.voterHash } },
      select: { id: true, ballotIds: true },
    });
    if (!voter) return; // ne devrait pas arriver (on vient d'avoir un P2002)
    // Supprime les anciens bulletins de ce votant.
    if (voter.ballotIds.length > 0) {
      await tx.pollBallot.deleteMany({ where: { id: { in: voter.ballotIds } } });
    }
    // Dépose les nouveaux et ré-attache leurs ids à l'émargement.
    const created = await Promise.all(
      buildBallots().map((data) => tx.pollBallot.create({ data, select: { id: true } })),
    );
    await tx.pollVoter.update({
      where: { id: voter.id },
      data: { ballotIds: created.map((b) => b.id) },
    });
  });
  return { ok: true };
}
