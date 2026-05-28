import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { ScoreOverlay } from "@/components/ScoreOverlay";

export const dynamic = "force-dynamic";

export default async function ChannelOverlayPage({
  params,
}: {
  params: { channel: string; locale: string };
}) {
  const channel = await prisma.overlayChannel.findUnique({
    where: { slug: params.channel },
    include: {
      tournament: {
        select: {
          id: true,
          name: true,
          gameDurationMin: true,
          status: true,
          matches: {
            include: {
              teamA: { select: { id: true, name: true } },
              teamB: { select: { id: true, name: true } },
              events: { orderBy: { createdAt: "asc" } },
            },
            orderBy: { startAt: "asc" },
          },
        },
      },
    },
  });

  if (!channel) return notFound();

  // Aucun tournoi assigné → écran d'attente
  if (!channel.tournament) {
    const isDark = channel.theme === "dark";
    return (
      <>
        <style
          dangerouslySetInnerHTML={{
            __html: `
              header, footer, .site-footer { display: none !important; }
              main.page { padding: 0 !important; margin: 0 !important; min-height: auto !important; }
              body { background: transparent !important; overflow: hidden !important; margin: 0 !important; }
              html { background: transparent !important; }
            `,
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
            background: "transparent",
          }}
        >
          <div
            style={{
              padding: "16px 32px",
              borderRadius: 12,
              background: isDark ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.9)",
              color: isDark ? "#94a3b8" : "#64748b",
              fontSize: 16,
              fontWeight: 600,
            }}
          >
            {channel.label} — En attente
          </div>
        </div>
      </>
    );
  }

  return (
    <ScoreOverlay
      tournamentId={channel.tournament.id}
      tournamentName={channel.tournament.name}
      initialMatches={channel.tournament.matches}
      gameDurationMin={channel.tournament.gameDurationMin}
      court={channel.court}
      theme={channel.theme}
      showClock={channel.showClock}
      showScore={channel.showScore}
      showTeamNames={channel.showTeamNames}
      showEventFeed={channel.showEventFeed}
      showHeader={channel.showHeader}
      channelSlug={channel.slug}
      initialActiveCourt={channel.activeCourt}
      initialShowChat={channel.showChat}
    />
  );
}
