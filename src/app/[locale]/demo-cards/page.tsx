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
import { BADGE_CATALOG } from "@/lib/badge-catalog";

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

export default function DemoCardsPage() {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [coachName, setCoachName] = useState("Morvan Baptiste");
  const [tournament, setTournament] = useState("Newbalaya 2026");
  const [city, setCity] = useState("Bordeaux");
  const [collectorNumber, setCollectorNumber] = useState("01/20");

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh" }}>
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
