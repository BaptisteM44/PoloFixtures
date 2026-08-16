"use client";

import { useState, useEffect } from "react";
import { Link } from "@/i18n/navigation";
import Image from "next/image";
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

export function ClubMembersGrid({
  members,
  emptyLabel,
  clubName,
  cardsLabel = "Cartes",
  listLabel = "Liste",
}: {
  members: Member[];
  emptyLabel: string;
  clubName?: string;
  cardsLabel?: string;
  listLabel?: string;
}) {
  const [shuffled, setShuffled] = useState<Member[]>(members);
  const [view, setView] = useState<"cards" | "list">("cards");

  useEffect(() => {
    setShuffled(shuffle(members));
  }, []);

  if (shuffled.length === 0) {
    return <div className="empty-state"><p>{emptyLabel}</p></div>;
  }

  const toggle = (
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
      <div style={{ display: "inline-flex", borderRadius: 8, border: "1px solid var(--border)", overflow: "hidden", flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => setView("cards")}
          aria-pressed={view === "cards"}
          style={{
            padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", border: "none",
            background: view === "cards" ? "var(--teal)" : "var(--surface)",
            color: view === "cards" ? "#fff" : "var(--text-muted)",
          }}
        >
          ▦ {cardsLabel}
        </button>
        <button
          type="button"
          onClick={() => setView("list")}
          aria-pressed={view === "list"}
          style={{
            padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", border: "none",
            background: view === "list" ? "var(--teal)" : "var(--surface)",
            color: view === "list" ? "#fff" : "var(--text-muted)",
          }}
        >
          ☰ {listLabel}
        </button>
      </div>
    </div>
  );

  if (view === "list") {
    return (
      <div>
        {toggle}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 380 }}>
          {shuffled.map((m) => (
            <Link key={m.id} href={`/player/${m.player.slug ?? m.player.id}`} style={{ textDecoration: "none", color: "inherit" }}>
              <div
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  background: "var(--surface-2)", border: "1.5px solid var(--border-light)",
                  borderRadius: 20, padding: "4px 12px 4px 6px", fontSize: 13,
                }}
              >
                <div
                  style={{
                    position: "relative",
                    width: 26, height: 26, borderRadius: "50%", overflow: "hidden", flexShrink: 0,
                    background: "var(--border)", display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  {m.player.photoPath ? (
                    <Image src={m.player.photoPath} alt={m.player.name} fill sizes="26px" style={{ objectFit: "cover" }} />
                  ) : (
                    <span style={{ fontSize: 12, fontWeight: 800, color: "#fff" }}>{m.player.name[0]?.toUpperCase()}</span>
                  )}
                </div>
                <span style={{ fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {m.player.name}
                </span>
                {m.player.city && (
                  <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>{m.player.city}</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {toggle}
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
    </div>
  );
}
