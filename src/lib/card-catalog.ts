/**
 * Card catalog — collectible player cards.
 *
 * A "card" is a visual skin applied to the player's PokemonCard (theme + variant +
 * holo + metal border). Players collect cards over time (per-tournament, special
 * editions, unlockable, etc.) and pick one as their active/public card.
 *
 * v1: this is a static display catalog. Only STANDARD is owned by default; the
 * rest are shown as locked "coming soon" slots. Real unlock logic will come later.
 */

import type { PokemonCardProps } from "@/components/PokemonCard";

export type CardRarity = "standard" | "rare" | "epic" | "legendary" | "special";

export interface CardInfo {
  id: string;
  name: string;
  /** Short line describing how it's obtained (or "À venir" for future cards). */
  hint: string;
  rarity: CardRarity;
  /** Whether every player owns this card by default (no unlock needed). */
  defaultOwned?: boolean;
  /**
   * Cards with a fully custom layout (not a PokemonCard skin) are rendered by
   * a dedicated component, keyed by this id. Their own data comes from a
   * separate table (e.g. WhbpcCard) rather than `style`.
   */
  custom?: "whbpc";
  /** Visual props merged into the PokemonCard when this card is active. Ignored for custom cards. */
  style?: Pick<PokemonCardProps, "theme" | "variant" | "metalBorder" | "holoVariant" | "holoFull" | "cardFx">;
}

/** The card everyone starts with. */
export const DEFAULT_CARD_ID = "standard";

export const CARD_CATALOG: Record<string, CardInfo> = {
  standard: {
    id: "standard",
    name: "Standard",
    hint: "Ta carte de base",
    rarity: "standard",
    defaultOwned: true,
    style: { theme: "default", variant: "classic" },
  },
  whbpc: {
    id: "whbpc",
    name: "WHBPC",
    hint: "Édition souvenir · participants WHBPC",
    rarity: "special",
    custom: "whbpc",
  },
  black: {
    id: "black",
    name: "Blackout",
    hint: "À venir",
    rarity: "rare",
    style: { theme: "black", variant: "classic" },
  },
  green: {
    id: "green",
    name: "Court Green",
    hint: "À venir",
    rarity: "rare",
    style: { theme: "green", variant: "classic" },
  },
  holofoil: {
    id: "holofoil",
    name: "Holofoil",
    hint: "À venir",
    rarity: "epic",
    style: { theme: "holofoil", variant: "classic", holoVariant: "iris", cardFx: "foil" },
  },
  gold: {
    id: "gold",
    name: "Gold Edition",
    hint: "À venir",
    rarity: "legendary",
    style: { theme: "gradient", variant: "fullart", metalBorder: "gold", holoFull: "constellation" },
  },
  berlin_techno: {
    id: "berlin_techno",
    name: "Berlin Techno",
    hint: "À venir · édition spéciale",
    rarity: "special",
    style: { theme: "berlin_techno", variant: "fullart", holoFull: "plasma" },
  },
};

/** List of all cards, in display order. */
export const ALL_CARDS: CardInfo[] = Object.values(CARD_CATALOG);

/** IDs a player owns: their stored ownedCards + any defaultOwned card. */
export function resolveOwnedCards(ownedCards: string[]): Set<string> {
  const set = new Set(ownedCards);
  for (const card of ALL_CARDS) {
    if (card.defaultOwned) set.add(card.id);
  }
  return set;
}

/**
 * The PokemonCard style props for a player's active card (falls back to
 * standard). Custom-layout cards (e.g. WHBPC) have no PokemonCard style —
 * they're rendered by their own component — so this falls back too.
 */
export function getActiveCardStyle(activeCard: string | null | undefined): NonNullable<CardInfo["style"]> {
  const card = (activeCard && CARD_CATALOG[activeCard]) || CARD_CATALOG[DEFAULT_CARD_ID];
  return card.style ?? CARD_CATALOG[DEFAULT_CARD_ID].style!;
}
