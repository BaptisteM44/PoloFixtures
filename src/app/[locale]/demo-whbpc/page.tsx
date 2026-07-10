"use client";

/**
 * DEMO — Carte spéciale "WHBPC" (test collection de cartes).
 * Reproduction du template rétro-pop : fond holographique pastel,
 * cadre dégradé bleu→rose, stickers starburst, losange année,
 * drapeau flottant, tilt 3D + glare au hover (comme les PokemonCard).
 * Taille identique aux autres cartes : 340×520.
 *
 * Champs de la carte :
 *  - Teamname (autoscale dès 11 lettres)
 *  - Wheel Size (pouces), Gear Ratio, Hand (RIGHTIE/LEFTIE), Pedals
 *  - Started playing (année, chiffres uniquement)
 *  - Best Skill (sticker droit)
 */

import { useCallback, useId, useRef, useState } from "react";

/* ── Helpers SVG ─────────────────────────────────────────────────── */

/** Points d'une étoile à N branches (starburst). */
function starPoints(cx: number, cy: number, outerR: number, innerR: number, spikes: number, rotation = 0): string {
  const pts: string[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = (Math.PI * i) / spikes + rotation;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(" ");
}

/** Sticker starburst avec ombre décalée + contour noir. */
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
        {/* ombre décalée */}
        <polygon points={starPoints(c + 4, c + 5, outer, inner, spikes, rotation + 0.1)} fill={shadowFill} />
        {/* étoile principale */}
        <polygon points={starPoints(c, c, outer, inner, spikes, rotation)} fill={fill} stroke="#141019" strokeWidth={2.5} strokeLinejoin="round" />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          lineHeight: 1.05,
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** Éclair orange contour rouge. */
function Bolt({ width, style }: { width: number; style?: React.CSSProperties }) {
  return (
    <svg width={width} viewBox="0 0 60 100" style={{ overflow: "visible", ...style }}>
      <polygon
        points="38,2 8,50 24,50 12,98 54,38 32,38 52,2"
        fill="#f6a63b"
        stroke="#d63a2a"
        strokeWidth={5}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Drapeau flottant façon emoji : forme ondulée + ombrage tissu. */
function WavingFlag({ countryCode, width = 54, style }: { countryCode: string; width?: number; style?: React.CSSProperties }) {
  const uid = useId().replace(/[:]/g, "");
  const clipId = `flagclip-${uid}`;
  const shadeId = `flagshade-${uid}`;
  const height = Math.round(width * 0.72);
  return (
    <svg width={width} height={height} viewBox="0 0 64 46" style={{ overflow: "visible", ...style }}>
      <defs>
        {/* Contour ondulé : bord gauche droit (hampe), vagues haut/bas */}
        <clipPath id={clipId}>
          <path d="M3,7 C 17,1 33,11 47,5 C 53,3 59,5 61,9 L 57,37 C 45,43 29,33 15,40 C 9,43 5,40 3,36 Z" />
        </clipPath>
        {/* Ombrage : lumière en haut-gauche, pli sombre en bas-droite */}
        <linearGradient id={shadeId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.72" stopColor="#000" stopOpacity="0.12" />
          <stop offset="1" stopColor="#000" stopOpacity="0.3" />
        </linearGradient>
      </defs>
      {/* Ombre portée du drapeau */}
      <path
        d="M3,7 C 17,1 33,11 47,5 C 53,3 59,5 61,9 L 57,37 C 45,43 29,33 15,40 C 9,43 5,40 3,36 Z"
        transform="translate(2.5,3.5)"
        fill="rgba(0,0,0,0.28)"
      />
      <g clipPath={`url(#${clipId})`}>
        <image href={`https://flagcdn.com/w160/${countryCode}.png`} x="-2" y="-6" width="68" height="58" preserveAspectRatio="none" />
        {/* Pli central léger */}
        <path d="M30,-6 C 26,10 36,28 30,52 L 38,52 C 44,28 34,10 38,-6 Z" fill="rgba(0,0,0,0.07)" />
        <rect x="-2" y="-6" width="68" height="58" fill={`url(#${shadeId})`} />
      </g>
    </svg>
  );
}

/* ── La carte WHBPC ──────────────────────────────────────────────── */

/** Autoscale du nom d'équipe : dès 11 lettres on réduit. */
function getTeamFontSize(name: string): number {
  const len = name.length;
  if (len <= 10) return 27;
  if (len <= 13) return 22;
  if (len <= 16) return 18;
  return 15;
}

export type Hand = "RIGHTIE" | "LEFTIE";

type WhbpcCardProps = {
  title: string;             // nom du tournoi ("WHBPC")
  playerName: string;
  teamName: string;          // autoscale dès 11 lettres
  yearStarted: string;       // année de début (chiffres uniquement)
  countryCode?: string;      // iso2 minuscule pour flagcdn
  bestSkill: string;         // sticker droit ("SMART SHOT", "BALL CONTROL"…)
  pedals: string;            // "CLICK", "CLIPPED IN", "FLAT"…
  hand: Hand;                // droite ou gauche uniquement
  wheelSize: string;         // pouces ("28")
  gearRatio: string;         // "1,7"
  photoUrl?: string | null;
};

function WhbpcCard({
  title,
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

  /* ── Tilt 3D + glare au hover (même mécanique que PokemonCard) ── */
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
    // Reflet inversé : simule une lumière fixe au-dessus de la carte inclinée
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
        // ── Fond holographique pastel (dégradé iridescent) ──
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
      {/* Reflet diagonal statique (léger, toujours visible) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(115deg, transparent 34%, rgba(255,255,255,0.4) 47%, transparent 60%)",
          pointerEvents: "none",
          zIndex: 5,
        }}
      />
      {/* Glare mobile au hover — suit la position inverse de la souris */}
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

      {/* ── Cadre photo : dégradé bleu → rose ── */}
      <div
        style={{
          position: "absolute",
          top: 82,
          left: 22,
          right: 22,
          bottom: 62,
          borderRadius: 8,
          padding: 11,
          background: "linear-gradient(100deg, #2c39a2 0%, #7c2f96 38%, #d92562 68%, #f0338d 100%)",
          zIndex: 1,
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            borderRadius: 3,
            overflow: "hidden",
            background: "#cfe2f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt={playerName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <span style={{ fontSize: 64, fontWeight: 900, color: "#8fb3cc", letterSpacing: "0.05em" }}>{initials}</span>
          )}
        </div>
      </div>

      {/* ── Bandeau titre ── */}
      <div
        style={{
          position: "absolute",
          top: 16,
          left: 18,
          fontSize: 44,
          fontWeight: 900,
          letterSpacing: "0.01em",
          lineHeight: 1,
          background: "linear-gradient(95deg, #5b2ea6 0%, #b3266b 55%, #e8322f 100%)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
          filter: "drop-shadow(2px 3px 0 rgba(90,20,40,0.55))",
          zIndex: 4,
        }}
      >
        {title}
      </div>

      {/* Éclair — chevauche le titre et le cadre */}
      <Bolt width={52} style={{ position: "absolute", top: 6, left: 158, zIndex: 4, transform: "rotate(6deg)" }} />

      {/* Nom du joueur */}
      <div
        style={{
          position: "absolute",
          top: 34,
          left: 210,
          right: 12,
          textAlign: "left",
          fontSize: 13,
          fontWeight: 900,
          letterSpacing: "0.02em",
          color: "#22308f",
          textTransform: "uppercase",
          lineHeight: 1.15,
          zIndex: 4,
        }}
      >
        {playerName}
      </div>

      {/* ── Losange année — bordure dégradé orange (haut-droit) → marine (bas-gauche) ── */}
      <div
        style={{
          position: "absolute",
          top: 133,
          left: 13,
          width: 52,
          height: 52,
          transform: "rotate(45deg)",
          // Élément tourné de 45° : le dégradé local "to top" pointe visuellement
          // vers le coin haut-droit → orange en haut-droit, marine en bas-gauche,
          // transition rougeâtre aux coins gauche/droit (comme l'original).
          background: "linear-gradient(to top, #2c3799 0%, #2c3799 40%, #c23a35 50%, #ef8f2e 60%, #ef8f2e 100%)",
          padding: 3,
          boxShadow: "2px 2px 0 rgba(29,35,80,0.35)",
          display: "flex",
          zIndex: 3,
        }}
      >
        <div style={{ flex: 1, background: "#f4ecd6", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ transform: "rotate(-45deg)", fontSize: 15, fontWeight: 900, color: "#2c39a2" }}>{yearStarted}</span>
        </div>
      </div>

      {/* ── Sticker best skill (droite) ── */}
      <Starburst size={122} spikes={13} rotation={0.25} style={{ position: "absolute", top: 178, right: -4, zIndex: 3 }}>
        <span
          style={{
            fontSize: bestSkill.length > 12 ? 12 : 15,
            fontWeight: 900,
            fontStyle: "italic",
            color: "#f4ecd6",
            transform: "rotate(-7deg)",
            padding: "0 16px",
            textTransform: "uppercase",
            lineHeight: 1.1,
          }}
        >
          {bestSkill}
        </span>
      </Starburst>

      {/* Drapeau flottant */}
      {countryCode && (
        <WavingFlag
          countryCode={countryCode}
          width={54}
          style={{ position: "absolute", top: 316, right: 8, transform: "rotate(-3deg)", zIndex: 3 }}
        />
      )}

      {/* ── Sticker attributs (bas-gauche) : pédales / main / roue ── */}
      <Starburst size={136} spikes={14} rotation={0.1} style={{ position: "absolute", bottom: 16, left: 2, zIndex: 3 }}>
        <div style={{ transform: "rotate(-8deg)", display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
          {attributeLines.map((line, i) => (
            <span
              key={i}
              style={{
                fontSize: line.length > 8 ? 11 : i === attributeLines.length - 1 ? 16 : 14,
                fontWeight: 900,
                fontStyle: "italic",
                color: i % 2 === 0 ? "#f4ecd6" : "#1d2350",
                textTransform: "uppercase",
                lineHeight: 1,
              }}
            >
              {line}
            </span>
          ))}
        </div>
      </Starburst>
      {/* Mini-burst : gear ratio */}
      <Starburst
        size={62}
        spikes={16}
        fill="#273190"
        shadowFill="#161d5e"
        rotation={0.3}
        style={{ position: "absolute", bottom: 6, left: 102, zIndex: 4 }}
      >
        <span style={{ fontSize: 17, fontWeight: 900, color: "#f4ecd6" }}>{gearRatio}</span>
      </Starburst>

      {/* ── Nom d'équipe (bas-droite) — autoscale dès 11 lettres ── */}
      <div
        style={{
          position: "absolute",
          bottom: 16,
          right: 16,
          fontSize: getTeamFontSize(teamName),
          fontWeight: 900,
          letterSpacing: "0.02em",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
          background: "linear-gradient(180deg, #f0483a 0%, #d92c2c 100%)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
          filter: "drop-shadow(2.5px 2.5px 0 #1d2350)",
          zIndex: 4,
        }}
      >
        {teamName}
      </div>
    </div>
  );
}

/* ── Page démo ───────────────────────────────────────────────────── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
      {label}
      {children}
    </label>
  );
}

export default function DemoWhbpcPage() {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [title, setTitle] = useState("WHBPC");
  const [playerName, setPlayerName] = useState("Morvan Baptiste");
  const [teamName, setTeamName] = useState("Didiers");
  const [yearStarted, setYearStarted] = useState("2012");
  const [bestSkill, setBestSkill] = useState("Smart Shot");
  const [pedals, setPedals] = useState("Click");
  const [hand, setHand] = useState<Hand>("RIGHTIE");
  const [wheelSize, setWheelSize] = useState("28");
  const [gearRatio, setGearRatio] = useState("1,7");

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 20px" }}>
        <div style={{ textAlign: "center", paddingBottom: 32 }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 900, letterSpacing: "0.06em", marginBottom: 8 }}>
            DEMO — CARTE WHBPC
          </h1>
          <p style={{ color: "var(--text-muted)", maxWidth: 520, margin: "0 auto", fontSize: 14, lineHeight: 1.7 }}>
            Test de carte spéciale pour la collection. Taille standard 340×520.
            Tous les textes sont modifiables ; le nom d&apos;équipe rétrécit automatiquement dès 11 lettres.
          </p>
        </div>

        <div style={{ display: "flex", gap: 40, alignItems: "flex-start", justifyContent: "center", flexWrap: "wrap" }}>
          <WhbpcCard
            title={title}
            playerName={playerName}
            teamName={teamName}
            yearStarted={yearStarted}
            countryCode="be"
            bestSkill={bestSkill}
            pedals={pedals}
            hand={hand}
            wheelSize={wheelSize}
            gearRatio={gearRatio}
            photoUrl={photoUrl}
          />

          <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 260, paddingTop: 8 }}>
            <Field label="Photo de base">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setPhotoUrl(URL.createObjectURL(f));
                }}
              />
            </Field>
            <Field label="Tournoi">
              <input className="form-input" value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Joueur">
              <input className="form-input" value={playerName} onChange={(e) => setPlayerName(e.target.value)} />
            </Field>
            <Field label="Teamname">
              <input className="form-input" value={teamName} onChange={(e) => setTeamName(e.target.value)} />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Started playing (année)">
                <input
                  className="form-input"
                  inputMode="numeric"
                  value={yearStarted}
                  onChange={(e) => setYearStarted(e.target.value.replace(/\D/g, "").slice(0, 4))}
                />
              </Field>
              <Field label="Hand">
                <select className="form-select" value={hand} onChange={(e) => setHand(e.target.value as Hand)}>
                  <option value="RIGHTIE">Droite (Rightie)</option>
                  <option value="LEFTIE">Gauche (Leftie)</option>
                </select>
              </Field>
              <Field label="Wheel size (pouces)">
                <input
                  className="form-input"
                  inputMode="numeric"
                  value={wheelSize}
                  onChange={(e) => setWheelSize(e.target.value.replace(/\D/g, "").slice(0, 3))}
                />
              </Field>
              <Field label="Gear ratio">
                <input className="form-input" value={gearRatio} onChange={(e) => setGearRatio(e.target.value)} />
              </Field>
            </div>
            <Field label="Pedals (Click / Clipped In / Flat…)">
              <input className="form-input" value={pedals} onChange={(e) => setPedals(e.target.value)} />
            </Field>
            <Field label="Best skill">
              <input className="form-input" value={bestSkill} onChange={(e) => setBestSkill(e.target.value)} />
            </Field>
            <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6, margin: 0 }}>
              À terme : ces champs seront remplis depuis le profil joueur
              (année de début, main) et l&apos;édition du tournoi.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
