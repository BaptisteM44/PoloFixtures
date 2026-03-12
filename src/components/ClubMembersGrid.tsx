"use client";

import { useState, useEffect } from "react";
import { Link } from "@/i18n/navigation";
import { PokemonCard } from "@/components/PokemonCard";

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
    emblemPosition: string | null;
    teamLogoPath: string | null;
    teamLogoPosition: string | null;
    badges: string[];
    pinnedBadges: string[];
    startYear: number | null;
    hand: string | null;
    gender: string | null;
    showGender: boolean;
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

export function ClubMembersGrid({ members, emptyLabel }: { members: Member[]; emptyLabel: string }) {
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
          <PokemonCard
            name={m.player.name}
            country={m.player.country ?? ""}
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
            gender={m.player.gender as "MALE" | "FEMALE" | "NON_BINARY" | "PREFER_NOT_SAY" | null | undefined}
            showGender={m.player.showGender}
          />
        </Link>
      ))}
    </div>
  );
}
