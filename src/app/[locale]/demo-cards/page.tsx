"use client";

import { PokemonCard } from "@/components/PokemonCard";
import { ScrollTiltCard } from "@/components/ScrollTiltCard";

/* ── Demo players with realistic data ── */
const PLAYERS = {
  rookie: {
    name: "Alex Newbie",
    country: "France",
    city: "Lyon",
    startYear: 2025,
    hand: "RIGHT" as const,
    badges: ["welcome"],
    photoPath: "/demo/face2.jpg",
  },
  rising: {
    name: "Sam Roller",
    country: "Germany",
    city: "Berlin",
    startYear: 2024,
    hand: "LEFT" as const,
    badges: ["team_player", "welcome", "say_cheese", "first_blood"],
    photoPath: "/demo/face3.jpg",
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
    photoPath: "/demo/face4.jpg",
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
    photoPath: "/demo/face5.jpg",
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
    photoPath: "/demo/face6.jpg",
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
    photoPath: "/demo/face7.jpg",
  },
};

const TIERS = [
  { key: "rookie",  tier: "UNCOMMON",  color: "#60c9cf", stars: "\u2605",       desc: "2+ badges",             holoVariant: undefined,  holoFull: undefined,       cardFx: undefined,      metalBorder: undefined  },
  { key: "rising",  tier: "RARE",      color: "#ffa2af", stars: "\u2605\u2605",     desc: "6+ dont 3 rares",       holoVariant: "glitter",  holoFull: undefined,       cardFx: undefined,      metalBorder: undefined  },
  { key: "solid",   tier: "EPIC",      color: "#a855f7", stars: "\u2605\u2605\u2605",   desc: "12+ dont 4 epiques",    holoVariant: "iris",     holoFull: undefined,       cardFx: "scanlines",    metalBorder: undefined  },
  { key: "veteran", tier: "MYTHIC",    color: "#c77dff", stars: "\u2605\u2605\u2605\u2605",  desc: "24+ dont 5 mythiques",  holoVariant: undefined,  holoFull: "aurora",        cardFx: "foil",         metalBorder: "platinum" },
  { key: "legend",  tier: "LEGENDARY", color: "#fffc8a", stars: "\u2605\u2605\u2605\u2605\u2605", desc: "35+ dont 4 legendaires", holoVariant: undefined, holoFull: "constellation", cardFx: "glow-champ",   metalBorder: "diamond"  },
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
    <div style={{ background: "var(--bg)", minHeight: "100vh" }}>
      <div style={PAGE}>

        {/* Hero */}
        <div style={{ textAlign: "center", paddingTop: 32, paddingBottom: 48 }}>
          <p style={{ color: "var(--text-muted)", fontFamily: "var(--font-display)", fontSize: 12, letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: 12 }}>
            Systeme de cartes
          </p>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 48, fontWeight: 900, letterSpacing: "0.06em", marginBottom: 16, lineHeight: 1.1 }}>
            POLOPERATOR CARDS
          </h1>
          <p style={{ color: "var(--text-muted)", maxWidth: 500, margin: "0 auto", lineHeight: 1.8, fontSize: 14 }}>
            Chaque badge est une etoile. Ta carte t&apos;appartient.
            Passe ta souris sur une carte.
          </p>
        </div>

        {/* 3 cartes hero flottantes */}
        <div className="demo-wow-stage" style={{ marginBottom: 96 }}>
          <div className="demo-wow-cards-row">
            <div className="demo-wow-item">
              <div className="demo-wow-float" style={{ animationDelay: "0s" }}>
                <div className="demo-wow-scale">
                  <PokemonCard
                    {...PLAYERS.legend}
                    holoFull="aurora"
                    metalBorder="diamond"
                  />
                </div>
              </div>
              <span className="demo-wow-label">Aurora &middot; Diamond</span>
            </div>

            <div className="demo-wow-item">
              <div className="demo-wow-float" style={{ animationDelay: "-1.6s" }}>
                <div className="demo-wow-scale">
                  <PokemonCard
                    {...PLAYERS.mythic}
                    holoFull="plasma"
                    metalBorder="platinum"
                  />
                </div>
              </div>
              <span className="demo-wow-label">Plasma &middot; Platinum</span>
            </div>

            <div className="demo-wow-item">
              <div className="demo-wow-float" style={{ animationDelay: "-3.2s" }}>
                <div className="demo-wow-scale">
                  <PokemonCard
                    {...PLAYERS.veteran}
                    holoFull="sequin"
                    cardFx="glow-champ"
                    metalBorder="gold"
                  />
                </div>
              </div>
              <span className="demo-wow-label">Sequin &middot; Champion</span>
            </div>
          </div>
        </div>

        {/* Les raretes */}
        <section style={SECTION}>
          <h2 style={H2}>Niveaux de rayonnement</h2>
          <p style={MUTED}>
            Plus tu collectes de badges, plus ta carte evolue.
          </p>
          <div style={{ display: "flex", gap: 32, justifyContent: "center", flexWrap: "wrap", alignItems: "flex-end" }}>
            {TIERS.map(({ key, tier, color, stars, desc, holoVariant, holoFull, cardFx, metalBorder }) => (
              <div key={key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                <PokemonCard
                  {...PLAYERS[key as keyof typeof PLAYERS]}
                  holoVariant={holoVariant as any}
                  holoFull={holoFull as any}
                  cardFx={cardFx as any}
                  metalBorder={metalBorder as any}
                />
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color, textTransform: "uppercase" }}>{tier}</div>
                  <div style={{ color, fontSize: 10, opacity: 0.65 }}>{stars} &middot; {desc}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Scroll mobile */}
        <section style={SECTION}>
          <h2 style={H2}>Effet scroll mobile</h2>
          <p style={MUTED}>Sur telephone, la carte s&apos;incline en 3D au fil du scroll.</p>
          <div style={{ display: "flex", gap: 24, justifyContent: "center", flexWrap: "wrap" }}>
            <ScrollTiltCard {...PLAYERS.mythic} />
            <ScrollTiltCard {...PLAYERS.legend} />
          </div>
        </section>

        {/* Berlin */}
        <section style={SECTION}>
          <h2 style={H2}>Berlin Cup — Bauhaus</h2>
          <p style={MUTED}>Blanc casse &middot; noir &middot; rouge &middot; typographie geometrique.</p>
          <div style={{ display: "flex", gap: 24, justifyContent: "center", flexWrap: "wrap" }}>
            <PokemonCard name="Kurt Stahl" country="Germany" city="Berlin" startYear={2019} theme="berlin_bauhaus" photoPath="/demo/face8.jpg" badges={[
              "first_blood","hat_trick","sniper","goal_machine","champion",
              "team_player","squad_up","veteran","road_warrior",
              "host","welcome","og","say_cheese","night_owl","collector",
            ]} />
            <PokemonCard name="Anya Weiss" country="Germany" city="Berlin" startYear={2021} theme="berlin_bauhaus" variant="fullart" photoPath="/demo/face6.jpg" badges={[
              "first_blood","hat_trick","sniper","goal_machine","century_club",
              "champion","back_to_back","unbeaten",
              "team_player","squad_up","veteran","road_warrior","globe_trotter",
              "host","serial_organizer","community_builder",
              "welcome","og","regular","addict","profile_complete","say_cheese",
              "chatterbox","hype_machine","captain","night_owl","collector","completionist",
            ]} />
          </div>
        </section>

        {/* Contours metalliques */}
        <section style={SECTION}>
          <h2 style={H2}>Contours metalliques</h2>
          <p style={MUTED}>5 paliers de rarete — le contour tourne avec son eclat.</p>
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap", justifyContent: "center" }}>
            {[
              { level: "bronze",   color: "#cd7f32", name: "Iron Wolf",   country: "Germany",     city: "Berlin",    year: 2020, photo: "/demo/face1.jpg", badges: ["first_blood","hat_trick","team_player","welcome","profile_complete"] },
              { level: "silver",   color: "#c8c8c8", name: "Silver Fox",  country: "Sweden",      city: "Stockholm", year: 2017, photo: "/demo/face2.jpg", badges: ["first_blood","hat_trick","sniper","team_player","squad_up","veteran","welcome","og","profile_complete"] },
              { level: "gold",     color: "#ffd700", name: "Golden Ace",  country: "France",      city: "Lyon",      year: 2015, photo: "/demo/face3.jpg", badges: ["first_blood","hat_trick","sniper","goal_machine","champion","team_player","squad_up","veteran","road_warrior","host","welcome","og","regular","profile_complete","say_cheese","chatterbox"] },
              { level: "platinum", color: "#d0d0f0", name: "Plata Storm", country: "Netherlands", city: "Amsterdam", year: 2013, photo: "/demo/face4.jpg", badges: ["first_blood","hat_trick","sniper","goal_machine","century_club","champion","back_to_back","team_player","squad_up","veteran","road_warrior","globe_trotter","host","serial_organizer","welcome","og","regular","addict","profile_complete","say_cheese","captain","chatterbox","collector"] },
              { level: "diamond",  color: null,      name: "Diamond Rex", country: "Japan",       city: "Tokyo",     year: 2011, photo: "/demo/face5.jpg", badges: ["first_blood","hat_trick","sniper","goal_machine","century_club","champion","back_to_back","unbeaten","team_player","squad_up","veteran","road_warrior","globe_trotter","loyal_rider","host","serial_organizer","welcome","og","regular","addict","profile_complete","say_cheese","captain","chatterbox","hype_machine","night_owl","collector"] },
            ].map(({ level, color, name, country, city, year, photo, badges }) => (
              <div key={level} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                {color
                  ? <span style={{ fontFamily: "var(--font-display)", fontSize: 11, color, letterSpacing: "0.12em", textTransform: "uppercase" }}>{level.toUpperCase()}</span>
                  : <span style={{ fontFamily: "var(--font-display)", fontSize: 11, background: "linear-gradient(90deg,#ff0080,#ffd700,#00ffff,#8000ff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", letterSpacing: "0.12em" }}>DIAMOND</span>
                }
                <PokemonCard name={name} country={country} city={city} startYear={year} photoPath={photo}
                  metalBorder={level as any} badges={badges} />
              </div>
            ))}
          </div>
        </section>

        {/* Effets WebGL & CSS */}
        <section style={SECTION}>
          <h2 style={H2}>Effets WebGL & CSS</h2>
          <p style={MUTED}>Survole pour les activer a fond.</p>

          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 13, marginBottom: 24, textAlign: "center", color: "#80d4ff", letterSpacing: "0.15em", textTransform: "uppercase" }}>Sur la photo</h3>
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap", marginBottom: 56, justifyContent: "center" }}>
            {[
              { id: "glitter",   label: "Paillettes",  color: "#ffe080" },
              { id: "iris",      label: "Iris",         color: "#ff8fc8" },
              { id: "chromatic", label: "Chromatique",  color: "#80ffcc" },
            ].map(({ id, label, color }) => (
              <div key={id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                <span style={{ fontFamily: "var(--font-display)", fontSize: 11, color, letterSpacing: "0.15em", textTransform: "uppercase" }}>{label}</span>
                <PokemonCard {...PLAYERS.legend} holoVariant={id as any} />
              </div>
            ))}
          </div>

          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 13, marginBottom: 24, textAlign: "center", color: "#ff6b6b", letterSpacing: "0.15em", textTransform: "uppercase" }}>Toute la carte</h3>
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap", marginBottom: 56, justifyContent: "center" }}>
            {[
              { id: "plasma",  label: "Plasma",  color: "#c77dff" },
              { id: "sequin",  label: "Sequin",  color: "#f9c8ff" },
              { id: "aurora",  label: "Aurora",   color: "#a0e9a0" },
            ].map(({ id, label, color }) => (
              <div key={id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                <span style={{ fontFamily: "var(--font-display)", fontSize: 11, color, letterSpacing: "0.15em", textTransform: "uppercase" }}>{label}</span>
                <PokemonCard {...PLAYERS.legend} holoFull={id as any} />
              </div>
            ))}
          </div>

          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 13, marginBottom: 24, textAlign: "center", color: "#7fc4e8", letterSpacing: "0.15em", textTransform: "uppercase" }}>Effets CSS</h3>
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap", justifyContent: "center" }}>
            {[
              { fx: "foil"       as const, label: "Foil",      color: "#c8c8c8" },
              { fx: "glow"       as const, label: "Glow",      color: "#80e8ff" },
              { fx: "glow-champ" as const, label: "Champion",  color: null      },
              { fx: "scanlines"  as const, label: "Scanlines", color: "#8080a0" },
            ].map(({ fx, label, color }) => (
              <div key={fx} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                {color
                  ? <span style={{ fontFamily: "var(--font-display)", fontSize: 11, color, letterSpacing: "0.15em", textTransform: "uppercase" }}>{label}</span>
                  : <span style={{ fontFamily: "var(--font-display)", fontSize: 11, background: "linear-gradient(90deg,#0033a0,#c60c30,#333,#ffd200,#00a651)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", letterSpacing: "0.15em", textTransform: "uppercase" as const }}>{label}</span>
                }
                <PokemonCard {...PLAYERS.veteran} cardFx={fx} />
              </div>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
