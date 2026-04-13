import { prisma } from "@/lib/db";
import { PlayerCardWithShare } from "@/components/PlayerCardWithShare";
import { ContactModal } from "@/components/ContactModal";
import { auth } from "@/lib/auth";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const player =
    (await prisma.player.findUnique({ where: { slug: params.slug } })) ??
    (await prisma.player.findFirst({ where: { id: params.slug } }));
  if (!player) return { title: "Player not found" };

  const title = `${player.name} — Poloperator`;
  const description = player.city
    ? `${player.name} from ${player.city}, ${player.country} — Bike Polo player on Poloperator`
    : `${player.name} — Bike Polo player on Poloperator`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "profile",
      ...(player.photoPath ? { images: [{ url: player.photoPath, width: 400, height: 400 }] } : {}),
    },
    twitter: {
      card: player.photoPath ? "summary_large_image" : "summary",
      title,
      description,
      ...(player.photoPath ? { images: [player.photoPath] } : {}),
    },
  };
}

export default async function PlayerPage({ params }: { params: { slug: string } }) {
  const t = await getTranslations("player");
  const player =
    (await prisma.player.findUnique({ where: { slug: params.slug } })) ??
    (await prisma.player.findFirst({ where: { id: params.slug } }));
  if (!player) return <div>{t("not_found")}</div>;

  const session = await auth();
  const currentPlayerId = (session?.user as any)?.playerId ?? null;
  const canContact = currentPlayerId && currentPlayerId !== player.id;
  const isOwnProfile = currentPlayerId === player.id;

  return (
    <div className="player-profile">
      <div style={{ display: "flex", gap: 40, alignItems: "flex-start", flexWrap: "wrap", maxWidth: 820, width: "100%" }}>
        <PlayerCardWithShare
          name={player.name}
          country={player.country ?? ""}
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
          canShare={isOwnProfile}
        />

        <div style={{ flex: 1, minWidth: 0, paddingTop: 8 }}>
          <h1 style={{ marginBottom: 4 }}>{player.name}</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 14, margin: "0 0 20px" }}>
            {player.city ? `${player.city}, ` : ""}{player.country}
          </p>
          {player.bio && (
            <p style={{ fontSize: 14, lineHeight: 1.7, margin: "0 0 16px", wordBreak: "break-word", overflowWrap: "break-word" }}>{player.bio}</p>
          )}
          {canContact && (
            <div style={{ marginBottom: 24 }}>
              <ContactModal recipientId={player.id} recipientName={player.name} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
