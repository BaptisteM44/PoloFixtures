/**
 * 🧪 Bac à sable — vue pipeline d'un tournoi fictif : timeline des étapes,
 * classements, matchs, boutons de lancement/simulation/reset.
 */
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { hasAtLeastRole } from "@/lib/rbac";
import { getPipeline, stageStandings, finalStandings } from "@/engine/pipeline-server";
import { SandboxPipeline } from "@/components/sandbox/SandboxPipeline";

export const dynamic = "force-dynamic";

export default async function SandboxTournamentPage({ params }: { params: { id: string } }) {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!playerId) return notFound();

  const t = await getPipeline(params.id);
  if (!t || !(t as unknown as { testMode: boolean }).testMode) return notFound();
  const isOwner = t.creatorId === playerId || hasAtLeastRole(session?.user?.role, "ADMIN");
  if (!isOwner) return notFound();

  const teamName = new Map(t.teams.map((x) => [x.id, x.name]));
  const name = (id: string | null | undefined) => (id ? teamName.get(id) ?? "?" : null);

  const stages = t.stages.map((s) => {
    const groups = [...new Set(s.entries.map((e) => e.groupKey))].sort();
    const standingsByGroup = (s.status === "ACTIVE" || s.status === "DONE")
      ? groups.map((g) => ({
          groupKey: g,
          ranking: stageStandings(t, s.order, g === "" ? undefined : g).map((id) => teamName.get(id) ?? "?"),
        }))
      : [];
    return {
      id: s.id,
      order: s.order,
      name: s.name,
      type: s.type as string,
      status: s.status as string,
      config: s.config as Record<string, unknown>,
      groups,
      entriesCount: s.entries.length,
      standingsByGroup,
      matches: s.matches
        .sort((a, b) => a.roundIndex - b.roundIndex || a.positionInRound - b.positionInRound)
        .map((m) => ({
          id: m.id,
          roundIndex: m.roundIndex,
          positionInRound: m.positionInRound,
          groupKey: m.groupKey,
          bracketSide: m.bracketSide as string | null,
          status: m.status as string,
          courtName: m.courtName,
          startAt: m.startAt.toISOString(),
          teamA: name(m.teamAId),
          teamB: name(m.teamBId),
          teamAId: m.teamAId,
          teamBId: m.teamBId,
          scoreA: m.scoreA,
          scoreB: m.scoreB,
          nextMatchWinId: m.nextMatchWinId,
          nextSlotWin: m.nextSlotWin,
          nextMatchLoseId: m.nextMatchLoseId,
          nextSlotLose: m.nextSlotLose,
          winnerTeamId: m.winnerTeamId,
          phase: m.phase as string,
        })),
    };
  });

  const podium = t.status === "COMPLETED"
    ? finalStandings(t).slice(0, 3).map((id) => teamName.get(id) ?? "?")
    : null;

  return (
    <SandboxPipeline
      tournament={{
        id: t.id,
        name: t.name,
        status: t.status as string,
        timezone: (t as unknown as { timezone?: string }).timezone ?? "Europe/Brussels",
        teamCount: t.teams.length,
        teams: t.teams.sort((a, b) => a.seed - b.seed).map((x) => ({ id: x.id, name: x.name, seed: x.seed })),
      }}
      stages={stages}
      podium={podium}
    />
  );
}
