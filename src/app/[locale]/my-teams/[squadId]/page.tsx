import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { SquadDashboard } from "@/components/SquadDashboard";

export default async function SquadPage({ params }: { params: { squadId: string } }) {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!playerId) redirect("/login");

  const squad = await prisma.squad.findUnique({
    where: { id: params.squadId },
    include: {
      members: {
        include: {
          player: { select: { id: true, name: true, slug: true, photoPath: true, country: true, city: true, badges: true, pinnedBadges: true, startYear: true, hand: true, gender: true, showGender: true, clubLogoPath: true, emblemPosition: true } },
        },
        orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
      },
      invitations: {
        where: { status: "PENDING" },
        include: {
          invitedPlayer: { select: { id: true, name: true, photoPath: true, country: true, city: true } },
          invitedBy: { select: { id: true, name: true } },
        },
      },
      messages: {
        include: { author: { select: { id: true, name: true, photoPath: true } } },
        orderBy: { createdAt: "asc" },
        take: 200,
      },
    },
  });

  if (!squad) return <div className="page"><p>Équipe introuvable.</p></div>;

  const myMember = squad.members.find((m) => m.playerId === playerId);
  if (!myMember) {
    return (
      <div className="page">
        <div className="panel" style={{ textAlign: "center", padding: 48 }}>
          <h2>Accès refusé</h2>
          <p className="meta">Tu n&apos;es pas membre de cette équipe.</p>
          <Link href="/my-teams" className="primary" style={{ marginTop: 16, display: "inline-block" }}>← Mes équipes</Link>
        </div>
      </div>
    );
  }

  const isCaptain = myMember.role === "CAPTAIN";

  return (
    <div className="page">
      <div style={{ marginBottom: 16 }}>
        <Link href="/my-teams" style={{ fontSize: 13, color: "var(--text-muted)", textDecoration: "none" }}>
          ← Mes équipes
        </Link>
      </div>

      <SquadDashboard
        squad={{
          id: squad.id,
          name: squad.name,
          color: squad.color,
          logoPath: squad.logoPath,
          bio: squad.bio,
        }}
        members={squad.members.map((m) => ({
          id: m.id,
          playerId: m.player.id,
          name: m.player.name,
          slug: m.player.slug,
          photoPath: m.player.photoPath,
          country: m.player.country,
          city: m.player.city,
          role: m.role as "CAPTAIN" | "MEMBER",
          joinedAt: m.joinedAt.toISOString(),
          badges: m.player.badges,
          pinnedBadges: m.player.pinnedBadges,
          startYear: m.player.startYear,
          hand: m.player.hand,
          gender: m.player.gender,
          showGender: m.player.showGender,
          clubLogoPath: m.player.clubLogoPath,
          emblemPosition: m.player.emblemPosition,
        }))}
        pendingInvitations={squad.invitations.map((inv) => ({
          id: inv.id,
          invitedPlayer: {
            id: inv.invitedPlayer.id,
            name: inv.invitedPlayer.name,
            photoPath: inv.invitedPlayer.photoPath,
            country: inv.invitedPlayer.country,
            city: inv.invitedPlayer.city,
          },
          invitedBy: { id: inv.invitedBy.id, name: inv.invitedBy.name },
          createdAt: inv.createdAt.toISOString(),
        }))}
        messages={squad.messages.map((msg) => ({
          id: msg.id,
          content: msg.content,
          createdAt: msg.createdAt.toISOString(),
          author: { id: msg.author.id, name: msg.author.name, photoPath: msg.author.photoPath },
        }))}
        currentPlayerId={playerId}
        isCaptain={isCaptain}
      />
    </div>
  );
}
