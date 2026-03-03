"use client";

import { PokemonCard } from "@/components/PokemonCard";

/* ── Demo players with realistic data ── */
const PLAYERS = {
  rookie: {
    name: "Alex Newbie",
    country: "France",
    city: "Lyon",
    startYear: 2025,
    hand: "RIGHT" as const,
    badges: [] as string[],
    photoPath: "/uploads/AddvmWVW.jpeg",
  },
  rising: {
    name: "Sam Roller",
    country: "Germany",
    city: "Berlin",
    startYear: 2024,
    hand: "LEFT" as const,
    badges: ["team_player", "welcome", "say_cheese"],
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
    badges: ["first_blood", "hat_trick", "sniper", "team_player", "squad_up", "welcome", "say_cheese"],
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
      "host", "welcome", "say_cheese",
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
      "host", "serial_organizer", "community_builder",
      "welcome", "og", "regular", "addict", "profile_complete", "say_cheese",
      "chatterbox", "hype_machine", "captain",
      "night_owl", "collector", "completionist",
    ],
    photoPath: "/uploads/AddvmWVW.jpeg",
  },
};

const TIERS = [
  { key: "rookie", tier: "COMMON", color: "#888", desc: "0 badge — carte sobre, aucun effet holographique." },
  { key: "rising", tier: "UNCOMMON", color: "#60c9cf", desc: "1-4 badges — léger reflet brillant au survol." },
  { key: "solid", tier: "RARE", color: "#ffa2af", desc: "5-9 badges — holo visible avec paillettes sur la photo." },
  { key: "veteran", tier: "EPIC", color: "#a855f7", desc: "10-14 badges — holo intense, diffraction colorée." },
  { key: "legend", tier: "LEGENDARY", color: "#fffc8a", desc: "15+ badges — full holo, paillettes maximum, reflets arc-en-ciel." },
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

      {/* SECTION 0 — Comparaison fonds de carte */}
      <section style={{ marginBottom: 80, borderTop: "2px solid var(--border)", paddingTop: 48 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, marginBottom: 8, textAlign: "center" }}>
          Choix du fond de carte
        </h2>
        <p style={{ color: "var(--text-muted)", marginBottom: 48, textAlign: "center", maxWidth: 580, margin: "0 auto 48px" }}>
          17 fonds disponibles — carte <strong>épique</strong> utilisée ici (pas de WebGL = jamais de conflit).
          Descends pour voir les paillettes holographiques sur les cartes légendaires.
        </p>

        {/* Fonds clairs */}
        <h3 style={{ fontFamily: "var(--font-display)", fontSize: 14, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 24, textAlign: "center" }}>
          ☀️ Fonds clairs
        </h3>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center", alignItems: "flex-start", marginBottom: 48 }}>
          {([
            { t: "default",   label: "Blanc" },
            { t: "ivory",     label: "Ivoire" },
            { t: "cream",     label: "Crème" },
            { t: "pearl",     label: "Perle" },
            { t: "gradient",  label: "Dégradé" },
            { t: "rose",      label: "Rose" },
            { t: "lavender",  label: "Lavande" },
            { t: "sand",      label: "Sable" },
            { t: "mint",      label: "Menthe" },
            { t: "amber",     label: "Ambre" },
          ] as const).map(({ t, label }) => (
            <div key={t} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 10, color: "var(--text-muted)", letterSpacing: 1, textTransform: "uppercase" }}>
                {label}
              </span>
              <PokemonCard {...PLAYERS.veteran} theme={t} />
            </div>
          ))}
        </div>

        {/* Fonds sombres */}
        <h3 style={{ fontFamily: "var(--font-display)", fontSize: 14, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 24, textAlign: "center" }}>
          🌙 Fonds sombres
        </h3>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center", alignItems: "flex-start" }}>
          {([
            { t: "anthracite", label: "Anthracite" },
            { t: "midnight",   label: "Nuit" },
            { t: "forest",     label: "Forêt" },
            { t: "carbon",     label: "Carbone" },
            { t: "teal",       label: "Teal" },
            { t: "burgundy",   label: "Bordeaux" },
            { t: "black",      label: "Noir" },
          ] as const).map(({ t, label }) => (
            <div key={t} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 10, color: "var(--text-muted)", letterSpacing: 1, textTransform: "uppercase" }}>
                {label}
              </span>
              <PokemonCard {...PLAYERS.veteran} theme={t} />
            </div>
          ))}
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

        <h3 style={{ fontFamily: "var(--font-display)", fontSize: 16, marginTop: 48, marginBottom: 24, textAlign: "center", color: "var(--text-muted)" }}>
          Full Art à chaque rareté
        </h3>
        <div style={{ display: "flex", gap: 24, justifyContent: "center", flexWrap: "wrap" }}>
          {TIERS.map(({ key, tier, color }) => {
            const p = PLAYERS[key as keyof typeof PLAYERS];
            return (
              <div key={key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                <PokemonCard {...p} variant="fullart" />
                <TierBadge tier={tier} color={color} />
              </div>
            );
          })}
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

        <h3 style={{ fontFamily: "var(--font-display)", fontSize: 16, marginBottom: 20, textAlign: "center" }}>
          💚 Émeraude
        </h3>
        <div style={{ display: "flex", gap: 24, justifyContent: "center", flexWrap: "wrap", marginBottom: 48 }}>
          <PokemonCard name="Ivy Strike" country="Brazil" city="São Paulo" startYear={2020} hand="RIGHT" theme="green" photoPath="/uploads/AddvmWVW.jpeg" badges={[
            "first_blood", "hat_trick", "sniper", "goal_machine", "champion",
            "team_player", "squad_up", "veteran", "road_warrior",
            "host", "welcome", "say_cheese", "captain", "collector"
          ]} />
          <PokemonCard name="Ivy Strike" country="Brazil" city="São Paulo" startYear={2020} hand="RIGHT" theme="green" variant="fullart" photoPath="/uploads/NN-4CYaU.jpeg" badges={[
            "first_blood", "hat_trick", "sniper", "goal_machine", "champion",
            "team_player", "squad_up", "veteran", "road_warrior",
            "host", "welcome", "say_cheese", "captain", "collector"
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

      {/* SECTION 4 — Tournament mockup */}
      <section style={{ borderTop: "2px solid var(--border)", paddingTop: 48 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, marginBottom: 8, textAlign: "center" }}>
          🏆 Tournoi Démo — Euro Hardcourt 2026
        </h2>
        <p style={{ color: "var(--text-muted)", marginBottom: 40, textAlign: "center" }}>
          3 équipes avec des niveaux différents, comme dans un vrai tournoi.
        </p>

        <h3 style={{ fontFamily: "var(--font-display)", fontSize: 16, marginBottom: 16, color: "var(--teal)" }}>
          Team « Les Pédales Furieuses »
        </h3>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 48 }}>
          <PokemonCard {...PLAYERS.rookie} />
          <PokemonCard {...PLAYERS.rising} />
          <PokemonCard {...PLAYERS.solid} />
        </div>

        <h3 style={{ fontFamily: "var(--font-display)", fontSize: 16, marginBottom: 16, color: "#a855f7" }}>
          Team « Violet Velocity »
        </h3>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 48 }}>
          <PokemonCard {...PLAYERS.veteran} />
          <PokemonCard name="Charlie Venom" country="Italy" city="Milan" startYear={2019} hand="RIGHT" photoPath="/uploads/NN-4CYaU.jpeg" badges={[
            "first_blood", "hat_trick", "sniper", "clean_ride",
            "team_player", "squad_up", "veteran",
            "welcome", "profile_complete", "say_cheese", "chatterbox"
          ]} />
          <PokemonCard name="Pat Thunder" country="France" city="Paris" startYear={2021} hand="LEFT" gender="NON_BINARY" showGender photoPath="/uploads/AddvmWVW.jpeg" badges={[
            "first_blood", "hat_trick", "sniper", "unbeaten", "champion",
            "team_player", "squad_up", "road_warrior",
            "host", "welcome", "say_cheese", "flinta_power", "free_agent"
          ]} />
        </div>

        <h3 style={{ fontFamily: "var(--font-display)", fontSize: 16, marginBottom: 16, color: "#fffc8a" }}>
          Team « Golden Legends » <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 400 }}>— Full Art edition</span>
        </h3>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 48 }}>
          <PokemonCard {...PLAYERS.legend} variant="fullart" />
          <PokemonCard name="Casey Inferno" country="Australia" city="Melbourne" startYear={2016} hand="LEFT" variant="fullart" photoPath="/uploads/NN-4CYaU.jpeg" badges={[
            "first_blood", "hat_trick", "sniper", "goal_machine", "century_club",
            "champion", "back_to_back", "clean_ride",
            "team_player", "squad_up", "veteran", "road_warrior", "globe_trotter",
            "host", "serial_organizer", "mega_event",
            "welcome", "og", "regular", "profile_complete", "say_cheese",
            "captain", "chatterbox", "night_owl", "collector"
          ]} />
          <PokemonCard name="Drew Phantom" country="Japan" city="Tokyo" startYear={2018} hand="RIGHT" variant="fullart" photoPath="/uploads/AddvmWVW.jpeg" badges={[
            "first_blood", "hat_trick", "sniper", "goal_machine",
            "champion", "unbeaten", "hard_edge",
            "team_player", "squad_up", "veteran", "road_warrior", "globe_trotter", "loyal_rider",
            "host", "serial_organizer",
            "welcome", "og", "regular", "addict", "profile_complete", "say_cheese",
            "chatterbox", "hype_machine", "free_agent",
            "early_bird", "collector"
          ]} />
        </div>
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

        {/* ── WebGL variants ── */}
        <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 20, color: "#e8c96a" }}>
          ✨ Variantes holographiques WebGL — cartes légendaires
        </h3>
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap", marginBottom: 52 }}>
          {/* Glitter (default) */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 13, color: "#bbb", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>Paillettes</span>
            <PokemonCard {...PLAYERS.legend} holoVariant="glitter" />
            <span style={{ fontSize: 12, color: "#888", maxWidth: 200, textAlign: "center" }}>Micro-paillettes denses permanentes + bandes holo au survol</span>
          </div>
          {/* Iris */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 13, color: "#bbb", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>Iris prismatique</span>
            <PokemonCard {...PLAYERS.legend} holoVariant="iris" theme="midnight" />
            <span style={{ fontSize: 12, color: "#888", maxWidth: 200, textAlign: "center" }}>Anneaux arc-en-ciel centrés sur le curseur</span>
          </div>
          {/* Constellation */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 13, color: "#bbb", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>Constellation</span>
            <PokemonCard {...PLAYERS.legend} holoVariant="constellation" theme="black" />
            <span style={{ fontSize: 12, color: "#888", maxWidth: 200, textAlign: "center" }}>Étoiles bleu-blanc avec flares en croix et parallaxe</span>
          </div>
          {/* Chromatic */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 13, color: "#bbb", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>Aberration chromatique</span>
            <PokemonCard {...PLAYERS.legend} holoVariant="chromatic" theme="carbon" />
            <span style={{ fontSize: 12, color: "#888", maxWidth: 200, textAlign: "center" }}>Décalage R/G/B amplifié par l'inclinaison</span>
          </div>
        </div>

        {/* ── CSS effects ── */}
        <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 20, color: "#7fc4e8" }}>
          🎨 Effets CSS — toute la carte (non-legendary)
        </h3>
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
          {/* Foil */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 13, color: "#bbb", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>Foil métallique</span>
            <PokemonCard {...PLAYERS.veteran} cardFx="foil" theme="pearl" />
            <span style={{ fontSize: 12, color: "#888", maxWidth: 200, textAlign: "center" }}>Balayage métallique animé sur la carte entière</span>
          </div>
          {/* Glow */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 13, color: "#bbb", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>Glow pulsé</span>
            <PokemonCard {...PLAYERS.veteran} cardFx="glow" theme="midnight" />
            <span style={{ fontSize: 12, color: "#888", maxWidth: 200, textAlign: "center" }}>Halo cyan-bleu qui pulse autour de la carte</span>
          </div>
          {/* Scanlines */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 13, color: "#bbb", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>Scanlines rétro</span>
            <PokemonCard {...PLAYERS.veteran} cardFx="scanlines" theme="carbon" />
            <span style={{ fontSize: 12, color: "#888", maxWidth: 200, textAlign: "center" }}>Lignes CRT horizontales sur toute la surface</span>
          </div>
        </div>
      </section>
    </div>
  );
}
