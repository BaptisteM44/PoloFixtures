import { prisma } from "@/lib/db";
import { PlayerCardWithShare } from "@/components/PlayerCardWithShare";
import { ContactModal } from "@/components/ContactModal";
import { ShareTournamentButton } from "@/components/ShareTournamentButton";
import { ClaimProfileButton } from "@/components/ClaimProfileButton";
import { auth } from "@/lib/auth";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { localeAlternates, DEFAULT_OG_IMAGE } from "@/lib/seo";

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { slug: string; locale: string } }): Promise<Metadata> {
  const player =
    (await prisma.player.findUnique({ where: { slug: params.slug } })) ??
    (await prisma.player.findFirst({ where: { id: params.slug } }));
  if (!player) return { title: "Player not found" };

  // Le layout ajoute déjà « | Poloperator »
  const title = player.name;
  const ts = await getTranslations({ locale: params.locale, namespace: "seo" });
  const description = player.city
    ? ts("player_desc", { name: player.name, city: player.city, country: player.country })
    : ts("player_desc_nocity", { name: player.name });

  return {
    title,
    description,
    alternates: player.slug ? localeAlternates(params.locale, `/player/${player.slug}`) : undefined,
    openGraph: {
      title,
      description,
      type: "profile",
      images: player.photoPath ? [{ url: player.photoPath, width: 400, height: 400 }] : [DEFAULT_OG_IMAGE],
    },
    twitter: {
      card: player.photoPath ? "summary_large_image" : "summary",
      title,
      description,
      images: [player.photoPath ?? DEFAULT_OG_IMAGE.url],
    },
  };
}

export default async function PlayerPage({ params }: { params: { slug: string } }) {
  const t = await getTranslations("player");
  const playerInclude = { account: { select: { email: true } }, clubMemberships: { include: { club: { select: { name: true } } }, take: 1 }, whbpcCard: true, coachCard: true };
  const player =
    (await prisma.player.findUnique({ where: { slug: params.slug }, include: playerInclude })) ??
    (await prisma.player.findFirst({ where: { id: params.slug }, include: playerInclude }));
  if (!player) return <div>{t("not_found")}</div>;

  const session = await auth();
  const currentPlayerId = (session?.user as any)?.playerId ?? null;
  const hasRealAccount = !!(player.account?.email && player.account.email !== "");
  const canContact = currentPlayerId && currentPlayerId !== player.id && hasRealAccount;
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
          clubName={(player as any).clubMemberships?.[0]?.club?.name ?? null}
          teamLogoPath={player.teamLogoPath}
          badges={player.badges}
          pinnedBadges={player.pinnedBadges}
          startYear={player.startYear}
          hand={player.hand}
          gender={player.gender ?? undefined}
          showGender={player.showGender}
          activeCard={player.activeCard}
          coachData={player.coachCard ?? null}
          whbpcData={player.whbpcCard ? {
            teamName: player.whbpcCard.teamName,
            yearStarted: player.whbpcCard.yearStarted,
            countryCode: player.whbpcCard.countryCode,
            bestSkill: player.whbpcCard.bestSkill,
            pedals: player.whbpcCard.pedals,
            hand: player.whbpcCard.hand as "RIGHTIE" | "LEFTIE",
            wheelSize: player.whbpcCard.wheelSize,
            gearRatio: player.whbpcCard.gearRatio,
          } : null}
          canShare={isOwnProfile}
        />

        <div style={{ flex: 1, minWidth: 0, paddingTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <h1 style={{ margin: 0 }}>{player.name}</h1>
            <ShareTournamentButton path={`/player/${player.slug ?? player.id}`} title={player.name} label={t("share_profile")} />
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: 14, margin: "0 0 20px" }}>
            {player.city ? `${player.city}, ` : ""}{player.country}
          </p>
          {player.bio && (
            <p style={{ fontSize: 14, lineHeight: 1.7, margin: "0 0 16px", wordBreak: "break-word", overflowWrap: "break-word" }}>{player.bio}</p>
          )}
          {currentPlayerId && !hasRealAccount && currentPlayerId !== player.id && (
            <ClaimProfileButton ghostId={player.id} ghostName={player.name} />
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
