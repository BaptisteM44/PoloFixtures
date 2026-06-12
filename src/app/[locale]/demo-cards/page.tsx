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
    photoPath: "/uploads/AddvmWVW.jpeg",
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
  { key: "rookie",  tier: "UNCOMMON",  color: "#60c9cf", stars: "★",     desc: "2+ badges",           holoVariant: undefined,       holoFull: undefined,    cardFx: undefined,       metalBorder: undefined    },
  { key: "rising",  tier: "RARE",      color: "#ffa2af", stars: "★★",    desc: "6+ dont 3 rares",      holoVariant: "glitter",       holoFull: undefined,    cardFx: undefined,       metalBorder: undefined    },
  { key: "solid",   tier: "EPIC",      color: "#a855f7", stars: "★★★",   desc: "12+ dont 4 épiques",   holoVariant: "iris",          holoFull: undefined,    cardFx: "scanlines",     metalBorder: undefined    },
  { key: "veteran", tier: "MYTHIC",    color: "#c77dff", stars: "★★★★",  desc: "24+ dont 5 mythiques", holoVariant: undefined,       holoFull: "aurora",     cardFx: "foil",          metalBorder: "platinum"   },
  { key: "legend",  tier: "LEGENDARY", color: "#fffc8a", stars: "★★★★★", desc: "35+ dont 4 légendaires", holoVariant: undefined,     holoFull: "constellation", cardFx: "glow-champ", metalBorder: "diamond"   },
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

        {/* ══════════════════════════════════════════════
            WOW — plein fond nébuleuse, 3 cartes flottantes
            ══════════════════════════════════════════════ */}
        <div style={{ textAlign: "center", paddingTop: 32, paddingBottom: 48 }}>
          <p style={{ color: "#4a5888", fontFamily: "var(--font-display)", fontSize: 12, letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: 12 }}>
            Système de cartes
          </p>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 48, fontWeight: 900, letterSpacing: "0.06em", background: "linear-gradient(130deg, #c8d4ff 0%, #80d4ff 45%, #e0b8ff 80%, #ffffff 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: 16, lineHeight: 1.1 }}>
            CONSTELLATION
          </h1>
          <p style={{ color: "#5a6888", maxWidth: 500, margin: "0 auto", lineHeight: 1.8, fontSize: 14 }}>
            Chaque badge est une étoile. Ta carte t&apos;appartient.
            Passe ta souris sur une carte.
          </p>
        </div>

        <div className="demo-wow-stage" style={{ marginBottom: 96 }}>
          <div className="demo-wow-cards-row">

            {/* Carte 1 — Constellation toute la carte */}
            <div className="demo-wow-item">
              <div className="demo-wow-float" style={{ animationDelay: "0s" }}>
                <div className="demo-wow-scale">
                  <PokemonCard
                    {...PLAYERS.legend}
                    theme="midnight"
                    holoFull="constellation"
                    metalBorder="platinum"
                  />
                </div>
              </div>
              <span className="demo-wow-label">Constellation · Platinum</span>
            </div>

            {/* Carte 2 — Aurora + Champion glow */}
            <div className="demo-wow-item">
              <div className="demo-wow-float" style={{ animationDelay: "-1.6s" }}>
                <div className="demo-wow-scale">
                  <PokemonCard
                    {...PLAYERS.legend}
                    theme="midnight"
                    holoFull="aurora"
                    metalBorder="diamond"
                  />
                </div>
              </div>
              <span className="demo-wow-label">Aurora · Diamond</span>
            </div>

            {/* Carte 3 — Sequin + glow-champ */}
            <div className="demo-wow-item">
              <div className="demo-wow-float" style={{ animationDelay: "-3.2s" }}>
                <div className="demo-wow-scale">
                  <PokemonCard
                    {...PLAYERS.legend}
                    theme="midnight"
                    holoFull="sequin"
                    cardFx="glow-champ"
                  />
                </div>
              </div>
              <span className="demo-wow-label">Sequin · Champion</span>
            </div>

          </div>
        </div>

        {/* Les raretés */}
        <section style={SECTION}>
          <h2 style={H2}>Niveaux de rayonnement</h2>
          <p style={MUTED}>
            Plus tu collectes de badges, plus ta carte évolue.
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
                  <div style={{ color, fontSize: 10, opacity: 0.65 }}>{stars} · {desc}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Scroll mobile */}
        <section style={SECTION}>
          <h2 style={H2}>📱 Effet scroll mobile</h2>
          <p style={MUTED}>Sur téléphone, la carte s&apos;incline en 3D au fil du scroll.</p>
          <div style={{ display: "flex", gap: 24, justifyContent: "center", flexWrap: "wrap" }}>
            <ScrollTiltCard {...PLAYERS.mythic} />
            <ScrollTiltCard {...PLAYERS.legend} />
          </div>
        </section>

        {/* Berlin */}
        <section style={SECTION}>
          <h2 style={H2}>🐻 Berlin Cup — Bauhaus</h2>
          <p style={MUTED}>Blanc cassé · noir · rouge · typographie géométrique.</p>
          <div style={{ display: "flex", gap: 24, justifyContent: "center", flexWrap: "wrap" }}>
            <PokemonCard name="Kurt Stahl" country="Germany" city="Berlin" startYear={2019} theme="berlin_bauhaus" photoPath="/uploads/NN-4CYaU.jpeg" badges={[
              "first_blood","hat_trick","sniper","goal_machine","champion",
              "team_player","squad_up","veteran","road_warrior",
              "host","welcome","og","say_cheese","night_owl","collector",
            ]} />
            <PokemonCard name="Anya Weiss" country="Germany" city="Berlin" startYear={2021} theme="berlin_bauhaus" variant="fullart" photoPath="/uploads/AddvmWVW.jpeg" badges={[
              "first_blood","hat_trick","sniper","goal_machine","century_club",
              "champion","back_to_back","unbeaten",
              "team_player","squad_up","veteran","road_warrior","globe_trotter",
              "host","serial_organizer","community_builder",
              "welcome","og","regular","addict","profile_complete","say_cheese",
              "chatterbox","hype_machine","captain","night_owl","collector","completionist",
            ]} />
          </div>
        </section>

        {/* Contours métalliques */}
        <section style={SECTION}>
          <h2 style={H2}>✦ Contours métalliques</h2>
          <p style={MUTED}>5 paliers de rareté — le contour tourne avec son éclat.</p>
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap", justifyContent: "center" }}>
            {[
              { level: "bronze",   color: "#cd7f32", name: "Iron Wolf",   country: "Germany",     city: "Berlin",    year: 2020, photo: "/uploads/NN-4CYaU.jpeg", badges: ["first_blood","hat_trick","team_player","welcome","profile_complete"] },
              { level: "silver",   color: "#c8c8c8", name: "Silver Fox",  country: "Sweden",      city: "Stockholm", year: 2017, photo: "/uploads/AddvmWVW.jpeg", badges: ["first_blood","hat_trick","sniper","team_player","squad_up","veteran","welcome","og","profile_complete"] },
              { level: "gold",     color: "#ffd700", name: "Golden Ace",  country: "France",      city: "Lyon",      year: 2015, photo: "/uploads/NN-4CYaU.jpeg", badges: ["first_blood","hat_trick","sniper","goal_machine","champion","team_player","squad_up","veteran","road_warrior","host","welcome","og","regular","profile_complete","say_cheese","chatterbox"] },
              { level: "platinum", color: "#d0d0f0", name: "Plata Storm", country: "Netherlands", city: "Amsterdam", year: 2013, photo: "/uploads/AddvmWVW.jpeg", badges: ["first_blood","hat_trick","sniper","goal_machine","century_club","champion","back_to_back","team_player","squad_up","veteran","road_warrior","globe_trotter","host","serial_organizer","welcome","og","regular","addict","profile_complete","say_cheese","captain","chatterbox","collector"] },
              { level: "diamond",  color: null,      name: "Diamond Rex", country: "Japan",       city: "Tokyo",     year: 2011, photo: "/uploads/NN-4CYaU.jpeg", badges: ["first_blood","hat_trick","sniper","goal_machine","century_club","champion","back_to_back","unbeaten","team_player","squad_up","veteran","road_warrior","globe_trotter","loyal_rider","host","serial_organizer","welcome","og","regular","addict","profile_complete","say_cheese","captain","chatterbox","hype_machine","night_owl","collector"] },
            ].map(({ level, color, name, country, city, year, photo, badges }) => (
              <div key={level} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                {color
                  ? <span style={{ fontFamily: "var(--font-display)", fontSize: 11, color, letterSpacing: "0.12em", textTransform: "uppercase" }}>{level.toUpperCase()}</span>
                  : <span style={{ fontFamily: "var(--font-display)", fontSize: 11, background: "linear-gradient(90deg,#ff0080,#ffd700,#00ffff,#8000ff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", letterSpacing: "0.12em" }}>DIAMOND</span>
                }
                <PokemonCard name={name} country={country} city={city} startYear={year} photoPath={photo}
                  metalBorder={level as any} theme={level === "diamond" ? "midnight" : undefined} badges={badges} />
              </div>
            ))}
          </div>
        </section>

        {/* Tous les effets */}
        <section style={SECTION}>
          <h2 style={H2}>🌌 Effets WebGL & CSS</h2>
          <p style={MUTED}>Survole pour les activer à fond.</p>

          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 13, marginBottom: 24, textAlign: "center", color: "#80d4ff", letterSpacing: "0.15em", textTransform: "uppercase" }}>Sur la photo</h3>
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap", marginBottom: 56, justifyContent: "center" }}>
            {[
              { id: "constellation", label: "Constellation", color: "#80d4ff" },
              { id: "glitter",       label: "Paillettes",    color: "#ffe080" },
              { id: "iris",          label: "Iris",          color: "#ff8fc8" },
              { id: "chromatic",     label: "Chromatique",   color: "#80ffcc" },
            ].map(({ id, label, color }) => (
              <div key={id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                <span style={{ fontFamily: "var(--font-display)", fontSize: 11, color, letterSpacing: "0.15em", textTransform: "uppercase" }}>{label}</span>
                <PokemonCard {...PLAYERS.legend} theme="midnight" holoVariant={id as any} />
              </div>
            ))}
          </div>

          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 13, marginBottom: 24, textAlign: "center", color: "#ff6b6b", letterSpacing: "0.15em", textTransform: "uppercase" }}>Toute la carte</h3>
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap", marginBottom: 56, justifyContent: "center" }}>
            {[
              { id: "constellation", label: "Constellation", color: "#80d4ff" },
              { id: "plasma",        label: "Plasma",        color: "#c77dff" },
              { id: "sequin",        label: "Sequin",        color: "#f9c8ff" },
              { id: "aurora",        label: "Aurora",        color: "#a0e9a0" },
            ].map(({ id, label, color }) => (
              <div key={id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                <span style={{ fontFamily: "var(--font-display)", fontSize: 11, color, letterSpacing: "0.15em", textTransform: "uppercase" }}>{label}</span>
                <PokemonCard {...PLAYERS.legend} theme="midnight" holoFull={id as any} />
              </div>
            ))}
          </div>

          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 13, marginBottom: 24, textAlign: "center", color: "#7fc4e8", letterSpacing: "0.15em", textTransform: "uppercase" }}>Effets CSS</h3>
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap", justifyContent: "center" }}>
            {[
              { fx: "foil"       as const, label: "Foil",        color: "#c8c8c8" },
              { fx: "glow"       as const, label: "Glow",        color: "#80e8ff" },
              { fx: "glow-champ" as const, label: "Champion",    color: null      },
              { fx: "scanlines"  as const, label: "Scanlines",   color: "#8080a0" },
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

        {/* ══ Portraits fictifs ══ */}
        <section style={SECTION}>
          <h2 style={H2}>🎭 Portraits fictifs</h2>
          <p style={MUTED}>
            Des joueurs imaginaires venus des 5 continents — pour voir ce que donnent des combos de badges rares.
          </p>

          {/* Ligne 1 */}
          <div style={{ display: "flex", gap: 32, justifyContent: "center", flexWrap: "wrap", marginBottom: 48 }}>

            {/* Zara Quinn — Canada · sniperasse back-to-back */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <PokemonCard
                name="Zara Quinn"
                country="Canada"
                city="Montréal"
                startYear={2019}
                hand="LEFT"
                metalBorder="platinum"
                holoVariant="glitter"
                photoPath="https://live.staticflickr.com/4118/4943204704_ba09002cce_w.jpg"
                badges={[
                  "first_blood", "hat_trick", "sniper", "goal_machine", "century_club",
                  "champion", "back_to_back", "unbeaten", "eruption",
                  "team_player", "squad_up", "veteran", "road_warrior",
                  "host", "welcome", "og", "regular", "addict", "say_cheese",
                  "night_owl", "collector",
                ]}
              />
              <span style={{ fontFamily: "var(--font-display)", fontSize: 10, color: "#1a1a1a", letterSpacing: "0.1em" }}>🇨🇦 Montréal · Platinum</span>
            </div>

            {/* Kwame Asante — Nigeria · grand arbitre golden whistle */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <PokemonCard
                name="Kwame Asante"
                country="Nigeria"
                city="Lagos"
                startYear={2016}
                hand="RIGHT"
                metalBorder="gold"
                cardFx="glow"
                photoPath="https://live.staticflickr.com/4136/4942607039_c46df33fd4_w.jpg"
                badges={[
                  "first_whistle", "full_ref_day", "head_ref", "grand_referee", "golden_whistle",
                  "double_duty", "ref_duty",
                  "veteran", "road_warrior", "globe_trotter", "five_continents",
                  "team_player", "welcome", "og", "regular", "say_cheese", "captain",
                ]}
              />
              <span style={{ fontFamily: "var(--font-display)", fontSize: 10, color: "#7a5800", letterSpacing: "0.1em" }}>🇳🇬 Lagos · Gold · Arbitre mythique</span>
            </div>

            {/* Lena Wolff — République tchèque · community builder */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <PokemonCard
                name="Lena Wolff"
                country="Czech Republic"
                city="Prague"
                startYear={2015}
                hand="RIGHT"
                holoFull="aurora"
                photoPath="https://live.staticflickr.com/4074/4942599437_38da44c5fc_w.jpg"
                badges={[
                  "host", "serial_organizer", "community_builder", "grand_architect",
                  "team_player", "squad_up", "veteran", "road_warrior",
                  "welcome", "og", "regular", "addict", "profile_complete",
                  "say_cheese", "chatterbox", "hype_machine", "captain",
                  "full_year", "completionist",
                ]}
              />
              <span style={{ fontFamily: "var(--font-display)", fontSize: 10, color: "#1a6b40", letterSpacing: "0.1em" }}>🇨🇿 Prague · Aurora</span>
            </div>

          </div>

          {/* Ligne 2 */}
          <div style={{ display: "flex", gap: 32, justifyContent: "center", flexWrap: "wrap" }}>

            {/* Tomás Vargas — Brésil · globe-trotter 5 continents */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <PokemonCard
                name="Tomás Vargas"
                country="Brazil"
                city="São Paulo"
                startYear={2018}
                hand="LEFT"
                holoVariant="iris"
                metalBorder="silver"
                photoPath="https://live.staticflickr.com/4079/4942616777_78291a55d4_w.jpg"
                badges={[
                  "first_blood", "hat_trick", "sniper", "goal_machine",
                  "champion", "team_player", "squad_up", "veteran",
                  "road_warrior", "globe_trotter", "loyal_rider", "five_continents",
                  "host", "welcome", "og", "regular", "say_cheese",
                ]}
              />
              <span style={{ fontFamily: "var(--font-display)", fontSize: 10, color: "#c0006a", letterSpacing: "0.1em" }}>🇧🇷 São Paulo · Silver · 5 continents</span>
            </div>

            {/* Priya Dev — Nouvelle-Zélande · fantôme stone cold */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <PokemonCard
                name="Priya Dev"
                country="New Zealand"
                city="Auckland"
                startYear={2014}
                hand="RIGHT"
                holoFull="plasma"
                metalBorder="diamond"
                photoPath="https://live.staticflickr.com/4141/4943199570_3b9eb83475_w.jpg"
                badges={[
                  "first_blood", "hat_trick", "sniper", "goal_machine", "century_club",
                  "champion", "back_to_back", "unbeaten", "stone_cold", "squeaky_clean",
                  "phantom", "night_owl", "eruption", "five_continents", "full_year",
                  "team_player", "squad_up", "veteran", "road_warrior", "globe_trotter", "loyal_rider",
                  "host", "serial_organizer", "community_builder",
                  "welcome", "og", "regular", "addict", "profile_complete",
                  "say_cheese", "chatterbox", "hype_machine", "captain", "collector", "completionist",
                ]}
              />
              <span style={{ fontFamily: "var(--font-display)", fontSize: 10, color: "#1a1a1a", letterSpacing: "0.1em" }}>🇳🇿 Auckland · Diamond · Tout débloqué</span>
            </div>

            {/* Nico Faber — Corée du Sud · capitaine joueur-arbitre */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <PokemonCard
                name="Nico Faber"
                country="South Korea"
                city="Séoul"
                startYear={2020}
                hand="RIGHT"
                cardFx="foil"
                metalBorder="bronze"
                photoPath="https://live.staticflickr.com/4081/4943205720_e439fbacc3_n.jpg"
                badges={[
                  "first_blood", "hat_trick", "sniper",
                  "champion", "team_player", "squad_up", "veteran", "road_warrior",
                  "first_whistle", "full_ref_day", "head_ref", "ref_duty",
                  "host", "welcome", "og", "regular", "say_cheese", "captain",
                  "chatterbox", "collector", "night_owl",
                ]}
              />
              <span style={{ fontFamily: "var(--font-display)", fontSize: 10, color: "#7a3800", letterSpacing: "0.1em" }}>🇰🇷 Séoul · Bronze · Joueur-Arbitre</span>
            </div>

          </div>

          {/* Ligne 3 — Australie, Maroc, Finlande */}
          <div style={{ display: "flex", gap: 32, justifyContent: "center", flexWrap: "wrap", marginTop: 48 }}>

            {/* Ethan Marsh — Australie · rookie prometteur */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <PokemonCard
                name="Ethan Marsh"
                country="Australia"
                city="Melbourne"
                startYear={2023}
                hand="RIGHT"
                photoPath="https://live.staticflickr.com/4081/4905585718_5b7e922ba5_n.jpg"
                badges={[
                  "first_blood", "hat_trick", "welcome", "say_cheese", "profile_complete",
                ]}
              />
              <span style={{ fontFamily: "var(--font-display)", fontSize: 10, color: "#006b80", letterSpacing: "0.1em" }}>🇦🇺 Melbourne · Rookie</span>
            </div>

            {/* Yasmine Oukili — Maroc · organisatrice régionale */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <PokemonCard
                name="Yasmine Oukili"
                country="Morocco"
                city="Casablanca"
                startYear={2017}
                hand="LEFT"
                metalBorder="silver"
                holoVariant="chromatic"
                photoPath="https://live.staticflickr.com/4114/4943203226_870952a06c_n.jpg"
                badges={[
                  "first_blood", "hat_trick", "sniper", "goal_machine",
                  "host", "serial_organizer", "community_builder",
                  "team_player", "squad_up", "veteran", "road_warrior", "globe_trotter",
                  "welcome", "og", "regular", "addict", "captain",
                  "say_cheese", "chatterbox",
                ]}
              />
              <span style={{ fontFamily: "var(--font-display)", fontSize: 10, color: "#006b50", letterSpacing: "0.1em" }}>🇲🇦 Casablanca · Chromatique</span>
            </div>

            {/* Mikael Korhonen — Finlande · addict night owl */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <PokemonCard
                name="Mikael Korhonen"
                country="Finland"
                city="Helsinki"
                startYear={2021}
                hand="LEFT"
                holoFull="sequin"
                photoPath="https://live.staticflickr.com/4141/4943198896_fbe96117f1_n.jpg"
                badges={[
                  "first_blood", "hat_trick", "sniper",
                  "team_player", "squad_up", "veteran", "road_warrior",
                  "first_whistle", "full_ref_day",
                  "welcome", "og", "regular", "addict",
                  "say_cheese", "chatterbox", "night_owl", "collector",
                ]}
              />
              <span style={{ fontFamily: "var(--font-display)", fontSize: 10, color: "#7a008a", letterSpacing: "0.1em" }}>🇫🇮 Helsinki · Sequin</span>
            </div>

          </div>
        </section>

      </div>
    </div>
  );
}

