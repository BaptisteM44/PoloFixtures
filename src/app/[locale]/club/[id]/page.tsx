import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PokemonCard } from "@/components/PokemonCard";
import { ClubMemberManager } from "@/components/ClubMemberManager";

export const dynamic = "force-dynamic";

export default async function ClubPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { created?: string };
}) {
  const session = await auth();
  const currentPlayerId = session?.user?.playerId ?? null;
  const isAdmin = session?.user?.role === "ADMIN";

  const club = await prisma.club.findUnique({
    where: { id: params.id },
    include: {
      manager: { select: { id: true, name: true, slug: true } },
      members: {
        include: {
          player: {
            select: {
              id: true, name: true, slug: true, country: true, city: true,
              photoPath: true, badges: true, pinnedBadges: true,
              clubLogoPath: true, emblemPosition: true,
              teamLogoPath: true, teamLogoPosition: true,
              startYear: true, hand: true, gender: true, showGender: true,
            },
          },
        },
        orderBy: { joinedAt: "asc" },
      },
    },
  });

  if (!club) notFound();

  const isManager = currentPlayerId === club.managerId;
  const canSee = club.approved || isManager || isAdmin;
  if (!canSee) notFound();

  const activeMembers = club.members
    .filter((m) => m.status === "MEMBER")
    .sort(() => Math.random() - 0.5);
  const membersForManager = club.members.map((m) => ({
    id: m.id,
    playerId: m.playerId,
    status: m.status as "MEMBER" | "PENDING_BY_MANAGER" | "PENDING_BY_PLAYER",
    player: { id: m.player.id, name: m.player.name, slug: m.player.slug },
  }));

  return (
    <div>
      {/* Bannière pendante */}
      {!club.approved && (
        <div style={{ background: "color-mix(in srgb, var(--yellow) 12%, transparent)", border: "2px solid var(--yellow)", borderRadius: "var(--radius)", padding: "12px 20px", marginBottom: 20 }}>
          ⏳ Ce club est en attente d&apos;approbation par un administrateur.
          {isAdmin && (
            <form action={`/api/admin/clubs/${club.id}/approve`} method="POST" style={{ display: "inline", marginLeft: 16 }}>
              <button type="submit" className="primary" style={{ fontSize: 12, padding: "4px 12px" }}>
                ✓ Approuver
              </button>
            </form>
          )}
        </div>
      )}

      {searchParams.created && (
        <div style={{ background: "color-mix(in srgb, var(--teal) 12%, transparent)", border: "2px solid var(--teal)", borderRadius: "var(--radius)", padding: "12px 20px", marginBottom: 20 }}>
          🎉 Club créé ! Il sera visible publiquement après approbation.
        </div>
      )}

      {/* Header du club */}
      <div className="club-hero">
        <div className="club-hero__logo">
          {club.logoPath
            ? <img src={club.logoPath} alt={club.name} />
            : <div className="club-hero__logo-placeholder">{club.name[0]?.toUpperCase()}</div>
          }
        </div>
        <div className="club-hero__info">
          <h1>{club.name}</h1>
          <p className="club-hero__location">📍 {club.city}, {club.country}</p>
          {club.description && <p style={{ marginTop: 8, fontSize: 14, color: "var(--text-muted)" }}>{club.description}</p>}
          {club.website && (
            <a href={club.website} target="_blank" rel="noopener noreferrer" className="ghost" style={{ marginTop: 8, display: "inline-flex", fontSize: 13 }}>
              🌐 Site web →
            </a>
          )}
          <p className="meta" style={{ marginTop: 8 }}>
            Manager : <Link href={`/player/${club.manager.slug ?? club.manager.id}`}>{club.manager.name}</Link>
          </p>
        </div>
        <div className="club-hero__actions">
          <Link href={`/continent/${club.continentCode}/${encodeURIComponent(club.country)}`} className="ghost">
            ← {club.country}
          </Link>
          {isManager && (
            <Link href={`/club/${club.id}/edit`} className="ghost" style={{ fontSize: 13 }}>
              ✏️ Modifier
            </Link>
          )}
        </div>
      </div>

      <div className="club-layout">
        {/* Colonne gauche : joueurs */}
        <div className="club-players">
          <div className="section-header" style={{ marginBottom: 16 }}>
            <div>
              <h2>Joueur·ses ({activeMembers.length})</h2>
            </div>
          </div>
          {activeMembers.length > 0 ? (
            <div className="pokemon-card-grid">
              {activeMembers.map((m) => (
                <Link key={m.id} href={`/player/${m.player.slug ?? m.player.id}`} style={{ textDecoration: "none" }}>
                  <PokemonCard
                    name={m.player.name}
                    country={m.player.country}
                    city={m.player.city}
                    photoPath={m.player.photoPath}
                    clubLogoPath={m.player.clubLogoPath}
                    emblemPosition={(m.player.emblemPosition as "top-left" | "top-right" | "bottom-left" | "bottom-right") ?? "top-right"}
                    teamLogoPath={m.player.teamLogoPath}
                    teamLogoPosition={(m.player.teamLogoPosition as "top-left" | "top-right" | "bottom-left" | "bottom-right") ?? "bottom-right"}
                    badges={m.player.badges}
                    pinnedBadges={m.player.pinnedBadges}
                    startYear={m.player.startYear}
                    hand={m.player.hand}
                    gender={m.player.gender ?? undefined}
                    showGender={m.player.showGender}
                  />
                </Link>
              ))}
            </div>
          ) : (
            <div className="empty-state"><p>Aucun membre pour l&apos;instant.</p></div>
          )}
        </div>

        {/* Colonne droite : gestion des membres */}
        {currentPlayerId && (
          <div className="club-sidebar">
            <ClubMemberManager
              clubId={club.id}
              managerId={club.managerId}
              members={membersForManager}
              currentPlayerId={currentPlayerId}
              isManager={isManager}
            />
          </div>
        )}
      </div>
    </div>
  );
}
