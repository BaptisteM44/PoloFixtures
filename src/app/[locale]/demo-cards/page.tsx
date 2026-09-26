"use client";

/**
 * DEMO — Carte bonus "COACH" · tournoi de Bordeaux.
 *
 * Concept : la carte EST la feuille de match du coach, prise sur son
 * clipboard. Pince métallique en haut, photo scotchée façon polaroid,
 * schéma tactique dessiné à l'encre, annotations au marqueur rouge —
 * l'outil iconique du coach qui guide les débutants sans jouer.
 *
 * DA sobre, dans la ligne du site : papier blanc cassé, encre noire,
 * un seul accent (rouge marqueur). Taille standard 340×520.
 */

import { useCallback, useRef, useState } from "react";
import { BADGE_CATALOG, type CardRarity } from "@/lib/badge-catalog";
import { PokemonCard } from "@/components/PokemonCard";

const PAPER = "#faf7f0";
const INK = "#1c1a17";
const MARKER = "#d9482b"; // rouge marqueur du coach
const MUTED = "#8a8377";

/* ── Icône de badge (pixel-art si dispo, sinon emoji) ────────────── */
function BadgeIcon({ id, size = 14 }: { id: string; size?: number }) {
  const info = BADGE_CATALOG[id];
  if (!info) return <span style={{ fontSize: size, lineHeight: 1 }}>🏅</span>;
  return info.iconUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={info.iconUrl} alt={info.name} title={info.name} width={size} height={size} style={{ imageRendering: "pixelated", display: "block" }} />
  ) : (
    <span style={{ fontSize: size, lineHeight: 1 }} title={info.name}>{info.emoji}</span>
  );
}

/* ── Pince métallique du clipboard ───────────────────────────────── */
function ClipboardClip() {
  return (
    <svg width={104} height={34} viewBox="0 0 104 34" style={{ display: "block" }}>
      <defs>
        <linearGradient id="clip-metal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e8e6e1" />
          <stop offset="0.45" stopColor="#b9b6af" />
          <stop offset="0.55" stopColor="#a09d96" />
          <stop offset="1" stopColor="#cfccc5" />
        </linearGradient>
      </defs>
      {/* corps de la pince */}
      <rect x="2" y="6" width="100" height="26" rx="10" fill="url(#clip-metal)" stroke="#7d7a73" strokeWidth="1.5" />
      {/* poignée supérieure */}
      <rect x="34" y="1" width="36" height="12" rx="6" fill="url(#clip-metal)" stroke="#7d7a73" strokeWidth="1.5" />
      {/* fente */}
      <rect x="24" y="16" width="56" height="7" rx="3.5" fill="#f2f0eb" stroke="#8f8c85" strokeWidth="1" />
    </svg>
  );
}

/* ── Schéma tactique : terrain de bike polo à l'encre + passe au marqueur ── */
function TacticalDiagram() {
  return (
    <svg viewBox="0 0 232 104" style={{ width: 232, display: "block", margin: "0 auto" }}>
      {/* terrain (rectangle arrondi comme un court de polo) */}
      <rect x="3" y="3" width="226" height="98" rx="16" fill="none" stroke={INK} strokeWidth="1.8" opacity="0.7" />
      {/* ligne médiane + point central */}
      <line x1="116" y1="3" x2="116" y2="101" stroke={INK} strokeWidth="1.2" strokeDasharray="4 5" opacity="0.45" />
      <circle cx="116" cy="52" r="2.4" fill={INK} opacity="0.5" />
      {/* buts */}
      <rect x="3" y="38" width="5" height="28" fill={INK} opacity="0.55" />
      <rect x="224" y="38" width="5" height="28" fill={INK} opacity="0.55" />

      {/* l'équipe guidée : O */}
      <g fill="none" stroke={INK} strokeWidth="2" opacity="0.8">
        <circle cx="46" cy="68" r="7" />
        <circle cx="92" cy="26" r="7" />
        <circle cx="104" cy="74" r="7" />
      </g>
      {/* adversaires : X */}
      <g stroke={INK} strokeWidth="2" strokeLinecap="round" opacity="0.55">
        <path d="M162 30 l12 12 M174 30 l-12 12" />
        <path d="M186 62 l12 12 M198 62 l-12 12" />
        <path d="M144 76 l12 12 M156 76 l-12 12" />
      </g>

      {/* le plan du coach au marqueur rouge : une passe vers le coéquipier */}
      <g stroke={MARKER} strokeWidth="2.4" fill="none" strokeLinecap="round">
        <path d="M53 62 C 62 44, 72 34, 83 29" strokeDasharray="7 6" />
        <path d="M83 29 l-10 -1 M83 29 l-3 10" />
      </g>
      {/* la balle au pied du passeur */}
      <circle cx="55" cy="74" r="4" fill={MARKER} opacity="0.9" />
    </svg>
  );
}

/* ── La carte ────────────────────────────────────────────────────── */

type CoachSheetCardProps = {
  coachName: string;
  tournament: string;   // « Newbalaya 2026 »
  city: string;         // « Bordeaux »
  collectorNumber: string;
  photoUrl?: string | null;
  badges: string[];
};

function CoachSheetCard({ coachName, tournament, city, collectorNumber, photoUrl, badges }: CoachSheetCardProps) {
  const initials = coachName.split(/\s+/).map((w) => w[0]).join("").slice(0, 3).toUpperCase();

  const cardRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [tiltStyle, setTiltStyle] = useState<React.CSSProperties>({});

  const onMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const r = cardRef.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    setTiltStyle({
      transform: `perspective(700px) rotateX(${(py - 0.5) * -9}deg) rotateY(${(px - 0.5) * 9}deg)`,
      "--glare-pos": `${(1 - px) * 100}% ${(1 - py) * 100}%`,
    } as React.CSSProperties);
  }, []);

  const onLeave = useCallback(() => {
    setHovered(false);
    setTiltStyle({
      transform: "perspective(700px) rotateX(0deg) rotateY(0deg)",
      "--glare-pos": "50% 50%",
    } as React.CSSProperties);
  }, []);

  return (
    <div
      ref={cardRef}
      onMouseMove={onMove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={onLeave}
      style={{
        position: "relative",
        width: 340,
        height: 520,
        borderRadius: 18,
        overflow: "hidden",
        flexShrink: 0,
        cursor: "pointer",
        background: [
          // grain papier très léger
          "repeating-linear-gradient(0deg, rgba(28,26,23,0.018) 0 1px, transparent 1px 3px)",
          `linear-gradient(178deg, #fdfbf6 0%, ${PAPER} 60%, #f3efe4 100%)`,
        ].join(", "),
        border: `2px solid ${INK}`,
        boxShadow: hovered ? "8px 10px 0 rgba(28,26,23,0.16)" : "5px 6px 0 rgba(28,26,23,0.14)",
        fontFamily: "var(--font-display), 'Arial Black', sans-serif",
        userSelect: "none",
        transition: "transform 0.35s cubic-bezier(0.03, 0.98, 0.52, 0.99), box-shadow 0.35s ease",
        willChange: "transform",
        ...tiltStyle,
      }}
    >
      {/* Pince du clipboard */}
      <div style={{ position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)", zIndex: 5 }}>
        <ClipboardClip />
      </div>

      {/* En-tête */}
      <div style={{ position: "absolute", top: 52, left: 0, right: 0, textAlign: "center", zIndex: 2 }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.32em", color: MUTED, textTransform: "uppercase" }}>
          {tournament} · {city}
        </div>
        <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: "0.1em", color: INK, lineHeight: 1.15 }}>
          COACH
        </div>
        {/* trait de marqueur sous le titre */}
        <svg width={120} height={7} viewBox="0 0 120 7" style={{ display: "block", margin: "0 auto" }}>
          <path d="M3 4 C 34 1.5, 82 6, 117 3.2" stroke={MARKER} strokeWidth="3" fill="none" strokeLinecap="round" />
        </svg>
      </div>

      {/* Encart photo — même cadre que la carte classique du site */}
      <div
        style={{
          position: "absolute",
          top: 126,
          left: 26,
          right: 26,
          height: 182,
          border: `2px solid ${INK}`,
          borderRadius: 12,
          overflow: "hidden",
          background: "#eee9dc",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 2,
        }}
      >
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt={coachName} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : (
          <span style={{ fontSize: 50, fontWeight: 900, color: "#b4ac99", letterSpacing: "0.05em" }}>{initials}</span>
        )}
      </div>

      {/* Schéma tactique */}
      <div style={{ position: "absolute", top: 326, left: 22, right: 22, zIndex: 2 }}>
        <TacticalDiagram />
      </div>

      {/* Lignes de formulaire */}
      <div style={{ position: "absolute", top: 436, left: 24, right: 24, zIndex: 2, fontFamily: "var(--font-body, inherit)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, borderBottom: `1.5px dotted ${MUTED}`, paddingBottom: 3 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: MUTED, textTransform: "uppercase", flexShrink: 0 }}>Coach</span>
          <span style={{ fontSize: 15, fontStyle: "italic", fontWeight: 600, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {coachName}
          </span>
          {/* exemplaire entouré au marqueur */}
          <span style={{ marginLeft: "auto", position: "relative", flexShrink: 0, padding: "1px 9px" }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: INK }}>{collectorNumber}</span>
            <svg viewBox="0 0 60 26" style={{ position: "absolute", inset: -3, width: "calc(100% + 6px)", height: "calc(100% + 6px)" }}>
              <ellipse cx="30" cy="13" rx="27" ry="10.5" fill="none" stroke={MARKER} strokeWidth="2" transform="rotate(-3 30 13)" />
            </svg>
          </span>
        </div>
      </div>

      {/* Badges — tampons de la feuille */}
      <div style={{ position: "absolute", bottom: 14, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 8, zIndex: 2 }}>
        {badges.slice(0, 5).map((b) => (
          <span
            key={b}
            style={{
              width: 27,
              height: 27,
              borderRadius: "50%",
              background: "#fff",
              border: `1.5px solid ${INK}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 1px 2px rgba(28,26,23,0.15)",
            }}
          >
            <BadgeIcon id={b} size={14} />
          </span>
        ))}
      </div>

      {/* Glare discret au hover */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(circle at var(--glare-pos, 50% 50%), rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.1) 32%, transparent 55%)",
          opacity: hovered ? 1 : 0,
          transition: "opacity 0.3s ease",
          pointerEvents: "none",
          mixBlendMode: "overlay",
        }}
      />
    </div>
  );
}

/* ── Page démo ───────────────────────────────────────────────────── */

const COACH_BADGES = ["community_builder", "captain", "loyal_rider", "glhf", "welcome"];

const RARITY_ORDER: CardRarity[] = ["common", "uncommon", "rare", "epic", "mythic", "legendary"];

/* ══════════════════════════════════════════════════════════════════════
   ÉVOLUTION DE RARETÉ — appliquée à la VRAIE carte joueur (PokemonCard).

   On ne réinvente pas la carte : on part de l'existante (photo, drapeau,
   club, badges, niveau) et on lui ajoute un TRAITEMENT premium qui monte
   en spectacle à chaque palier — codes classiques de la carte à
   collectionner, jusqu'au holographique foil arc-en-ciel au sommet.

     common     brut       — aucun traitement, la carte nue
     uncommon   liséré      — fin cadre coloré + coin corné (première valeur)
     rare       argent      — cadre métal argenté + léger reflet balayant
     epic       or          — cadre doré gravé + halo chaud + sparkles discrets
     mythic     prisme      — cadre irisé + voile holographique léger permanent
     legendary  foil rainbow — holo arc-en-ciel plein + brillance + aura (le clou)

   Le calque .evc-fx est superposé PAR-DESSUS la vraie carte (position absolute).
   Objectif : prototyper le rendu réel avant de porter dans PokemonCard. */

/* Jeux de badges factices calibrés pour retomber sur chaque palier exact
   (vérifié contre getCardRarity). */
const RARITY_BADGE_SETS: Record<CardRarity, string[]> = {
  common: ["first_blood"],
  uncommon: ["first_blood", "hat_trick"],
  rare: ["tidal_wave", "sniper", "loyal_rider", "first_blood", "hat_trick", "clean_ride"],
  epic: [
    "golden_double", "reverse_sweep", "on_fire", "dragon_slayer",
    "first_blood", "hat_trick", "clean_ride", "hard_edge", "dicey", "team_player", "squad_up", "host",
  ],
  mythic: [
    "comeback_kid", "back_to_back", "globe_trotter", "circus_act", "community_builder",
    "first_blood", "hat_trick", "clean_ride", "hard_edge", "dicey", "team_player", "squad_up", "host",
    "welcome", "bookmarked", "broadcaster", "regular", "free_agent", "chatterbox",
    "early_bird", "pit_stop", "macgyver", "flat_tire", "duct_tape",
  ],
  legendary: [
    "unbeaten", "eruption", "century_club", "five_continents",
    "first_blood", "hat_trick", "clean_ride", "hard_edge", "dicey", "team_player", "squad_up", "host",
    "welcome", "bookmarked", "broadcaster", "regular", "free_agent", "chatterbox",
    "early_bird", "pit_stop", "macgyver", "flat_tire", "duct_tape",
    "tourist", "fashionably_late", "glhf", "afterparty", "schedule_head", "first_whistle", "first_feedback",
    "tidal_wave", "sniper", "loyal_rider", "veteran", "road_warrior",
  ],
};

const TIER_LABEL: Record<CardRarity, string> = {
  common: "Common", uncommon: "Uncommon", rare: "Rare",
  epic: "Epic", mythic: "Mythic", legendary: "Legendary",
};

function EvolvCard({ rarity, name, city, photoUrl }: { rarity: CardRarity; name: string; city: string; photoUrl: string | null }) {
  const badges = RARITY_BADGE_SETS[rarity];
  // On affiche la VRAIE carte en variant "fullart" (photo full-bleed, style
  // alt-art SV) — c'est la base premium qui existe déjà dans le composant.
  // Le calque d'effets cheap est retiré : on juge d'abord cette base nue,
  // puis on affinera la finition par palier de façon SOBRE (foil fin, liseré).
  return (
    <div className="evc-wrap">
      <PokemonCard
        variant="fullart"
        name={name}
        country="France"
        city={city}
        photoPath={photoUrl}
        badges={badges}
        startYear={2018}
      />
    </div>
  );
}

// Piste précédente mise de côté (plus affichée) — conservée pour référence.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function RarityShowcase({ photoUrl }: { photoUrl: string | null }) {
  return (
    <div style={{ margin: "0 auto", padding: "60px 20px 60px", borderTop: "1px dashed var(--border-light, #ddd)", background: "#1a1a20" }}>
      <div style={{ textAlign: "center", paddingBottom: 32 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 900, letterSpacing: "0.04em", marginBottom: 8, color: "#fff" }}>
          ÉVOLUTION DE RARETÉ
        </h2>
        <p style={{ color: "#9a9aaa", maxWidth: 640, margin: "0 auto", fontSize: 14, lineHeight: 1.7 }}>
          La vraie carte joueur en variant « fullart » (photo full-bleed, style
          alt-art). On repart de cette base premium existante — sans effet ajouté
          pour l&apos;instant — pour juger la carte nue avant d&apos;affiner la
          finition par palier, sobrement.
        </p>
      </div>
      <div style={{ display: "flex", gap: 28, flexWrap: "wrap", justifyContent: "center" }}>
        {RARITY_ORDER.map((rarity) => (
          <div key={rarity} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#c8c8d4" }}>
              {TIER_LABEL[rarity]}
            </span>
            <EvolvCard rarity={rarity} name="Baptiste M." city="Bordeaux" photoUrl={photoUrl} />
          </div>
        ))}
      </div>
      <style>{EVOLV_CSS}</style>
    </div>
  );
}

/* ══ CSS du calque d'évolution premium (par-dessus la vraie carte) ══════ */
const EVOLV_CSS = `
.evc-wrap { flex-shrink: 0; }
`;

/* ══════════════════════════════════════════════════════════════════════
   CARTE SAISON — cadeau de fin d'année à tous les utilisateurs.

   Garde les placements de la référence Top Trumps (étiquette en haut, grande
   case photo, bandeau nom en travers, encart texte à gauche, colonne de stats
   à droite, logo en bas) mais parle la langue Poloperator plutôt que celle
   des comics : fond crème du site, contours noirs francs, ombres dures,
   aplats d'accents (jaune / teal / pink / purple), Chakra Petch droit, et un
   terrain de bike polo tracé derrière le joueur. Les stats sont celles de
   la SAISON (c'est un bilan d'année), pas de la carrière. */

type SeasonStat = { label: string; value: string | number };

type SeasonCardProps = {
  season: number;
  name: string;
  country: string;       // code ISO 2 lettres (drapeau)
  city: string;
  clubName?: string | null;
  clubLogoPath?: string | null;
  teamLogoPath?: string | null;
  photoUrl?: string | null;
  bio?: string | null;
  stats: SeasonStat[];
  pinnedBadges: string[];
  stars: number;         // palier de rareté 1–5
  serial: string;        // n° de la carte dans la série de l'année
};

// Fond des cases valeur : les accents du site, en rotation
const STAT_BG = ["var(--yellow, #fffc8a)", "var(--teal, #60c9cf)", "var(--pink, #ffa2af)"];

function seasonNameSize(name: string) {
  const len = name.length;
  if (len <= 12) return 28;
  if (len <= 16) return 23;
  if (len <= 20) return 19;
  return 16;
}

/* Terrain de bike polo vu de dessus, tracé derrière le joueur */
function CourtLines() {
  return (
    <svg className="ssn-court" viewBox="0 0 314 234" preserveAspectRatio="none" aria-hidden>
      <rect x="10" y="12" width="294" height="210" rx="34" fill="none" stroke="#1a1a1a" strokeWidth="2" />
      <line x1="157" y1="12" x2="157" y2="222" stroke="#1a1a1a" strokeWidth="2" />
      <circle cx="157" cy="117" r="22" fill="none" stroke="#1a1a1a" strokeWidth="2" />
      <path d="M10 92 h18 v50 h-18 M304 92 h-18 v50 h18" fill="none" stroke="#1a1a1a" strokeWidth="2" />
    </svg>
  );
}

function SeasonCard({
  season, name, country, city, clubName, clubLogoPath, teamLogoPath,
  photoUrl, bio, stats, pinnedBadges, stars, serial,
}: SeasonCardProps) {
  const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const info = bio?.trim()
    || `Une saison ${season} de plus sur les courts${clubName ? ` avec ${clubName}` : ""}. Merci d'avoir roulé avec nous — on remet ça l'an prochain.`;

  return (
    <div className="ssn">
      {/* Étiquette haut-gauche */}
      <div className="ssn-tag">Saison {season}</div>
      <div className="ssn-serial">N° {serial}</div>

      {/* Case photo, terrain tracé derrière */}
      <div className="ssn-panel">
        <CourtLines />
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt={name} className="ssn-photo" />
        ) : (
          <div className="ssn-photo ssn-photo--empty"><span>{initials}</span></div>
        )}
        <div className="ssn-emblems">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`https://flagcdn.com/w80/${country.toLowerCase()}.png`} alt={country} className="ssn-emblem" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {clubLogoPath && <img src={clubLogoPath} alt={clubName ?? "Club"} className="ssn-emblem" />}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {teamLogoPath && <img src={teamLogoPath} alt="Équipe" className="ssn-emblem" />}
        </div>
      </div>

      {/* Bandeau nom */}
      <div className="ssn-name">
        <span style={{ fontSize: seasonNameSize(name) }}>{name}</span>
      </div>

      {/* Onglet + encart texte */}
      <div className="ssn-info">
        <div className="ssn-info__head">Ta saison</div>
        <p>{info}</p>
        <p className="ssn-info__loc">{city}{clubName ? ` · ${clubName}` : ""}</p>
      </div>

      {/* Badges épinglés */}
      <div className="ssn-badges">
        {pinnedBadges.slice(0, 5).map((b) => (
          <span key={b} className="ssn-badge" title={BADGE_CATALOG[b]?.name ?? b}>
            <BadgeIcon id={b} size={15} />
          </span>
        ))}
      </div>

      {/* Stats de la saison */}
      <div className="ssn-stats">
        {stats.slice(0, 6).map((s, i) => (
          <div key={s.label} className="ssn-stat">
            <span className="ssn-stat__label">{s.label}</span>
            <span className="ssn-stat__value" style={{ background: STAT_BG[i % STAT_BG.length] }}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* Logo Poloperator + rareté */}
      <div className="ssn-logo">
        <span className="ssn-logo__mark"><span className="ssn-logo__dot" />Poloperator</span>
        <span className="ssn-logo__stars">{"★".repeat(stars)}<span style={{ opacity: 0.25 }}>{"★".repeat(5 - stars)}</span></span>
      </div>
    </div>
  );
}

const SEASON_CSS = `
.ssn {
  position: relative; width: 340px; height: 520px; flex-shrink: 0;
  border-radius: 18px; overflow: hidden;
  border: 2.5px solid #1a1a1a;
  box-shadow: 6px 6px 0 #1a1a1a;
  background: var(--bg, #fcfbf5);
  font-family: var(--font-display), sans-serif;
  color: #1a1a1a;
  user-select: none;
}

/* Étiquette + n° de série */
.ssn-tag {
  position: absolute; top: 12px; left: 14px; z-index: 6;
  background: #1a1a1a; color: var(--yellow, #fffc8a);
  padding: 4px 10px; border-radius: 6px;
  font-size: 11px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase;
}
.ssn-serial {
  position: absolute; top: 14px; right: 14px; z-index: 6;
  font-size: 10px; font-weight: 700; letter-spacing: 0.08em; color: #666660;
}

/* Case photo */
.ssn-panel {
  position: absolute; top: 40px; left: 12px; right: 12px; height: 222px;
  border: 2.5px solid #1a1a1a; border-radius: 12px; overflow: hidden;
  background: var(--teal, #60c9cf);
}
.ssn-court { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0.35; }
.ssn-photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 25%; display: block; }
.ssn-photo--empty { display: flex; align-items: center; justify-content: center; }
.ssn-photo--empty span {
  font-size: 76px; font-weight: 900; color: #fff;
  -webkit-text-stroke: 2.5px #1a1a1a; text-shadow: 5px 5px 0 #1a1a1a;
}
.ssn-emblems {
  position: absolute; top: 8px; right: 8px; z-index: 2;
  display: flex; flex-direction: column; gap: 5px;
}
.ssn-emblem {
  width: 28px; height: 28px; border-radius: 50%; object-fit: cover;
  background: #fff; border: 2px solid #1a1a1a;
}

/* Bandeau nom : légèrement incliné, pas de lettrage BD */
.ssn-name {
  position: absolute; top: 236px; left: 20px; right: 20px; height: 48px; z-index: 5;
  display: flex; align-items: center; justify-content: center;
  background: var(--yellow, #fffc8a);
  border: 2.5px solid #1a1a1a; border-radius: 10px;
  box-shadow: 4px 4px 0 #1a1a1a;
  transform: rotate(-2deg);
}
.ssn-name span {
  font-weight: 900; text-transform: uppercase; letter-spacing: 0.03em;
  line-height: 1; white-space: nowrap; max-width: 92%; overflow: hidden; text-overflow: ellipsis;
}

/* Encart texte, façon panel du site avec son en-tête */
.ssn-info {
  position: absolute; top: 298px; left: 12px; width: 124px; bottom: 70px;
  background: #fff; border: 2px solid #1a1a1a; border-radius: 10px; overflow: hidden;
  font-family: var(--font-body), sans-serif;
}
.ssn-info__head {
  background: var(--purple, #c9a8f5); border-bottom: 2px solid #1a1a1a;
  padding: 4px 8px;
  font-family: var(--font-display), sans-serif;
  font-size: 10.5px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase;
}
.ssn-info p { margin: 0; padding: 6px 8px 0; font-size: 10.5px; line-height: 1.4; }
.ssn-info__loc { font-weight: 700; color: #666660; font-size: 10px !important; }

/* Badges épinglés */
.ssn-badges {
  position: absolute; top: 298px; left: 144px; right: 12px; height: 32px;
  display: flex; align-items: center; justify-content: center; gap: 6px;
}
.ssn-badge {
  width: 26px; height: 26px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: #fff; border: 2px solid #1a1a1a; box-shadow: 2px 2px 0 #1a1a1a;
}

/* Stats de la saison : lignes de tableau du site */
.ssn-stats {
  position: absolute; top: 338px; left: 144px; right: 12px; bottom: 12px;
  display: flex; flex-direction: column; justify-content: space-between;
}
.ssn-stat {
  display: flex; align-items: stretch; height: 25px;
  border: 2px solid #1a1a1a; border-radius: 7px; overflow: hidden; background: #fff;
}
.ssn-stat__label {
  flex: 1; min-width: 0; display: flex; align-items: center; padding: 0 8px;
  font-family: var(--font-body), sans-serif; font-size: 11px; font-weight: 600;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ssn-stat__value {
  width: 46px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
  border-left: 2px solid #1a1a1a;
  font-size: 15px; font-weight: 900; font-variant-numeric: tabular-nums;
}

/* Logo Poloperator + rareté */
.ssn-logo {
  position: absolute; left: 12px; bottom: 12px; width: 124px; height: 48px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  border: 2px solid #1a1a1a; border-radius: 10px; background: #fff;
}
.ssn-logo__mark { display: flex; align-items: center; gap: 5px; font-size: 14px; font-weight: 800; }
.ssn-logo__dot { width: 9px; height: 9px; border-radius: 50%; border: 2.5px solid #1a1a1a; }
.ssn-logo__stars { font-size: 10px; letter-spacing: 2px; color: #1a1a1a; }
`;

function ComicShowcase() {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [name, setName] = useState("Baptiste Morvan");
  const [city, setCity] = useState("Brussels");
  const [bio, setBio] = useState("");

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 20px", borderBottom: "1px dashed var(--border-light, #ddd)" }}>
      <div style={{ textAlign: "center", paddingBottom: 28 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 900, letterSpacing: "0.06em", marginBottom: 8 }}>
          DEMO — CARTE SAISON 2026
        </h1>
        <p style={{ color: "var(--text-muted)", maxWidth: 560, margin: "0 auto", fontSize: 14, lineHeight: 1.7 }}>
          La carte cadeau de fin d&apos;année offerte à tous les utilisateurs :
          le bilan de la saison du joueur, sur les placements de la piste
          Top Trumps, à la sauce Poloperator.
        </p>
      </div>

      <div style={{ display: "flex", gap: 40, alignItems: "flex-start", justifyContent: "center", flexWrap: "wrap" }}>
        <SeasonCard
          season={2026}
          serial="0042"
          name={name}
          country="be"
          city={city}
          clubName="Brussels Bike Polo"
          photoUrl={photoUrl}
          bio={bio}
          stars={3}
          pinnedBadges={["eruption", "on_fire", "og", "champion", "first_whistle"]}
          stats={[
            { label: "Tournois", value: 9 },
            { label: "Matchs", value: 48 },
            { label: "Buts", value: 21 },
            { label: "Victoires", value: 27 },
            { label: "Pays", value: 4 },
            { label: "Badges", value: 7 },
          ]}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 240, paddingTop: 8 }}>
          <label style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
            Photo
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setPhotoUrl(URL.createObjectURL(f));
              }}
            />
          </label>
          <label style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
            Nom
            <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
            Ville
            <input className="form-input" value={city} onChange={(e) => setCity(e.target.value)} />
          </label>
          <label style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
            Bio (vide = texte généré)
            <textarea className="form-input" rows={4} value={bio} onChange={(e) => setBio(e.target.value)} />
          </label>
        </div>
      </div>

      <style>{SEASON_CSS}</style>
    </div>
  );
}

export default function DemoCardsPage() {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [coachName, setCoachName] = useState("Morvan Baptiste");
  const [tournament, setTournament] = useState("Newbalaya 2026");
  const [city, setCity] = useState("Bordeaux");
  const [collectorNumber, setCollectorNumber] = useState("01/20");

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh" }}>
      <ComicShowcase />

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 20px" }}>
        <div style={{ textAlign: "center", paddingBottom: 32 }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 900, letterSpacing: "0.06em", marginBottom: 8 }}>
            DEMO — CARTE COACH · BORDEAUX
          </h1>
          <p style={{ color: "var(--text-muted)", maxWidth: 560, margin: "0 auto", fontSize: 14, lineHeight: 1.7 }}>
            La carte est la feuille du coach sur son clipboard : plan tactique
            au marqueur rouge (une passe vers le coéquipier), exemplaire numéroté
            entouré à la main. Sobre — papier, encre, un seul accent.
          </p>
        </div>

        <div style={{ display: "flex", gap: 40, alignItems: "flex-start", justifyContent: "center", flexWrap: "wrap" }}>
          <CoachSheetCard
            coachName={coachName}
            tournament={tournament}
            city={city}
            collectorNumber={collectorNumber}
            photoUrl={photoUrl}
            badges={COACH_BADGES}
          />

          <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 240, paddingTop: 8 }}>
            <label style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
              Photo du coach
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setPhotoUrl(URL.createObjectURL(f));
                }}
              />
            </label>
            <label style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
              Coach
              <input className="form-input" value={coachName} onChange={(e) => setCoachName(e.target.value)} />
            </label>
            <label style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
              Tournoi
              <input className="form-input" value={tournament} onChange={(e) => setTournament(e.target.value)} />
            </label>
            <label style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
              Ville
              <input className="form-input" value={city} onChange={(e) => setCity(e.target.value)} />
            </label>
            <label style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
              Numéro d&apos;exemplaire
              <input className="form-input" value={collectorNumber} onChange={(e) => setCollectorNumber(e.target.value)} />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
