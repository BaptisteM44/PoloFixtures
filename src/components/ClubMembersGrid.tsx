"use client";

import { useState, useEffect } from "react";
import { Link } from "@/i18n/navigation";
import { PlayerCollectibleCard } from "@/components/PlayerCollectibleCard";

type Member = {
  id: string;
  player: {
    id: string;
    name: string;
    slug: string | null;
    country: string | null;
    city: string | null;
    photoPath: string | null;
    clubLogoPath: string | null;
    teamLogoPath: string | null;
    badges: string[];
    pinnedBadges: string[];
    startYear: number | null;
    hand: string | null;
    gender: string | null;
    showGender: boolean;
    activeCard?: string | null;
    whbpcCard?: {
      teamName: string; yearStarted: string; countryCode: string; bestSkill: string;
      pedals: string; hand: string; wheelSize: string; gearRatio: string;
    } | null;
  };
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function ClubMembersGrid({ members, emptyLabel, clubName }: { members: Member[]; emptyLabel: string; clubName?: string }) {
  const [shuffled, setShuffled] = useState<Member[]>(members);

  useEffect(() => {
    setShuffled(shuffle(members));
  }, []);

  if (shuffled.length === 0) {
    return <div className="empty-state"><p>{emptyLabel}</p></div>;
  }

  return (
    <div className="pokemon-card-grid">
      {shuffled.map((m) => (
        <Link key={m.id} href={`/player/${m.player.slug ?? m.player.id}`} style={{ textDecoration: "none" }}>
          <PlayerCollectibleCard
            name={m.player.name}
            country={m.player.country ?? ""}
            city={m.player.city}
            photoPath={m.player.photoPath}
            clubLogoPath={m.player.clubLogoPath}
            clubName={clubName}
            teamLogoPath={m.player.teamLogoPath}
            badges={m.player.badges}
            pinnedBadges={m.player.pinnedBadges}
            startYear={m.player.startYear}
            hand={m.player.hand}
            gender={m.player.gender as "MALE" | "FEMALE" | "NON_BINARY" | "PREFER_NOT_SAY" | null | undefined}
            showGender={m.player.showGender}
            activeCard={m.player.activeCard}
            whbpcData={m.player.whbpcCard ? { ...m.player.whbpcCard, hand: m.player.whbpcCard.hand as "RIGHTIE" | "LEFTIE" } : null}
          />
        </Link>
      ))}
    </div>
  );
}
