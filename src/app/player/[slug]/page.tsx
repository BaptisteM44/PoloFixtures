import { prisma } from "@/lib/db";
import { PokemonCard } from "@/components/PokemonCard";

export default async function PlayerPage({ params }: { params: { slug: string } }) {
  const player =
    (await prisma.player.findUnique({ where: { slug: params.slug } })) ??
    (await prisma.player.findFirst({ where: { id: params.slug } }));
  if (!player) return <div>Joueur introuvable</div>;

  return (
    <div className="player-profile">
      <div style={{ display: "flex", gap: 40, alignItems: "flex-start", flexWrap: "wrap" }}>
        <PokemonCard
          name={player.name}
          country={player.country}
          city={player.city}
          photoPath={player.photoPath}
          clubLogoPath={player.clubLogoPath}
          emblemPosition={(player.emblemPosition as "top-left" | "top-right" | "bottom-left" | "bottom-right") ?? "top-right"}
          teamLogoPath={player.teamLogoPath}
          teamLogoPosition={(player.teamLogoPosition as "top-left" | "top-right" | "bottom-left" | "bottom-right") ?? "bottom-right"}
          badges={player.badges}
          pinnedBadges={player.pinnedBadges}
          startYear={player.startYear}
          hand={player.hand}
          gender={player.gender ?? undefined}
          showGender={player.showGender}
        />

        <div style={{ flex: 1, minWidth: 220, paddingTop: 8 }}>
          <h1 style={{ marginBottom: 4 }}>{player.name}</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 14, margin: "0 0 20px" }}>
            {player.city ? `${player.city}, ` : ""}{player.country}
          </p>
          {player.bio && (
            <p style={{ fontSize: 14, lineHeight: 1.7, margin: 0 }}>{player.bio}</p>
          )}
        </div>
      </div>
    </div>
  );
}
