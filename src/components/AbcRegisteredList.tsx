"use client";

/**
 * Liste des inscrits d'un tournoi ABC Chapeau (onglet inscription).
 * Deux vues au choix : cartes de collection (par défaut, joli sur desktop)
 * ou liste compacte (plus pratique sur téléphone). Le toggle vit côté client.
 */

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { PlayerCollectibleCard } from "@/components/PlayerCollectibleCard";

type WhbpcData = {
  teamName: string;
  yearStarted: string;
  countryCode: string;
  bestSkill: string;
  pedals: string;
  hand: string;
  wheelSize: string;
  gearRatio: string;
};

export type AbcEntry = {
  id: string;
  level: string;
  waitlisted: boolean;
  player: {
    id: string;
    name: string;
    country: string;
    city: string | null;
    photoPath: string | null;
    badges: string[];
    pinnedBadges: string[];
    startYear: number | null;
    hand: string | null;
    gender: "MALE" | "FEMALE" | "NON_BINARY" | "PREFER_NOT_SAY" | null;
    showGender: boolean;
    slug: string | null;
    activeCard: string | null;
    whbpcCard: WhbpcData | null;
  };
};

export function AbcRegisteredList({ entries }: { entries: AbcEntry[] }) {
  const t = useTranslations("tournament");
  const [view, setView] = useState<"cards" | "list">("cards");

  const active = entries.filter((e) => !e.waitlisted);
  const waitlist = entries.filter((e) => e.waitlisted);
  if (active.length === 0) return null;

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>{t("abc_registered_title", { count: active.length })}</h3>
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
            ▦ {t("abc_view_cards")}
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
            ☰ {t("abc_view_list")}
          </button>
        </div>
      </div>

      {view === "cards" ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          {active.map((e) => {
            const card = (
              <div style={{ position: "relative" }}>
                <PlayerCollectibleCard
                  name={e.player.name}
                  country={e.player.country}
                  city={e.player.city}
                  photoPath={e.player.photoPath}
                  badges={e.player.badges}
                  pinnedBadges={e.player.pinnedBadges}
                  startYear={e.player.startYear}
                  hand={e.player.hand}
                  gender={e.player.gender ?? undefined}
                  showGender={e.player.showGender}
                  activeCard={e.player.activeCard}
                  whbpcData={e.player.whbpcCard ? { ...e.player.whbpcCard, hand: e.player.whbpcCard.hand as "RIGHTIE" | "LEFTIE" } : null}
                />
                <div style={{ position: "absolute", top: 8, right: 8, fontWeight: 700, fontSize: 12, background: "rgba(0,0,0,0.7)", color: "#fff", borderRadius: 6, padding: "2px 7px" }}>
                  {e.level}
                </div>
              </div>
            );
            return e.player.slug ? (
              <Link key={e.id} href={`/player/${e.player.slug}`} style={{ textDecoration: "none", display: "contents" }}>
                {card}
              </Link>
            ) : <div key={e.id} style={{ display: "contents" }}>{card}</div>;
          })}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 380 }}>
          {active.map((e) => {
            const row = (
              <div
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  background: "var(--surface-2)", border: "1.5px solid var(--border-light)",
                  borderRadius: 20, padding: "4px 12px 4px 6px", fontSize: 13,
                }}
              >
                <div
                  style={{
                    width: 26, height: 26, borderRadius: "50%", overflow: "hidden", flexShrink: 0,
                    background: "var(--border)", display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  {e.player.photoPath ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={e.player.photoPath} alt={e.player.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <span style={{ fontSize: 12, fontWeight: 800, color: "#fff" }}>{e.player.name[0]?.toUpperCase()}</span>
                  )}
                </div>
                <span style={{ fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {e.player.name}
                </span>
                {e.player.city && (
                  <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>{e.player.city}</span>
                )}
              </div>
            );
            return e.player.slug ? (
              <Link key={e.id} href={`/player/${e.player.slug}`} style={{ textDecoration: "none", color: "inherit" }}>
                {row}
              </Link>
            ) : <div key={e.id}>{row}</div>;
          })}
        </div>
      )}

      {waitlist.length > 0 && (
        <p className="meta" style={{ marginTop: 12, fontSize: 12 }}>
          + {waitlist.length} {t("abc_on_waitlist")}
        </p>
      )}
    </div>
  );
}
