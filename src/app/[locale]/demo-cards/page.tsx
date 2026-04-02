"use client";

import { PokemonCard } from "@/components/PokemonCard";
import { ScrollTiltCard } from "@/components/ScrollTiltCard";

/* ── Demo players with realistic data ── */
const PLAYERS = {
  berlin: {
    name: "Berlin Special",
    country: "Germany",
    city: "Berlin",
    startYear: 2026,
    hand: "RIGHT" as const,
    badges: ["road_warrior", "tournament_berlin", "say_cheese"],
    photoPath: "/uploads/AddvmWVW.jpeg",
    theme: "berlin" as any,
    special: true,
  },
  rookie: {
    name: "Alex Newbie",
    country: "France",
    city: "Lyon",
    startYear: 2025,
    hand: "RIGHT" as const,
    badges: ["welcome"],
    photoPath: "/uploads/AddvmWVW.jpeg",
  },
  rising: {
    name: "Sam Roller",
    country: "Germany",
    city: "Berlin",
    startYear: 2024,
    hand: "LEFT" as const,
    badges: ["team_player", "welcome", "say_cheese", "first_blood"],
    photoPath: "/uploads/NN-4CYaU.jpeg",
  },
  solid: {
    name: "Jordan Swift",
    country: "United Kingdom",
    city: "London",
    startYear: 2022,
    hand: "RIGHT" as const,
    gender: "NON_BINARY" as const,
    showGender: true,
    badges: ["first_blood", "hat_trick", "sniper", "champion", "team_player", "squad_up", "welcome", "say_cheese", "host"],
    photoPath: "/uploads/AddvmWVW.jpeg",
  },
  veteran: {
    name: "Morgan Blaze",
    country: "Spain",
    city: "Barcelona",
    startYear: 2020,
    hand: "LEFT" as const,
    badges: [
      "first_blood", "hat_trick", "sniper", "goal_machine", "champion",
      "team_player", "squad_up", "veteran", "road_warrior",
      "host", "welcome", "og", "regular", "say_cheese", "chatterbox", "captain",
    ],
    photoPath: "/uploads/NN-4CYaU.jpeg",
  },
  mythic: {
    name: "Casey Venom",
    country: "Australia",
    city: "Melbourne",
    startYear: 2018,
    hand: "LEFT" as const,
    badges: [
      "first_blood", "hat_trick", "sniper", "goal_machine", "century_club",
      "champion", "back_to_back", "unbeaten",
      "team_player", "squad_up", "veteran", "road_warrior", "globe_trotter",
      "host", "serial_organizer",
      "welcome", "og", "regular", "addict", "profile_complete", "say_cheese",
      "chatterbox", "captain",
    ],
    photoPath: "/uploads/NN-4CYaU.jpeg",
  },
  legend: {
    name: "Riley Legend",
    country: "United States",
    city: "Seattle",
    startYear: 2017,
    hand: "RIGHT" as const,
    badges: [
      "first_blood", "hat_trick", "sniper", "goal_machine", "century_club",
      "champion", "back_to_back", "unbeaten",
      "team_player", "squad_up", "veteran", "road_warrior", "globe_trotter", "loyal_rider",
      "host", "serial_organizer", "community_builder", "grand_architect",
      "welcome", "og", "regular", "addict", "profile_complete", "say_cheese",
      "chatterbox", "hype_machine", "captain",
      "night_owl", "collector", "completionist",
      "eruption", "five_continents", "full_year", "phantom", "stone_cold", "squeaky_clean",
    ],
    photoPath: "/uploads/AddvmWVW.jpeg",
  },
};

const BERLIN_THEMES = [
  {
    key: "berlin_bauhaus" as const,
    label: "Bauhaus",
    desc: "Blanc cassé · noir · rouge · typographie géométrique",
  },
];

const TIERS = [
  { key: "rookie", tier: "UNCOMMON", color: "#60c9cf", stars: "★", desc: "1–2 badges" },
  { key: "rising", tier: "RARE", color: "#ffa2af", stars: "★★", desc: "3–7 badges" },
  { key: "solid", tier: "EPIC", color: "#a855f7", stars: "★★★", desc: "8–14 badges" },
  { key: "veteran", tier: "MYTHIC", color: "#c77dff", stars: "★★★★", desc: "15–24 badges" },
  { key: "legend", tier: "LEGENDARY", color: "#fffc8a", stars: "★★★★★", desc: "25+ badges" },
] as const;

const PAGE: React.CSSProperties = {
  maxWidth: 1400,
  margin: "0 auto",
  padding: "40px 20px",
  background: "transparent",
};

const SECTION: React.CSSProperties = {
  marginBottom: 96,
  borderTop: "1px solid rgba(255,255,255,0.07)",
  paddingTop: 64,
};

const H2: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: 22,
  marginBottom: 12,
  textAlign: "center" as const,
  letterSpacing: "0.08em",
  textTransform: "uppercase" as const,
};

const MUTED: React.CSSProperties = {
  color: "var(--text-muted)",
  textAlign: "center" as const,
  maxWidth: 580,
  margin: "0 auto 40px",
  lineHeight: 1.7,
  fontSize: 14,
};

export default function DemoCardsPage() {
  return (
    <div style={{ background: "#06080f", minHeight: "100vh" }}>
      <div style={PAGE}>
        <div style={{ textAlign: "center", paddingTop: 32, paddingBottom: 80 }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, marginBottom: 12, fontWeight: 700 }}>
            🃏 Demo Cards
          </h1>
          <p style={MUTED}>A showcase of player cards at different rarity tiers with various effects.</p>
        </div>

        <section style={SECTION}>
          <h2 style={H2}>Rarity Tiers</h2>
          <div style={{ display: "flex", gap: 24, justifyContent: "center", flexWrap: "wrap" }}>
            {TIERS.map(({ key, tier, color }) => (
              <div key={key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color, textTransform: "uppercase" }}>
                  {tier}
                </span>
                <PokemonCard {...PLAYERS[key as keyof typeof PLAYERS]} />
              </div>
            ))}
          </div>
        </section>

        <section style={SECTION}>
          <h2 style={H2}>Scroll Tilt Effect (Mobile)</h2>
          <p style={MUTED}>On mobile, cards tilt with scroll. Hover effects on desktop.</p>
          <div style={{ display: "flex", gap: 24, justifyContent: "center", flexWrap: "wrap" }}>
            <ScrollTiltCard {...PLAYERS.mythic} />
            <ScrollTiltCard {...PLAYERS.legend} />
          </div>
        </section>

        <section style={SECTION}>
          <h2 style={H2}>Berlin Theme</h2>
          <div style={{ display: "flex", gap: 24, justifyContent: "center", flexWrap: "wrap" }}>
            <PokemonCard {...PLAYERS.berlin} />
          </div>
        </section>
      </div>
    </div>
  );
}
