import { prisma } from "@/lib/db";
import { PokemonCard } from "@/components/PokemonCard";
import { ContactModal } from "@/components/ContactModal";
import { auth } from "@/lib/auth";
import { getTranslations } from "next-intl/server";

export default async function PlayerPage({ params }: { params: { slug: string } }) {
  const t = await getTranslations("player");
  const player =
    (await prisma.player.findUnique({ where: { slug: params.slug } })) ??
    (await prisma.player.findFirst({ where: { id: params.slug } }));
  if (!player) return <div>{t("not_found")}</div>;

  const session = await auth();
  const currentPlayerId = (session?.user as any)?.playerId ?? null;
  const canContact = currentPlayerId && currentPlayerId !== player.id;

  return (
    <div className="player-profile">
      <div style={{ display: "flex", gap: 40, alignItems: "flex-start", flexWrap: "wrap" }}>
        <PokemonCard
          name={player.name}
          country={player.country}
          city={player.city}
          photoPath={player.photoPath}
          clubLogoPath={player.clubLogoPath}
          teamLogoPath={player.teamLogoPath}
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
            <p style={{ fontSize: 14, lineHeight: 1.7, margin: "0 0 16px" }}>{player.bio}</p>
          )}
          {canContact && (
            <ContactModal recipientId={player.id} recipientName={player.name} />
          )}
        </div>
      </div>
    </div>
  );
}
