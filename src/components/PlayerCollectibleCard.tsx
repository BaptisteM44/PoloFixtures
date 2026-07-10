"use client";

/**
 * Renders whichever card is currently active for a player — a standard
 * PokemonCard (skinned via card-catalog style) or a fully custom card
 * (e.g. WhbpcCard). Single entry point so the profile page, account
 * sidebar, etc. don't need to know about custom card types.
 */

import { forwardRef } from "react";
import { PokemonCard, type PokemonCardProps } from "./PokemonCard";
import { WhbpcCard, type WhbpcCardProps } from "./WhbpcCard";
import { CARD_CATALOG, DEFAULT_CARD_ID } from "@/lib/card-catalog";

type Props = PokemonCardProps & {
  activeCard?: string | null;
  /** Data for the player's WHBPC card, if they have one. */
  whbpcData?: Omit<WhbpcCardProps, "playerName" | "photoUrl"> | null;
};

export const PlayerCollectibleCard = forwardRef<HTMLDivElement, Props>(function PlayerCollectibleCard(
  { activeCard, whbpcData, ...pokemonProps },
  ref
) {
  const card = (activeCard && CARD_CATALOG[activeCard]) || CARD_CATALOG[DEFAULT_CARD_ID];

  if (card.custom === "whbpc" && whbpcData) {
    // Same base photo as every other card — no separate photo to manage.
    return <WhbpcCard playerName={pokemonProps.name} {...whbpcData} photoUrl={pokemonProps.photoPath} />;
  }

  return <PokemonCard ref={ref} {...pokemonProps} {...card.style} />;
});
