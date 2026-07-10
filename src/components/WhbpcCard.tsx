"use client";

/**
 * Carte souvenir "WHBPC" — édition figée offerte aux participants d'un
 * tournoi passé (hors plateforme). Chaque joueur a ses propres valeurs
 * (voir modèle WhbpcCard). Mise en page dédiée, taille standard 340×520.
 */

import { useCallback, useId, useRef, useState } from "react";

/* ── Helpers SVG ─────────────────────────────────────────────────── */

function starPoints(cx: number, cy: number, outerR: number, innerR: number, spikes: number, rotation = 0): string {
  const pts: string[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = (Math.PI * i) / spikes + rotation;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(" ");
}

function Starburst({
  size,
  spikes = 12,
  fill = "#ec3d8f",
  shadowFill = "#c22d2d",
  rotation = 0,
  children,
  style,
}: {
  size: number;
  spikes?: number;
  fill?: string;
  shadowFill?: string;
  rotation?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const c = size / 2;
  const outer = c - 4;
  const inner = outer * 0.72;
  return (
    <div style={{ position: "relative", width: size, height: size, ...style }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <polygon points={starPoints(c + 4, c + 5, outer, inner, spikes, rotation + 0.1)} fill={shadowFill} />
        <polygon points={starPoints(c, c, outer, inner, spikes, rotation)} fill={fill} stroke="#141019" strokeWidth={2.5} strokeLinejoin="round" />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", lineHeight: 1.05 }}>
        {children}
      </div>
    </div>
  );
}

function Bolt({ width, style }: { width: number; style?: React.CSSProperties }) {
  return (
    <svg width={width} viewBox="0 0 60 100" style={{ overflow: "visible", ...style }}>
      <polygon points="38,2 8,50 24,50 12,98 54,38 32,38 52,2" fill="#f6a63b" stroke="#d63a2a" strokeWidth={5} strokeLinejoin="round" />
    </svg>
  );
}

function WavingFlag({ countryCode, width = 54, style }: { countryCode: string; width?: number; style?: React.CSSProperties }) {
  const uid = useId().replace(/[:]/g, "");
  const clipId = `flagclip-${uid}`;
  const shadeId = `flagshade-${uid}`;
  const height = Math.round(width * 0.72);
  return (
    <svg width={width} height={height} viewBox="0 0 64 46" style={{ overflow: "visible", ...style }}>
      <defs>
        <clipPath id={clipId}>
          <path d="M3,7 C 17,1 33,11 47,5 C 53,3 59,5 61,9 L 57,37 C 45,43 29,33 15,40 C 9,43 5,40 3,36 Z" />
        </clipPath>
        <linearGradient id={shadeId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.72" stopColor="#000" stopOpacity="0.12" />
          <stop offset="1" stopColor="#000" stopOpacity="0.3" />
        </linearGradient>
      </defs>
      <path d="M3,7 C 17,1 33,11 47,5 C 53,3 59,5 61,9 L 57,37 C 45,43 29,33 15,40 C 9,43 5,40 3,36 Z" transform="translate(2.5,3.5)" fill="rgba(0,0,0,0.28)" />
      <g clipPath={`url(#${clipId})`}>
        <image href={`https://flagcdn.com/w160/${countryCode}.png`} x="-2" y="-6" width="68" height="58" preserveAspectRatio="none" />
        <path d="M30,-6 C 26,10 36,28 30,52 L 38,52 C 44,28 34,10 38,-6 Z" fill="rgba(0,0,0,0.07)" />
        <rect x="-2" y="-6" width="68" height="58" fill={`url(#${shadeId})`} />
      </g>
    </svg>
  );
}

function getTeamFontSize(name: string): number {
  const len = name.length;
  if (len <= 10) return 27;
  if (len <= 13) return 22;
  if (len <= 16) return 18;
  return 15;
}

/* ── Carte ────────────────────────────────────────────────────────── */

export type WhbpcCardProps = {
  title?: string;
  playerName: string;
  teamName: string;
  yearStarted: string;
  countryCode?: string;
  bestSkill: string;
  pedals: string;
  hand: "RIGHTIE" | "LEFTIE";
  wheelSize: string;
  gearRatio: string;
  photoUrl?: string | null;
};

export function WhbpcCard({
  title = "WHBPC",
  playerName,
  teamName,
  yearStarted,
  countryCode = "be",
  bestSkill,
  pedals,
  hand,
  wheelSize,
  gearRatio,
  photoUrl,
}: WhbpcCardProps) {
  const initials = playerName.split(/\s+/).map((w) => w[0]).join("").slice(0, 3).toUpperCase();
  const attributeLines = [pedals, hand, `${wheelSize}"`];

  const cardRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [tiltStyle, setTiltStyle] = useState<React.CSSProperties>({});

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    const rotateX = (py - 0.5) * -12;
    const rotateY = (px - 0.5) * 12;
    const gx = (1 - px) * 100;
    const gy = (1 - py) * 100;
    setTiltStyle({
      transform: `perspective(700px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`,
      "--glare-pos": `${gx}% ${gy}%`,
    } as React.CSSProperties);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHovered(false);
    setTiltStyle({
      transform: "perspective(700px) rotateX(0deg) rotateY(0deg)",
      "--glare-pos": "50% 50%",
    } as React.CSSProperties);
  }, []);

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={handleMouseLeave}
      style={{
        position: "relative",
        width: 340,
        height: 520,
        borderRadius: 18,
        overflow: "hidden",
        flexShrink: 0,
        cursor: "pointer",
        background: [
          "radial-gradient(circle at 18% 12%, rgba(255,170,215,0.85), transparent 42%)",
          "radial-gradient(circle at 82% 20%, rgba(165,220,255,0.9), transparent 46%)",
          "radial-gradient(circle at 25% 85%, rgba(175,240,220,0.85), transparent 44%)",
          "radial-gradient(circle at 88% 78%, rgba(255,215,170,0.8), transparent 42%)",
          "linear-gradient(135deg, #ffd7ec 0%, #d7e8ff 28%, #ffeccf 52%, #e6d8ff 76%, #d2f2e9 100%)",
        ].join(", "),
        boxShadow: hovered ? "0 18px 44px rgba(0,0,0,0.3)" : "0 10px 30px rgba(0,0,0,0.18)",
        fontFamily: "var(--font-display), 'Arial Black', sans-serif",
        userSelect: "none",
        transition: "transform 0.35s cubic-bezier(0.03, 0.98, 0.52, 0.99), box-shadow 0.35s ease",
        transformStyle: "preserve-3d",
        willChange: "transform",
        ...tiltStyle,
      }}
    >
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(115deg, transparent 34%, rgba(255,255,255,0.4) 47%, transparent 60%)", pointerEvents: "none", zIndex: 5 }} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(circle at var(--glare-pos, 50% 50%), rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.18) 30%, transparent 58%)",
          opacity: hovered ? 1 : 0,
          transition: "opacity 0.3s ease",
          pointerEvents: "none",
          zIndex: 6,
          mixBlendMode: "overlay",
        }}
      />

      {/* Cadre photo */}
      <div style={{ position: "absolute", top: 82, left: 22, right: 22, bottom: 62, borderRadius: 8, padding: 11, background: "linear-gradient(100deg, #2c39a2 0%, #7c2f96 38%, #d92562 68%, #f0338d 100%)", zIndex: 1 }}>
        <div style={{ width: "100%", height: "100%", borderRadius: 3, overflow: "hidden", background: "#cfe2f0", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt={playerName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <span style={{ fontSize: 64, fontWeight: 900, color: "#8fb3cc", letterSpacing: "0.05em" }}>{initials}</span>
          )}
        </div>
      </div>

      {/* Titre */}
      <div style={{ position: "absolute", top: 16, left: 18, fontSize: 44, fontWeight: 900, letterSpacing: "0.01em", lineHeight: 1, background: "linear-gradient(95deg, #5b2ea6 0%, #b3266b 55%, #e8322f 100%)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", filter: "drop-shadow(2px 3px 0 rgba(90,20,40,0.55))", zIndex: 4 }}>
        {title}
      </div>
      <Bolt width={52} style={{ position: "absolute", top: 6, left: 158, zIndex: 4, transform: "rotate(6deg)" }} />

      {/* Nom joueur */}
      <div style={{ position: "absolute", top: 34, left: 210, right: 12, textAlign: "left", fontSize: 13, fontWeight: 900, letterSpacing: "0.02em", color: "#22308f", textTransform: "uppercase", lineHeight: 1.15, zIndex: 4 }}>
        {playerName}
      </div>

      {/* Losange année */}
      <div style={{ position: "absolute", top: 133, left: 13, width: 52, height: 52, transform: "rotate(45deg)", background: "linear-gradient(to top, #2c3799 0%, #2c3799 40%, #c23a35 50%, #ef8f2e 60%, #ef8f2e 100%)", padding: 3, boxShadow: "2px 2px 0 rgba(29,35,80,0.35)", display: "flex", zIndex: 3 }}>
        <div style={{ flex: 1, background: "#f4ecd6", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ transform: "rotate(-45deg)", fontSize: 15, fontWeight: 900, color: "#2c39a2" }}>{yearStarted}</span>
        </div>
      </div>

      {/* Sticker best skill */}
      <Starburst size={122} spikes={13} rotation={0.25} style={{ position: "absolute", top: 178, right: -4, zIndex: 3 }}>
        <span style={{ fontSize: bestSkill.length > 12 ? 12 : 15, fontWeight: 900, fontStyle: "italic", color: "#f4ecd6", transform: "rotate(-7deg)", padding: "0 16px", textTransform: "uppercase", lineHeight: 1.1 }}>
          {bestSkill}
        </span>
      </Starburst>

      {countryCode && (
        <WavingFlag countryCode={countryCode} width={54} style={{ position: "absolute", top: 316, right: 8, transform: "rotate(-3deg)", zIndex: 3 }} />
      )}

      {/* Sticker attributs */}
      <Starburst size={136} spikes={14} rotation={0.1} style={{ position: "absolute", bottom: 16, left: 2, zIndex: 3 }}>
        <div style={{ transform: "rotate(-8deg)", display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
          {attributeLines.map((line, i) => (
            <span key={i} style={{ fontSize: line.length > 8 ? 11 : i === attributeLines.length - 1 ? 16 : 14, fontWeight: 900, fontStyle: "italic", color: i % 2 === 0 ? "#f4ecd6" : "#1d2350", textTransform: "uppercase", lineHeight: 1 }}>
              {line}
            </span>
          ))}
        </div>
      </Starburst>
      <Starburst size={62} spikes={16} fill="#273190" shadowFill="#161d5e" rotation={0.3} style={{ position: "absolute", bottom: 6, left: 102, zIndex: 4 }}>
        <span style={{ fontSize: 17, fontWeight: 900, color: "#f4ecd6" }}>{gearRatio}</span>
      </Starburst>

      {/* Nom d'équipe */}
      <div style={{ position: "absolute", bottom: 16, right: 16, fontSize: getTeamFontSize(teamName), fontWeight: 900, letterSpacing: "0.02em", textTransform: "uppercase", whiteSpace: "nowrap", background: "linear-gradient(180deg, #f0483a 0%, #d92c2c 100%)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", filter: "drop-shadow(2.5px 2.5px 0 #1d2350)", zIndex: 4 }}>
        {teamName}
      </div>
    </div>
  );
}
