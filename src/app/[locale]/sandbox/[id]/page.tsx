/**
 * 🧪 Bac à sable — redirige vers le VRAI dashboard orga du tournoi de test.
 * Pas de page maison : on veut piloter le pipeline exactement comme un vrai
 * tournoi (mêmes boutons, même bracket, même planning), pour que le test soit
 * fidèle. La seule spécificité "sandbox" est le bandeau TEST affiché sur les
 * vraies pages via testMode, et les boutons de simulation en plus dans
 * PipelinePlanning quand isOrga && testMode.
 */
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { hasAtLeastRole } from "@/lib/rbac";

export default async function SandboxTournamentPage({ params }: { params: { id: string } }) {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!playerId) return notFound();

  const t = await prisma.tournament.findUnique({
    where: { id: params.id },
    select: { id: true, testMode: true, usesPipeline: true, creatorId: true } as never,
  }) as { id: string; testMode: boolean; usesPipeline: boolean; creatorId: string | null } | null;

  if (!t || !t.testMode || !t.usesPipeline) return notFound();
  const isOwner = t.creatorId === playerId || hasAtLeastRole(session?.user?.role, "ADMIN");
  if (!isOwner) return notFound();

  redirect(`/tournament/${t.id}/edit`);
}
