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
  { key: "rookie", tier: "UNCOMMON", color: "#60c9cf", desc: "1-2 badges — léger reflet brillant au survol." },
  { key: "rising", tier: "RARE", color: "#ffa2af", desc: "3+ badges — holo visible avec paillettes sur la photo." },
  { key: "solid", tier: "EPIC", color: "#a855f7", desc: "8+ badges — holo intense, diffraction colorée." },
  { key: "veteran", tier: "MYTHIC", color: "#c77dff", desc: "15+ badges — sparkle intense, shimmer violet." },
  { key: "legend", tier: "LEGENDARY", color: "#fffc8a", desc: "25+ badges — full WebGL holo, paillettes maximum." },
] as const;

function TierBadge({ tier, color }: { tier: string; color: string }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "4px 14px",
      borderRadius: 6,
      fontFamily: "var(--font-display)",
      fontWeight: 700,
      fontSize: 13,
      letterSpacing: "0.1em",
      color: "#12121e",
      background: color,
    }}>
      {tier}
    </span>
  );
}

export default function DemoCardsPage() {
  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "40px 20px" }}>

      {/* HERO */}
      <div style={{ textAlign: "center", marginBottom: 64 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, marginBottom: 8 }}>
          🃏 Card System
        </h1>
        <p style={{ color: "var(--text-muted)", maxWidth: 600, margin: "0 auto", lineHeight: 1.7 }}>
          Chaque joueur a sa carte. Plus tu collectes de badges, plus ta carte évolue —
          de simple à <strong>légendaire</strong>. L&apos;effet holographique ne s&apos;affiche que sur la photo.
          Passe ta souris dessus !
        </p>
      </div>

      {/* SECTION MOBILE — Scroll tilt effect */}
      <section style={{ marginBottom: 80, borderTop: "2px solid var(--border)", paddingTop: 48 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, marginBottom: 8, textAlign: "center" }}>
          📱 Effet scroll mobile
        </h2>
        <p style={{ color: "var(--text-muted)", maxWidth: 560, margin: "0 auto 16px", lineHeight: 1.7, textAlign: "center" }}>
          Sur téléphone, la carte s&apos;incline automatiquement en 3D au fil du scroll — comme si elle flottait.
          Sur desktop, l&apos;effet souris classique reste actif.
        </p>
        <p style={{ color: "var(--text-muted)", fontSize: 12, textAlign: "center", marginBottom: 40 }}>
          👆 Scrolle sur cette page depuis ton téléphone pour voir l&apos;effet.
        </p>
        <div style={{ display: "flex", gap: 24, justifyContent: "center", flexWrap: "wrap" }}>
          <ScrollTiltCard {...PLAYERS.mythic} />
          <ScrollTiltCard {...PLAYERS.legend} />
          <ScrollTiltCard {...PLAYERS.legend} variant="fullart" />
          <ScrollTiltCard {...PLAYERS.veteran} theme="holofoil" />
        </div>
      </section>

      {/* SECTION 1 — Rarity Tiers */}
      <section style={{ marginBottom: 80 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, marginBottom: 32, textAlign: "center" }}>
          Les 5 raretés
        </h2>
        <div style={{ display: "flex", gap: 24, justifyContent: "center", flexWrap: "wrap" }}>
          {TIERS.map(({ key, tier, color, desc }) => {
            const p = PLAYERS[key as keyof typeof PLAYERS];
            return (
              <div key={key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, maxWidth: 250 }}>
                <PokemonCard {...p} />
                <TierBadge tier={tier} color={color} />
                <p style={{ color: "var(--text-muted)", fontSize: 12, textAlign: "center", lineHeight: 1.5 }}>{desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* SECTION 2 — Full Art vs Classic */}
      <section style={{ marginBottom: 80, borderTop: "2px solid var(--border)", paddingTop: 48 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, marginBottom: 8, textAlign: "center" }}>
          ✨ Classic vs Full Art
        </h2>
        <p style={{ color: "var(--text-muted)", textAlign: "center", marginBottom: 40, maxWidth: 550, margin: "0 auto 40px" }}>
          La variante <strong>Full Art</strong> met la photo en plein cadre — parfaite pour les joueurs légendaires.
          Les infos apparaissent en overlay semi-transparent.
        </p>

        <div style={{ display: "flex", gap: 48, justifyContent: "center", flexWrap: "wrap", alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <PokemonCard {...PLAYERS.legend} />
            <span style={{ fontFamily: "var(--font-display)", fontSize: 12, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}>Classic</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <PokemonCard {...PLAYERS.legend} variant="fullart" />
            <span style={{ fontFamily: "var(--font-display)", fontSize: 12, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}>Full Art</span>
          </div>
        </div>

      </section>

      {/* SECTION 3 — Thèmes */}
      <section style={{ marginBottom: 80, borderTop: "2px solid var(--border)", paddingTop: 48 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, marginBottom: 8, textAlign: "center" }}>
          🎨 Thèmes spéciaux
        </h2>
        <p style={{ color: "var(--text-muted)", textAlign: "center", marginBottom: 40, maxWidth: 550, margin: "0 auto 40px" }}>
          Des thèmes de couleur alternatifs. Chaque thème a son ambiance unique.
        </p>

        <h3 style={{ fontFamily: "var(--font-display)", fontSize: 16, marginBottom: 20, textAlign: "center" }}>
          🖤 Noir Profond
        </h3>
        <div style={{ display: "flex", gap: 24, justifyContent: "center", flexWrap: "wrap", marginBottom: 48 }}>
          <PokemonCard name="Shadow Rider" country="Japan" city="Tokyo" startYear={2019} hand="LEFT" theme="black" photoPath="/uploads/AddvmWVW.jpeg" badges={[
            "first_blood", "hat_trick", "sniper", "goal_machine", "champion", "unbeaten",
            "team_player", "squad_up", "veteran", "road_warrior",
            "host", "welcome", "og", "say_cheese", "night_owl", "collector"
          ]} />
          <PokemonCard name="Shadow Rider" country="Japan" city="Tokyo" startYear={2019} hand="LEFT" theme="black" variant="fullart" photoPath="/uploads/NN-4CYaU.jpeg" badges={[
            "first_blood", "hat_trick", "sniper", "goal_machine", "champion", "unbeaten",
            "team_player", "squad_up", "veteran", "road_warrior",
            "host", "welcome", "og", "say_cheese", "night_owl", "collector"
          ]} />
        </div>

        {/* Holofoil */}
        <h3 style={{ fontFamily: "var(--font-display)", fontSize: 16, marginBottom: 20, textAlign: "center" }}>
          ✨ Holographic Foil
        </h3>
        <p style={{ color: "var(--text-muted)", textAlign: "center", marginBottom: 24, fontSize: 13 }}>
          Inspiré des vraies cartes à collectionner — fond argenté pailleté prismatique qui réagit au mouvement de la souris.
        </p>
        <div style={{ display: "flex", gap: 24, justifyContent: "center", flexWrap: "wrap", marginBottom: 48 }}>
          <PokemonCard name="Woods" country="Switzerland" city="Genève" startYear={2009} hand="RIGHT" theme="holofoil" photoPath="/uploads/AddvmWVW.jpeg" badges={[
            "first_blood", "hat_trick", "sniper", "goal_machine", "century_club",
            "champion", "back_to_back", "unbeaten",
            "team_player", "squad_up", "veteran", "road_warrior", "globe_trotter", "loyal_rider",
            "host", "serial_organizer", "community_builder",
            "welcome", "og", "regular", "addict", "profile_complete", "say_cheese",
            "chatterbox", "hype_machine", "captain",
            "night_owl", "collector", "completionist"
          ]} />
          <PokemonCard name="Flash Gordon" country="France" city="Paris" startYear={2015} hand="LEFT" theme="holofoil" photoPath="/uploads/NN-4CYaU.jpeg" badges={[
            "first_blood", "hat_trick", "sniper", "goal_machine",
            "champion", "unbeaten",
            "team_player", "squad_up", "veteran", "road_warrior",
            "host", "welcome", "og", "say_cheese", "night_owl", "collector"
          ]} />
          <PokemonCard name="Neon Spike" country="Japan" city="Osaka" startYear={2018} hand="RIGHT" theme="holofoil" variant="fullart" photoPath="/uploads/AddvmWVW.jpeg" badges={[
            "first_blood", "hat_trick", "sniper", "goal_machine", "century_club",
            "champion", "back_to_back",
            "team_player", "squad_up", "veteran", "road_warrior", "globe_trotter",
            "host", "serial_organizer",
            "welcome", "og", "regular", "profile_complete", "say_cheese",
            "captain", "chatterbox", "collector"
          ]} />
        </div>
      </section>

      {/* SECTION BERLIN */}
      <section style={{ marginBottom: 80, borderTop: "2px solid var(--border)", paddingTop: 48 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, marginBottom: 8, textAlign: "center" }}>
          🐻 Berlin Cup — Bauhaus
        </h2>
        <p style={{ color: "var(--text-muted)", textAlign: "center", marginBottom: 48, maxWidth: 580, margin: "0 auto 48px" }}>
          Thème Bauhaus — blanc cassé, noir, rouge, typographie géométrique. Classic + Full Art, effet holo au survol.
        </p>

        {BERLIN_THEMES.map(({ key, label, desc }) => (
          <div key={key} style={{ marginBottom: 48 }}>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: 15, marginBottom: 6, textAlign: "center" }}>
              {label}
            </h3>
            <p style={{ color: "var(--text-muted)", fontSize: 12, textAlign: "center", marginBottom: 20 }}>{desc}</p>
            <div style={{ display: "flex", gap: 24, justifyContent: "center", flexWrap: "wrap" }}>
              <PokemonCard
                name="Kurt Stahl"
                country="Germany"
                city="Berlin"
                startYear={2019}
                hand="RIGHT"
                theme={key}
                photoPath="/uploads/NN-4CYaU.jpeg"
                badges={[
                  "first_blood", "hat_trick", "sniper", "goal_machine", "champion",
                  "team_player", "squad_up", "veteran", "road_warrior",
                  "host", "welcome", "og", "say_cheese", "night_owl", "collector",
                ]}
              />
              <PokemonCard
                name="Anya Weiss"
                country="Germany"
                city="Berlin"
                startYear={2021}
                hand="LEFT"
                theme={key}
                variant="fullart"
                photoPath="/uploads/AddvmWVW.jpeg"
                badges={[
                  "first_blood", "hat_trick", "sniper", "goal_machine", "century_club",
                  "champion", "back_to_back", "unbeaten",
                  "team_player", "squad_up", "veteran", "road_warrior", "globe_trotter",
                  "host", "serial_organizer", "community_builder",
                  "welcome", "og", "regular", "addict", "profile_complete", "say_cheese",
                  "chatterbox", "hype_machine", "captain", "night_owl", "collector", "completionist",
                ]}
              />
            </div>
          </div>
        ))}
      </section>

      {/* SECTION 5 — Metallic Borders */}
      <section style={{ borderTop: "2px solid var(--border)", paddingTop: 48 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, marginBottom: 8, textAlign: "center" }}>
          ✨ Contours Métalliques Animés
        </h2>
        <p style={{ color: "var(--text-muted)", marginBottom: 40, textAlign: "center" }}>
          5 niveaux de rareté — le contour tourne en boucle avec un effet lumineux adapté.
        </p>

        <div style={{ display: "flex", gap: 28, flexWrap: "wrap", justifyContent: "center", alignItems: "flex-start" }}>
          {/* Bronze */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 13, color: "#cd7f32", letterSpacing: 1 }}>BRONZE</span>
            <PokemonCard
              name="Iron Wolf"
              country="Germany"
              city="Berlin"
              startYear={2020}
              hand="RIGHT"
              photoPath="/uploads/NN-4CYaU.jpeg"
              metalBorder="bronze"
              badges={["first_blood", "hat_trick", "team_player", "welcome", "profile_complete"]}
            />
          </div>

          {/* Silver */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 13, color: "#c8c8c8", letterSpacing: 1 }}>SILVER</span>
            <PokemonCard
              name="Silver Fox"
              country="Sweden"
              city="Stockholm"
              startYear={2017}
              hand="LEFT"
              photoPath="/uploads/AddvmWVW.jpeg"
              metalBorder="silver"
              badges={["first_blood", "hat_trick", "sniper", "team_player", "squad_up", "veteran", "welcome", "og", "profile_complete"]}
            />
          </div>

          {/* Gold */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 13, color: "#ffd700", letterSpacing: 1 }}>GOLD</span>
            <PokemonCard
              name="Golden Ace"
              country="France"
              city="Lyon"
              startYear={2015}
              hand="RIGHT"
              photoPath="/uploads/NN-4CYaU.jpeg"
              metalBorder="gold"
              badges={[
                "first_blood", "hat_trick", "sniper", "goal_machine", "champion",
                "team_player", "squad_up", "veteran", "road_warrior",
                "host", "welcome", "og", "regular", "profile_complete", "say_cheese", "chatterbox"
              ]}
            />
          </div>

          {/* Platinum */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 13, color: "#d0d0f0", letterSpacing: 1 }}>PLATINUM</span>
            <PokemonCard
              name="Plata Storm"
              country="Netherlands"
              city="Amsterdam"
              startYear={2013}
              hand="RIGHT"
              photoPath="/uploads/AddvmWVW.jpeg"
              metalBorder="platinum"
              badges={[
                "first_blood", "hat_trick", "sniper", "goal_machine", "century_club", "champion", "back_to_back",
                "team_player", "squad_up", "veteran", "road_warrior", "globe_trotter",
                "host", "serial_organizer",
                "welcome", "og", "regular", "addict", "profile_complete", "say_cheese", "captain", "chatterbox", "collector"
              ]}
            />
          </div>

          {/* Diamond */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 13, background: "linear-gradient(90deg,#ff0080,#ffd700,#00ffff,#8000ff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", letterSpacing: 1 }}>DIAMOND</span>
            <PokemonCard
              name="Diamond Rex"
              country="Japan"
              city="Tokyo"
              startYear={2011}
              hand="LEFT"
              photoPath="/uploads/NN-4CYaU.jpeg"
              metalBorder="diamond"
              theme="holofoil"
              badges={[
                "first_blood", "hat_trick", "sniper", "goal_machine", "century_club", "champion", "back_to_back", "unbeaten", "clean_ride", "hard_edge",
                "team_player", "squad_up", "veteran", "road_warrior", "globe_trotter", "loyal_rider",
                "host", "serial_organizer", "mega_event",
                "welcome", "og", "regular", "addict", "profile_complete", "say_cheese", "captain", "chatterbox", "hype_machine", "night_owl", "free_agent", "collector"
              ]}
            />
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          SECTION 6 — Effets expérimentaux
          ═══════════════════════════════════════════════════════ */}
      <section style={{ marginBottom: 80 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>🧪 Effets expérimentaux</h2>
        <p style={{ color: "#aaa", marginBottom: 32 }}>
          4 variantes WebGL (sur photo, cartes légendaires) + 3 effets CSS (toute la carte).
        </p>

        {/* ── WebGL photo variants ── */}
        <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 20, color: "#e8c96a" }}>
          ✨ Variantes holographiques WebGL — cartes légendaires
        </h3>
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap", marginBottom: 52 }}>
          {/* Glitter (default) */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 13, color: "#bbb", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>Paillettes</span>
            <PokemonCard {...PLAYERS.legend} holoVariant="glitter" />
            <span style={{ fontSize: 12, color: "#888", maxWidth: 200, textAlign: "center" }}>Micro-paillettes denses + bandes holo au survol</span>
          </div>
          {/* Iris */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 13, color: "#bbb", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>Iris prismatique</span>
            <PokemonCard {...PLAYERS.legend} holoVariant="iris" />
            <span style={{ fontSize: 12, color: "#888", maxWidth: 200, textAlign: "center" }}>Anneaux arc-en-ciel centrés sur le curseur</span>
          </div>
          {/* Constellation */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 13, color: "#bbb", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>Constellation</span>
            <PokemonCard {...PLAYERS.legend} holoVariant="constellation" />
            <span style={{ fontSize: 12, color: "#888", maxWidth: 200, textAlign: "center" }}>Étoiles bleu-blanc avec flares en croix et parallaxe</span>
          </div>
          {/* Chromatic */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 13, color: "#bbb", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>Aberration chromatique</span>
            <PokemonCard {...PLAYERS.legend} holoVariant="chromatic" />
            <span style={{ fontSize: 12, color: "#888", maxWidth: 200, textAlign: "center" }}>Décalage R/G/B amplifié par l'inclinaison</span>
          </div>
        </div>

        {/* ── WebGL full-card NEW ── */}
        <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8, color: "#ff6b6b" }}>
          🔥 WebGL Toute la Carte — Nouveaux Effets
        </h3>
        <p style={{ color: "#aaa", marginBottom: 28, fontSize: 13 }}>
          Le shader recouvre la carte entière en alpha — survole pour l'activer à fond.
        </p>

        {/* PLASMA */}
        <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: "#c77dff", letterSpacing: "0.08em", textTransform: "uppercase" }}>Plasma — vagues organiques psychédéliques</h4>
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap", marginBottom: 36 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <PokemonCard {...PLAYERS.legend} holoFull="plasma" />
            <span style={{ fontSize: 11, color: "#888" }}>Legend · classic</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <PokemonCard {...PLAYERS.legend} variant="fullart" holoFull="plasma" />
            <span style={{ fontSize: 11, color: "#888" }}>Legend · full art</span>
          </div>
        </div>

        {/* SEQUIN */}
        <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: "#f9c8ff", letterSpacing: "0.08em", textTransform: "uppercase" }}>Sequin — paillettes disc miroir</h4>
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap", marginBottom: 36 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <PokemonCard {...PLAYERS.legend} holoFull="sequin" />
            <span style={{ fontSize: 11, color: "#888" }}>Legend · classic</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <PokemonCard {...PLAYERS.legend} variant="fullart" holoFull="sequin" />
            <span style={{ fontSize: 11, color: "#888" }}>Legend · full art</span>
          </div>
        </div>

        {/* AURORA */}
        <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: "#a0e9a0", letterSpacing: "0.08em", textTransform: "uppercase" }}>Aurora — aurore boréale ondulante</h4>
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap", marginBottom: 52 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <PokemonCard {...PLAYERS.legend} holoFull="aurora" />
            <span style={{ fontSize: 11, color: "#888" }}>Legend · classic</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <PokemonCard {...PLAYERS.legend} variant="fullart" holoFull="aurora" />
            <span style={{ fontSize: 11, color: "#888" }}>Legend · full art</span>
          </div>
        </div>

        {/* ── CSS effects ── */}
        <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 20, color: "#7fc4e8" }}>
          🎨 Effets CSS — toute la carte
        </h3>
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
          {/* Foil */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 13, color: "#bbb", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>Foil métallique</span>
            <PokemonCard {...PLAYERS.veteran} cardFx="foil" />
            <span style={{ fontSize: 12, color: "#888", maxWidth: 200, textAlign: "center" }}>Balayage métallique animé sur la carte entière</span>
          </div>
          {/* Glow */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 13, color: "#bbb", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>Glow pulsé</span>
            <PokemonCard {...PLAYERS.veteran} cardFx="glow" />
            <span style={{ fontSize: 12, color: "#888", maxWidth: 200, textAlign: "center" }}>Halo cyan-bleu qui pulse autour de la carte</span>
          </div>
          {/* Glow champ */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", background: "linear-gradient(90deg,#0033a0,#c60c30,#333,#ffd200,#00a651)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Glow Champion</span>
            <PokemonCard {...PLAYERS.veteran} cardFx="glow-champ" />
            <span style={{ fontSize: 12, color: "#888", maxWidth: 200, textAlign: "center" }}>Halo arc-en-ciel UCI — bleu · rouge · noir · jaune · vert</span>
          </div>
          {/* Scanlines */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 13, color: "#bbb", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>Scanlines rétro</span>
            <PokemonCard {...PLAYERS.veteran} cardFx="scanlines" />
            <span style={{ fontSize: 12, color: "#888", maxWidth: 200, textAlign: "center" }}>Lignes CRT horizontales sur toute la surface</span>
          </div>
        </div>
      </section>
    </div>
  );
}
