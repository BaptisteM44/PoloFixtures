import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

export type PollLite = {
  id: string;
  status: "DRAFT" | "OPEN" | "CLOSED";
  options: string[];
  multipleChoice: boolean;
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

/** Valide que les choix soumis appartiennent bien aux options du sondage. */
export function validateChoices(poll: PollLite, choices: string[]): string | null {
  if (choices.length === 0) return "Aucun choix sélectionné.";
  if (!poll.multipleChoice && choices.length > 1) return "Un seul choix autorisé.";
  const dedup = new Set(choices);
  if (dedup.size !== choices.length) return "Choix en double.";
  for (const c of choices) {
    if (!poll.options.includes(c)) return "Choix invalide.";
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
 */
export async function castVote(params: {
  pollId: string;
  voterHash: string;
  choices: string[];
  isGuest: boolean;
  guestInfo?: Prisma.InputJsonValue | null;
  verified: boolean;
}): Promise<CastResult> {
  try {
    await prisma.$transaction(async (tx) => {
      // 1) Émargement — la contrainte unique fait foi pour l'anti-double-vote.
      await tx.pollVoter.create({
        data: {
          pollId: params.pollId,
          voterHash: params.voterHash,
          isGuest: params.isGuest,
          verified: params.verified,
          guestInfo: params.guestInfo ?? undefined,
        },
      });
      // 2) Bulletin(s) — anonyme, aucun champ ne pointe vers le votant.
      await tx.pollBallot.createMany({
        data: params.choices.map((choice) => ({ pollId: params.pollId, choice })),
      });
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, reason: "already_voted" };
    }
    throw e;
  }
}
