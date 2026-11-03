"use client";

/**
 * Carte joueur de la home en tuiles, à sa taille réelle (340×520) comme
 * partout ailleurs sur le site : c'est elle qui fixe la hauteur de la rangée
 * du haut.
 */

import { PlayerCollectibleCard } from "@/components/PlayerCollectibleCard";
import type { HeroPlayer } from "@/components/HomeBento";

export function BentoPlayerCard({ me }: { me: HeroPlayer }) {
  return (
    <div className="bento-card__frame">
      <PlayerCollectibleCard
        name={me.name}
        country={me.country}
        city={me.city}
        photoPath={me.photoPath}
        clubLogoPath={me.clubLogoPath}
        clubName={me.clubName}
        teamLogoPath={me.teamLogoPath}
        badges={me.badges}
        pinnedBadges={me.pinnedBadges}
        startYear={me.startYear}
        activeCard={me.activeCard}
        whbpcData={me.whbpcData}
        coachData={me.coachData ?? null}
      />
    </div>
  );
}
