import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

/**
 * Confirme le vote d'un GUEST (clic sur le lien reçu par mail) : c'est ICI que
 * le bulletin est réellement déposé dans l'urne, de façon atomique avec le
 * passage de l'émargement à "verified". Le choix était gardé en attente
 * (pendingChoice) depuis la soumission du formulaire.
 *
 * Route en GET (ouverte depuis un client mail) → redirige vers une page de
 * résultat plutôt que de renvoyer du JSON brut.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const token = new URL(request.url).searchParams.get("token");
  const base = `/poll/${params.id}`;

  if (!token) redirect(`${base}?verify=invalid`);

  const voter = await prisma.pollVoter.findFirst({
    where: { pollId: params.id, verifyToken: token },
    select: { id: true, verified: true, verifyExpiry: true, pendingChoice: true },
  });

  if (!voter) redirect(`${base}?verify=invalid`);
  if (voter.verified) redirect(`${base}?verify=already`);
  if (voter.verifyExpiry && voter.verifyExpiry < new Date()) redirect(`${base}?verify=expired`);

  const choices = Array.isArray(voter.pendingChoice) ? (voter.pendingChoice as string[]) : [];
  if (choices.length === 0) redirect(`${base}?verify=invalid`);

  // Dépôt atomique : bulletin(s) dans l'urne + émargement marqué vérifié, et on
  // efface le choix en attente + le token (usage unique). Le bulletin reste
  // anonyme (aucun lien vers l'émargement).
  await prisma.$transaction(async (tx) => {
    await tx.pollBallot.createMany({
      data: choices.map((choice) => ({ pollId: params.id, choice })),
    });
    await tx.pollVoter.update({
      where: { id: voter.id },
      data: { verified: true, verifyToken: null, verifyExpiry: null, pendingChoice: undefined },
    });
  });

  redirect(`${base}?verify=success`);
}
