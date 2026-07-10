"use client";

/**
 * DEMO — cartes spéciales pour la collection.
 *
 * Principe : on garde la vraie PokemonCard du site, mais on lui injecte ici
 * des illustrations SVG sur-mesure dans la zone image pour simuler de vraies
 * cartes "personnage important" type full art / supporter rare.
 */

import { useState } from "react";
import { PokemonCard } from "@/components/PokemonCard";

function getInitials(value: string) {
  return value
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function svgToDataUri(svg: string) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function createCoachArt(kind: "honor" | "tactician" | "aurora", initials: string) {
  if (kind === "honor") {
    return svgToDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 1000">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#f6efe2"/>
            <stop offset="55%" stop-color="#ddd8cf"/>
            <stop offset="100%" stop-color="#b0bbc0"/>
          </linearGradient>
          <radialGradient id="halo" cx="50%" cy="31%" r="42%">
            <stop offset="0%" stop-color="#fff8e8" stop-opacity="0.98"/>
            <stop offset="60%" stop-color="#f0e4c6" stop-opacity="0.72"/>
            <stop offset="100%" stop-color="#f0e4c6" stop-opacity="0"/>
          </radialGradient>
          <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#63d6e1"/>
            <stop offset="100%" stop-color="#1ea5c6"/>
          </linearGradient>
        </defs>
        <rect width="720" height="1000" fill="url(#bg)"/>
        <circle cx="360" cy="280" r="250" fill="url(#halo)"/>
        <path d="M0 758C145 700 245 710 360 788C470 862 566 880 720 840V1000H0Z" fill="#748590" opacity="0.17"/>
        <path d="M0 680C115 650 236 662 360 740C476 810 579 830 720 802V1000H0Z" fill="#ece8e0" opacity="0.68"/>
        <g opacity="0.44" stroke="#9d937f" stroke-width="8" stroke-linecap="round" fill="none">
          <path d="M134 802c-34-23-53-66-53-116 0-76 42-145 109-184"/>
          <path d="M586 802c34-23 53-66 53-116 0-76-42-145-109-184"/>
        </g>
        <g opacity="0.25" fill="#8f8474">
          <circle cx="152" cy="175" r="5"/><circle cx="592" cy="145" r="5"/><circle cx="536" cy="227" r="4"/>
          <circle cx="220" cy="118" r="3"/><circle cx="122" cy="262" r="3"/><circle cx="620" cy="280" r="3"/>
        </g>
        <g transform="translate(171 208)">
          <circle cx="189" cy="95" r="58" fill="#46515b"/>
          <path d="M122 160c28-24 58-39 67-39c10 0 40 15 68 39l31 189H93Z" fill="#55616b"/>
          <path d="M120 175c-58 35-102 98-125 184h83c15-47 32-78 66-121Z" fill="#69757c"/>
          <path d="M258 175c58 35 102 98 125 184h-83c-15-47-32-78-66-121Z" fill="#69757c"/>
          <path d="M170 175c-10 54-40 112-102 159h245c-62-47-92-105-102-159Z" fill="#7d8c94" opacity="0.78"/>
          <rect x="126" y="390" width="126" height="110" rx="18" fill="#505860"/>
          <path d="M122 160c23 33 56 52 67 52c12 0 45-19 68-52" fill="none" stroke="#d2be8d" stroke-width="9" stroke-linecap="round"/>
        </g>
        <g transform="translate(188 545)" stroke="#be9468" stroke-width="8" stroke-linecap="round" fill="none" opacity="0.58">
          <circle cx="66" cy="84" r="18"/>
          <circle cx="258" cy="58" r="18"/>
          <circle cx="170" cy="168" r="18"/>
          <path d="M83 88c42 10 83 6 150-18" stroke-dasharray="11 15"/>
          <path d="M247 75c-7 42-24 72-60 101" stroke-dasharray="11 15"/>
          <path d="M188 176l-31-8m31 8l-10-28"/>
        </g>
        <text x="360" y="215" text-anchor="middle" font-family="Arial, sans-serif" font-size="118" font-weight="800" fill="url(#accent)" opacity="0.82">${initials}</text>
        <text x="360" y="888" text-anchor="middle" font-family="Arial, sans-serif" font-size="36" letter-spacing="12" fill="#6f665a" opacity="0.8">HONOR COACH</text>
      </svg>
    `);
  }

  if (kind === "tactician") {
    return svgToDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 1000">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#08131f"/>
            <stop offset="55%" stop-color="#102436"/>
            <stop offset="100%" stop-color="#04070d"/>
          </linearGradient>
          <radialGradient id="glow" cx="52%" cy="34%" r="42%">
            <stop offset="0%" stop-color="#29d0d3" stop-opacity="0.95"/>
            <stop offset="45%" stop-color="#29d0d3" stop-opacity="0.15"/>
            <stop offset="100%" stop-color="#29d0d3" stop-opacity="0"/>
          </radialGradient>
          <linearGradient id="board" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#1d3648"/>
            <stop offset="100%" stop-color="#0c1c28"/>
          </linearGradient>
        </defs>
        <rect width="720" height="1000" fill="url(#bg)"/>
        <circle cx="380" cy="300" r="230" fill="url(#glow)"/>
        <path d="M0 182h720" stroke="#1d3446" stroke-width="2" opacity="0.35"/>
        <path d="M0 814h720" stroke="#1d3446" stroke-width="2" opacity="0.35"/>
        <g opacity="0.15" stroke="#89f2f0" stroke-width="2">
          <path d="M108 0v1000"/><path d="M216 0v1000"/><path d="M324 0v1000"/><path d="M432 0v1000"/><path d="M540 0v1000"/><path d="M648 0v1000"/>
        </g>
        <g transform="translate(114 170)">
          <rect x="98" y="112" width="320" height="430" rx="30" fill="url(#board)" stroke="#8ac6d8" stroke-width="8"/>
          <rect x="218" y="78" width="80" height="54" rx="18" fill="#ffcc5a"/>
          <circle cx="160" cy="228" r="22" fill="none" stroke="#ffd37a" stroke-width="8"/>
          <circle cx="344" cy="210" r="22" fill="none" stroke="#ffd37a" stroke-width="8"/>
          <circle cx="250" cy="352" r="22" fill="none" stroke="#ffd37a" stroke-width="8"/>
          <path d="M181 235c70 6 104-4 143-30" stroke="#7ff0ef" stroke-width="10" stroke-linecap="round" stroke-dasharray="12 16" fill="none"/>
          <path d="M344 232c-10 55-34 92-78 120" stroke="#ff8b72" stroke-width="10" stroke-linecap="round" stroke-dasharray="12 16" fill="none"/>
          <path d="M268 351l-28-8m28 8l-10-27" stroke="#ff8b72" stroke-width="10" stroke-linecap="round" fill="none"/>
          <path d="M116 430c64-56 124-83 180-83c49 0 90 12 122 31" stroke="#7ff0ef" stroke-width="6" opacity="0.7" fill="none"/>
          <text x="257" y="512" text-anchor="middle" font-family="Arial, sans-serif" font-size="44" letter-spacing="8" fill="#b7f9ff" opacity="0.82">PLAYBOOK</text>
        </g>
        <g transform="translate(176 676)">
          <circle cx="160" cy="48" r="30" fill="#0b1118" stroke="#77d6df" stroke-width="6"/>
          <circle cx="246" cy="48" r="30" fill="#0b1118" stroke="#77d6df" stroke-width="6"/>
          <path d="M196 55c18-44 57-82 115-112" stroke="#ff8b72" stroke-width="8" stroke-linecap="round" fill="none"/>
          <path d="M308 -54l-12 22m12-22l-24-3" stroke="#ff8b72" stroke-width="8" stroke-linecap="round"/>
        </g>
        <text x="360" y="158" text-anchor="middle" font-family="Arial, sans-serif" font-size="104" font-weight="800" fill="#92fbff" opacity="0.82">${initials}</text>
        <text x="360" y="915" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" letter-spacing="10" fill="#77d6df" opacity="0.88">SIDELINE TACTICIAN</text>
      </svg>
    `);
  }

  return svgToDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 1000">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0b1632"/>
          <stop offset="42%" stop-color="#19455f"/>
          <stop offset="74%" stop-color="#2d6c73"/>
          <stop offset="100%" stop-color="#f2c86e"/>
        </linearGradient>
        <radialGradient id="sun" cx="50%" cy="22%" r="40%">
          <stop offset="0%" stop-color="#fff5bb" stop-opacity="0.98"/>
          <stop offset="48%" stop-color="#ffd66c" stop-opacity="0.4"/>
          <stop offset="100%" stop-color="#ffd66c" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="road" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stop-color="#213243"/>
          <stop offset="100%" stop-color="#6bb1b0"/>
        </linearGradient>
      </defs>
      <rect width="720" height="1000" fill="url(#bg)"/>
      <circle cx="360" cy="220" r="240" fill="url(#sun)"/>
      <path d="M0 708C121 654 229 656 360 732C470 795 582 821 720 790V1000H0Z" fill="#192739" opacity="0.45"/>
      <path d="M286 1000h148l-27-327c-7-73-19-138-47-138c-28 0-40 65-47 138Z" fill="url(#road)"/>
      <path d="M336 1000h48V690h-48Z" fill="#f7e1a0" opacity="0.42"/>
      <g opacity="0.32" fill="none" stroke="#8ee8ee" stroke-width="10" stroke-linecap="round">
        <path d="M108 272c58-42 112-58 164-49"/>
        <path d="M448 189c50 14 101 47 153 101"/>
        <path d="M99 394c87-12 165 5 234 50"/>
      </g>
      <g transform="translate(230 426)">
        <circle cx="130" cy="106" r="46" fill="#15212f"/>
        <path d="M74 160c28-26 51-38 56-38c5 0 28 12 56 38l23 164H51Z" fill="#203548"/>
        <path d="M85 176c-29 10-52 28-78 64h53c16-22 29-37 48-49Z" fill="#28475a"/>
        <path d="M175 176c29 10 52 28 78 64h-53c-16-22-29-37-48-49Z" fill="#28475a"/>
        <path d="M138 170c8 34 23 70 68 112H54c45-42 60-78 68-112Z" fill="#31546c" opacity="0.72"/>
      </g>
      <g transform="translate(142 634)" opacity="0.88">
        <circle cx="84" cy="100" r="28" fill="#122032"/>
        <path d="M52 132c15-13 28-20 32-20c4 0 17 7 32 20l14 88H38Z" fill="#1d3448"/>
        <circle cx="352" cy="100" r="28" fill="#122032"/>
        <path d="M320 132c15-13 28-20 32-20c4 0 17 7 32 20l14 88h-92Z" fill="#1d3448"/>
      </g>
      <g opacity="0.44" fill="none" stroke="#ffe29a" stroke-width="7" stroke-linecap="round">
        <path d="M252 738c48-8 100-8 155 0"/>
        <path d="M226 803c66-15 137-18 202-8"/>
      </g>
      <text x="360" y="172" text-anchor="middle" font-family="Arial, sans-serif" font-size="110" font-weight="800" fill="#7de8ef" opacity="0.85">${initials}</text>
      <text x="360" y="910" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" letter-spacing="10" fill="#fff3ca" opacity="0.92">GUIDING STAR</text>
    </svg>
  `);
}

function CoachCornerSeal({ color, label, sublabel }: { color: string; label: string; sublabel: string }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        padding: "8px 12px",
        borderRadius: 18,
        background: "rgba(8, 10, 18, 0.68)",
        border: `1px solid ${color}`,
        boxShadow: `0 12px 24px ${color}26`,
        backdropFilter: "blur(10px)",
        color: "white",
        pointerEvents: "none",
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color }}>
        {label}
      </div>
      <div style={{ fontSize: 10, opacity: 0.82, marginTop: 2 }}>{sublabel}</div>
    </div>
  );
}

function CoachGlyph({ tone, children, style }: { tone: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        position: "absolute",
        right: 14,
        bottom: 90,
        width: 112,
        height: 112,
        borderRadius: 999,
        display: "grid",
        placeItems: "center",
        color: tone,
        background: "radial-gradient(circle, rgba(255,255,255,0.18), rgba(255,255,255,0.02) 72%, transparent 73%)",
        opacity: 0.9,
        pointerEvents: "none",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */

const DEMO_PLAYER = {
  country: "Belgium",
  city: "Brussels",
  clubName: "Brussels Bike Polo",
  startYear: 2012,
};

export default function DemoCardsPage() {
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [name, setName] = useState("Morvan Baptiste");
  const initials = getInitials(name);

  const common = {
    name,
    country: DEMO_PLAYER.country,
    city: DEMO_PLAYER.city,
    clubName: DEMO_PLAYER.clubName,
    startYear: DEMO_PLAYER.startYear,
  };

  const honorArt = photoPath ?? createCoachArt("honor", initials);
  const tacticianArt = photoPath ?? createCoachArt("tactician", initials);
  const auroraArt = photoPath ?? createCoachArt("aurora", initials);

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 20px" }}>
        <div style={{ textAlign: "center", paddingBottom: 28 }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 900, letterSpacing: "0.06em", marginBottom: 8 }}>
            DEMO — CARTES SPÉCIALES
          </h1>
          <p style={{ color: "var(--text-muted)", maxWidth: 560, margin: "0 auto", fontSize: 14, lineHeight: 1.7 }}>
            Trois propositions plus assumées, avec illustrations intégrées et
            badges toujours lisibles comme sur la vraie carte.
          </p>
        </div>

        {/* Contrôles */}
        <div style={{ display: "flex", gap: 16, justifyContent: "center", alignItems: "flex-end", flexWrap: "wrap", paddingBottom: 36 }}>
          <label style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
            Photo de base
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setPhotoPath(URL.createObjectURL(f));
              }}
            />
          </label>
          <label style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
            Joueur / Coach
            <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        </div>

        {/* Les cartes */}
        <div style={{ display: "flex", gap: 40, justifyContent: "center", flexWrap: "wrap" }}>
          {/* 1. Full art honorifique */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <div style={{ position: "relative" }}>
              <PokemonCard
                {...common}
                photoPath={honorArt}
                theme="pearl"
                variant="fullart"
                metalBorder="silver"
                badges={["community_builder", "community_voice", "serial_organizer", "captain", "welcome"]}
                pinnedBadges={["community_builder", "community_voice", "serial_organizer", "captain", "welcome"]}
              >
                <CoachCornerSeal color="#f2c973" label="Full Art" sublabel="Honor Coach" />
                <CoachGlyph tone="#f1ddae" style={{ right: 16, bottom: 156 }}>
                  <svg viewBox="0 0 120 120" width={86} height={86} fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
                    <path d="M30 98c-9-6-14-18-14-31 0-20 11-38 29-48" strokeWidth="4" strokeLinecap="round" />
                    <path d="M90 98c9-6 14-18 14-31 0-20-11-38-29-48" strokeWidth="4" strokeLinecap="round" />
                    <path d="M60 22c0 0 7 12 21 20-10 3-18 9-21 18-3-9-11-15-21-18 14-8 21-20 21-20Z" fill="currentColor" stroke="none" />
                    <circle cx="44" cy="58" r="5" strokeWidth="3" />
                    <circle cx="76" cy="51" r="5" strokeWidth="3" />
                    <circle cx="62" cy="79" r="5" strokeWidth="3" />
                    <path d="M49 60c9 2 16 3 24-1" strokeWidth="3" strokeLinecap="round" strokeDasharray="4 6" />
                    <path d="M73 58c0 8-4 14-9 19" strokeWidth="3" strokeLinecap="round" strokeDasharray="4 6" />
                    <path d="M64 77l-8-1m8 1l-3-8" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                </CoachGlyph>
              </PokemonCard>
            </div>
            <p style={{ fontSize: 12, color: "var(--text-muted)", maxWidth: 320, textAlign: "center", lineHeight: 1.6, margin: 0 }}>
              <strong>Honor Coach.</strong> Une vraie proposition de carte
              personnage: portrait full art, lumière cérémonielle et lecture
              très nette des badges en bas.
            </p>
          </div>

          {/* 2. Tacticien de bord de terrain */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <div style={{ position: "relative" }}>
              <PokemonCard
                {...common}
                photoPath={tacticianArt}
                theme="carbon"
                metalBorder="platinum"
                cardFx="scanlines"
                badges={["serial_organizer", "community_voice", "captain", "hype_machine", "glhf"]}
                pinnedBadges={["serial_organizer", "community_voice", "captain", "hype_machine", "glhf"]}
              >
                <CoachCornerSeal color="#7ff0ef" label="Rare Supporter" sublabel="Sideline Tactician" />
                <CoachGlyph tone="#7ff0ef" style={{ right: 18, bottom: 106 }}>
                  <svg viewBox="0 0 120 120" width={84} height={84} fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
                    <rect x="28" y="18" width="64" height="84" rx="8" strokeWidth="4" />
                    <rect x="48" y="10" width="24" height="14" rx="4" fill="currentColor" stroke="none" />
                    <circle cx="48" cy="48" r="6" strokeWidth="3" />
                    <circle cx="74" cy="42" r="6" strokeWidth="3" />
                    <path d="M55 49c10 2 19 0 27-6" strokeWidth="3" strokeLinecap="round" strokeDasharray="4 6" />
                    <path d="M73 49c0 11-5 20-13 27" strokeWidth="3" strokeLinecap="round" strokeDasharray="4 6" />
                    <path d="M60 76l-8-2m8 2l-3-8" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                </CoachGlyph>
              </PokemonCard>
            </div>
            <p style={{ fontSize: 12, color: "var(--text-muted)", maxWidth: 320, textAlign: "center", lineHeight: 1.6, margin: 0 }}>
              <strong>Sideline Tactician.</strong> Version plus nerveuse, plus
              stratégique, inspirée des cartes de personnages importants avec
              playbook et lignes de jeu dans l'illustration.
            </p>
          </div>

          {/* 3. Mentor rayonnant */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <div style={{ position: "relative" }}>
              <PokemonCard
                {...common}
                photoPath={auroraArt}
                theme="midnight"
                variant="fullart"
                metalBorder="gold"
                holoFull="aurora"
                cardFx="glow"
                badges={["community_builder", "welcome", "broadcaster", "team_player", "bookmarked"]}
                pinnedBadges={["community_builder", "welcome", "broadcaster", "team_player", "bookmarked"]}
              >
                <CoachCornerSeal color="#ffe29a" label="Illustration Rare" sublabel="Guiding Star" />
                <CoachGlyph tone="#ffe29a" style={{ right: 18, bottom: 150 }}>
                  <svg viewBox="0 0 120 120" width={82} height={82} fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
                    <path d="M60 18l9 19 21 3-15 14 4 21-19-10-19 10 4-21-15-14 21-3 9-19Z" fill="currentColor" stroke="none" />
                    <path d="M29 85c8-4 18-7 31-8" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
                    <path d="M91 85c-8-4-18-7-31-8" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
                  </svg>
                </CoachGlyph>
              </PokemonCard>
            </div>
            <p style={{ fontSize: 12, color: "var(--text-muted)", maxWidth: 320, textAlign: "center", lineHeight: 1.6, margin: 0 }}>
              <strong>Guiding Star.</strong> Une carte plus émotionnelle et plus
              rare, avec un vrai souffle full art et une finition lumineuse
              pour l'idée de guider les nouveaux dans la bonne direction.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
