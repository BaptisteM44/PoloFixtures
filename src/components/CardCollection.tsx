"use client";

import { PokemonCard } from "./PokemonCard";
import { WhbpcCard, type WhbpcCardProps } from "./WhbpcCard";
import { ALL_CARDS, resolveOwnedCards, DEFAULT_CARD_ID, type CardInfo } from "@/lib/card-catalog";

const RARITY_COLOR: Record<string, string> = {
  legendary: "#d4a017",
  special: "#a855f7",
  epic: "#c084fc",
  rare: "var(--teal)",
  standard: "var(--text-muted)",
};

type PlayerCardData = {
  name: string;
  country: string;
  city?: string | null;
  photoPath?: string | null;
  clubLogoPath?: string | null;
  clubName?: string | null;
  teamLogoPath?: string | null;
  badges?: string[];
  pinnedBadges?: string[];
  startYear?: number | null;
};

export function CardCollection({
  player,
  ownedCards,
  activeCard,
  whbpcData,
  onSelect,
}: {
  player: PlayerCardData;
  ownedCards: string[];
  activeCard: string | null;
  /** Player's own WHBPC card data, if they received one. Omit if they don't have it. */
  whbpcData?: Omit<WhbpcCardProps, "playerName"> | null;
  /** Called when the player picks an owned card as active. Omit for read-only. */
  onSelect?: (cardId: string) => void;
}) {
  const owned = resolveOwnedCards(ownedCards);
  const active = activeCard && owned.has(activeCard) ? activeCard : DEFAULT_CARD_ID;
  // Custom-layout cards (WHBPC, etc.) the player doesn't have are hidden entirely —
  // they're gifted for a specific past event, not a "coming soon" slot to tease.
  const visibleCards = ALL_CARDS.filter((c) => !c.custom || owned.has(c.id));
  const ownedCount = visibleCards.filter((c) => owned.has(c.id)).length;

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Collection</h2>
        <span style={{ fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 20, border: "2px solid var(--border)", color: "var(--text-muted)" }}>
          {ownedCount} / {visibleCards.length}
        </span>
      </div>

      {/* ── Grid of card slots (full-size cards) ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
          justifyItems: "center",
          gap: 24,
        }}
      >
        {visibleCards.map((card) => {
          const isOwned = owned.has(card.id);
          const isActive = card.id === active;
          return (
            <CardSlot
              key={card.id}
              card={card}
              player={player}
              whbpcData={whbpcData}
              owned={isOwned}
              active={isActive}
              onSelect={onSelect && isOwned && !isActive ? () => onSelect(card.id) : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}

function CardSlot({
  card,
  player,
  whbpcData,
  owned,
  active,
  onSelect,
}: {
  card: CardInfo;
  player: PlayerCardData;
  whbpcData?: Omit<WhbpcCardProps, "playerName"> | null;
  owned: boolean;
  active: boolean;
  onSelect?: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      {owned && card.custom === "whbpc" && whbpcData ? (
        // Same base photo as every other card — no separate photo to manage.
        <WhbpcCard playerName={player.name} {...whbpcData} photoUrl={player.photoPath} />
      ) : owned ? (
        <PokemonCard
          name={player.name}
          country={player.country}
          city={player.city}
          photoPath={player.photoPath}
          clubLogoPath={player.clubLogoPath}
          clubName={player.clubName}
          teamLogoPath={player.teamLogoPath}
          badges={player.badges}
          pinnedBadges={player.pinnedBadges}
          startYear={player.startYear}
          {...card.style}
        />
      ) : (
        /* Locked slot: fully grey, no name / no emoji, same size as a real card */
        <div
          style={{
            width: 340,
            height: 520,
            borderRadius: 18,
            background: "var(--border)",
            opacity: 0.4,
          }}
        />
      )}

      {/* Name + rarity + action — only for owned cards */}
      {owned && (
        <div style={{ textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 15, fontFamily: "var(--font-display)" }}>{card.name}</span>
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.07em",
                textTransform: "uppercase",
                color: RARITY_COLOR[card.rarity],
              }}
            >
              {card.rarity}
            </span>
          </div>
          <div style={{ marginTop: 8 }}>
            {active ? (
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--teal)" }}>✓ Carte active</span>
            ) : onSelect ? (
              <button type="button" className="ghost" style={{ fontSize: 12, padding: "5px 16px" }} onClick={onSelect}>
                Afficher
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
