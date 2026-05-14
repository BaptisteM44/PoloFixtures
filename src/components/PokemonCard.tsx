"use client";

import { useRef, useState, useCallback, useImperativeHandle, forwardRef, useEffect } from "react";
import { getBadgeInfo, getCardRarity } from "@/lib/badge-catalog";
import { COUNTRIES } from "@/lib/countries";
import { HoloEffect } from "./HoloEffect";
import { BerlinOverlay } from "./BerlinOverlay";

type Props = {
  name: string;
  country: string;
  city?: string | null;
  photoPath?: string | null;
  clubLogoPath?: string | null;
  teamLogoPath?: string | null;
  badges?: string[];
  pinnedBadges?: string[];
  startYear?: number | null;
  hand?: string | null;
  gender?: "MALE" | "FEMALE" | "NON_BINARY" | "PREFER_NOT_SAY" | null;
  showGender?: boolean;
  theme?: "default" | "black" | "green" | "holofoil" | "ivory" | "cream" | "pearl" | "anthracite" | "gradient"
       | "rose" | "lavender" | "sand" | "mint" | "amber"
       | "midnight" | "forest" | "carbon" | "teal" | "burgundy"
       | "berlin_techno" | "berlin_bauhaus" | "berlin_street" | "berlin_ddr";
  variant?: "classic" | "fullart";
  metalBorder?: "bronze" | "silver" | "gold" | "platinum" | "diamond";
  holoVariant?: "glitter" | "iris" | "constellation" | "chromatic" | "plasma" | "sequin" | "aurora";
  /** @default "constellation" for legendary rarity */
  holoFull?: "glitter" | "iris" | "constellation" | "chromatic" | "plasma" | "sequin" | "aurora";
  cardFx?: "foil" | "glow" | "glow-champ" | "scanlines";
};

/** Scale name font-size to always fit on one line regardless of length */
function getNameFontSize(name: string): number {
  const len = name.length;
  if (len <= 15) return 22;
  if (len <= 20) return 18;
  if (len <= 26) return 15;
  return 13;
}

/** Resolve country name → ISO 2-letter code for flag URL */
function getCountryCode(name: string): string | null {
  const entry = COUNTRIES.find((c) => c.name.toLowerCase() === name.toLowerCase() || c.code.toLowerCase() === name.toLowerCase());
  return entry ? entry.code.toLowerCase() : null;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const PokemonCard = forwardRef<HTMLDivElement, Props>(function PokemonCard({ name, country, city, photoPath, clubLogoPath, teamLogoPath, badges = [], pinnedBadges, startYear, hand: _hand, gender: _gender, showGender: _showGender, theme = "default", variant = "classic", metalBorder, holoVariant, holoFull, cardFx }, externalRef) {
  const cardRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(externalRef, () => cardRef.current!, []);
  const [cardStyle, setCardStyle] = useState<React.CSSProperties>({});
  const [isHovered, setIsHovered] = useState(false);
  const [imgError, setImgError] = useState(false);
  const mousePos = useRef({ x: 0.5, y: 0.5 });
  const rafRef = useRef<number | null>(null);

  // Mobile scroll tilt
  useEffect(() => {
    const isMobile = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    if (!isMobile) return;
    const el = cardRef.current;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const centerY = rect.top + rect.height / 2;
      const relative = (centerY - vh / 2) / (vh / 2);
      const clamped = Math.max(-1, Math.min(1, relative));
      const rotateX = clamped * 8;
      const rotateY = Math.sin(clamped * Math.PI) * 4;
      const translateY = (1 - Math.abs(clamped)) * -6;
      const gx = 50 + clamped * 30;
      const gy = 50 - clamped * 30;
      setCardStyle({
        transform: `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(${translateY}px)`,
        transition: "transform 0.15s ease-out",
        "--gx": `${gx}%`,
        "--gy": `${gy}%`,
      } as React.CSSProperties);
    };

    const onScroll = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(update);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    update();

    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const px = x / rect.width;
    const py = y / rect.height;
    const rotateX = (py - 0.5) * -12;
    const rotateY = (px - 0.5) * 12;

    /* Reflection = inverse position (simulates fixed overhead light on tilted card) */
    const gx = (1 - px) * 100;
    const gy = (1 - py) * 100;

    mousePos.current = { x: px, y: py };

    setCardStyle({
      transform: `perspective(700px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`,
      "--mx": `${px}`,
      "--my": `${py}`,
      "--pos": `${px * 100}% ${py * 100}%`,
      "--posx": `${px * 100}%`,
      "--posy": `${py * 100}%`,
      "--glare-pos": `${gx}% ${gy}%`,
      "--angle": `${Math.atan2(py - 0.5, px - 0.5) * (180 / Math.PI)}deg`,
    } as React.CSSProperties);
  }, []);

  const handleMouseEnter = useCallback(() => setIsHovered(true), []);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    setCardStyle({
      transform: "perspective(700px) rotateX(0deg) rotateY(0deg)",
      "--mx": "0.5",
      "--my": "0.5",
      "--pos": "50% 50%",
      "--posx": "50%",
      "--posy": "50%",
      "--glare-pos": "50% 50%",
      "--angle": "0deg",
    } as React.CSSProperties);
  }, []);

  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  // If pinnedBadges is explicitly provided (even empty), respect that choice; undefined = no preference → fallback to first 5
  const displayedBadges = pinnedBadges !== undefined ? pinnedBadges : badges.slice(0, 5);
  const rarity = getCardRarity(badges);
  const rarityLabels: Record<string, string> = { common: "", uncommon: "★", rare: "★★", epic: "★★★", mythic: "★★★★", legendary: "★★★★★" };
  const rarityIntensity: Record<string, number> = { common: 0, uncommon: 0.2, rare: 0.4, epic: 0.6, mythic: 0.8, legendary: 1 };
  const themeClass = theme !== "default" ? ` pkmn-card--${theme}` : "";
  const variantClass = variant !== "classic" ? ` pkmn-card--${variant}` : "";
  const borderClass = metalBorder ? ` pkmn-card--border-${metalBorder}` : "";
  const fxClass = cardFx ? ` pkmn-card--fx-${cardFx}` : "";
  const countryCode = getCountryCode(country);
  const flagSrc = countryCode ? `https://flagcdn.com/w80/${countryCode}.png` : null;


  if (variant === "fullart") {
    return (
      <div
        ref={cardRef}
        className={`pkmn-card pkmn-card--${rarity}${themeClass}${variantClass}${borderClass}${fxClass} ${isHovered ? "pkmn-card--active" : ""}`}
        style={cardStyle}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="pkmn-card__inner pkmn-card__inner--fullart">
          {theme?.startsWith("berlin_") && <BerlinOverlay theme={theme} />}
          {/* Full bleed photo */}
          <div className="pkmn-card__fullart-img">
            {photoPath && !imgError ? (
              <img src={photoPath} alt={name} onError={() => setImgError(true)} />
            ) : (
              <div className="pkmn-card__img-placeholder">{initials}</div>
            )}
          {/* WebGL holo overlay — legendary only, skip si holoFull couvre déjà toute la carte */}
            {rarity === "legendary" && !holoFull && <HoloEffect mx={mousePos.current.x} my={mousePos.current.y} active={isHovered} variant={holoVariant ?? "constellation"} />}
            {/* CSS overlays uniquement sur les cartes non-legendary (WebGL gère le legendary) */}
            {rarity !== "legendary" && <div className="pkmn-card__holo" />}
            {rarity !== "legendary" && <div className="pkmn-card__glare" />}
          </div>

          {/* Flag → club logo → team logo, empilés en colonne top-left */}
          <div className="pkmn-card__emblem-stack">
            {flagSrc && (
              <img src={flagSrc} alt={country} className="pkmn-card__emblem pkmn-card__emblem--flag" />
            )}
            {clubLogoPath && (
              <img src={clubLogoPath} alt="Club" className="pkmn-card__emblem pkmn-card__emblem--club" />
            )}
            {teamLogoPath && (
              <img src={teamLogoPath} alt="Team" className="pkmn-card__emblem pkmn-card__emblem--team" />
            )}
          </div>

          {/* Overlay info at bottom */}
          <div className="pkmn-card__fullart-overlay">
            <div className="pkmn-card__top">
              <span className="pkmn-card__name" style={{ fontSize: getNameFontSize(name) }}>{name}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {rarityLabels[rarity] && (
                  <span className={`pkmn-card__rarity-stars pkmn-card__rarity-stars--${rarity}`}>{rarityLabels[rarity]}</span>
                )}
                <span className="pkmn-card__hp"><strong>{startYear ?? "—"}</strong></span>
              </div>
            </div>
            <div className="pkmn-card__strip">
              <span className="pkmn-card__location" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{city ? `${city}, ${country}` : country}</span>
            </div>
            {displayedBadges.length > 0 && (
              <div className="pkmn-card__attacks">
                {displayedBadges.map((badge) => {
                  const info = getBadgeInfo(badge);
                  return (
                    <div key={badge} className={`pkmn-card__attack pkmn-card__attack--${info.rarity}`}>
                      <span className="pkmn-card__attack-icon">
                        {info.iconUrl ? <img src={info.iconUrl} alt={info.name} width={15} height={15} style={{ imageRendering: "pixelated" }} /> : info.emoji}
                      </span>
                      <span className="pkmn-card__attack-name">{info.name}</span>
                      <span className={`pkmn-card__attack-rarity pkmn-card__attack-rarity--${info.rarity}`}>
                        {info.rarity === "legendary" ? "★★★★★" : info.rarity === "mythic" ? "★★★★" : info.rarity === "epic" ? "★★★" : info.rarity === "rare" ? "★★" : "★"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        {holoFull && <HoloEffect mx={mousePos.current.x} my={mousePos.current.y} active={isHovered} variant={holoFull} alphaBlend={true} />}
      </div>
    );
  }

  // ─── CLASSIC variant ───
  return (
    <div
      ref={cardRef}
      className={`pkmn-card pkmn-card--${rarity}${themeClass}${variantClass}${borderClass}${fxClass} ${isHovered ? "pkmn-card--active" : ""}`}
      style={cardStyle}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="pkmn-card__inner">
        {theme?.startsWith("berlin_") && <BerlinOverlay theme={theme} />}
        {/* Foil glare for holofoil theme */}
        {theme === "holofoil" && <div className="pkmn-card__foil-glare" />}
        <div className="pkmn-card__top">
          <span className="pkmn-card__name" style={{ fontSize: getNameFontSize(name) }}>{name}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {rarityLabels[rarity] && (
              <span className={`pkmn-card__rarity-stars pkmn-card__rarity-stars--${rarity}`}>{rarityLabels[rarity]}</span>
            )}
            <span className="pkmn-card__hp"><strong>{startYear ?? "—"}</strong></span>
          </div>
        </div>

        <div className="pkmn-card__frame">
          {photoPath && !imgError ? (
            <img src={photoPath} alt={name} className="pkmn-card__img" onError={() => setImgError(true)} />
          ) : (
            <div className="pkmn-card__img-placeholder">{initials}</div>
          )}
          {/* WebGL holo overlay — legendary only, skip si holoFull couvre déjà toute la carte */}
          {rarity === "legendary" && !holoFull && <HoloEffect mx={mousePos.current.x} my={mousePos.current.y} active={isHovered} variant={holoVariant ?? "constellation"} />}
          {/* CSS overlays uniquement sur les cartes non-legendary */}
          {rarity !== "legendary" && <div className="pkmn-card__holo" />}
          {rarity !== "legendary" && <div className="pkmn-card__glare" />}
          {/* Flag → club logo → team logo, empilés en colonne top-left */}
          <div className="pkmn-card__emblem-stack">
            {flagSrc && (
              <img src={flagSrc} alt={country} className="pkmn-card__emblem pkmn-card__emblem--flag" />
            )}
            {clubLogoPath && (
              <img src={clubLogoPath} alt="Club" className="pkmn-card__emblem pkmn-card__emblem--club" />
            )}
            {teamLogoPath && (
              <img src={teamLogoPath} alt="Team" className="pkmn-card__emblem pkmn-card__emblem--team" />
            )}
          </div>
        </div>

        <div className="pkmn-card__strip">
          <span className="pkmn-card__location" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{city ? `${city}, ${country}` : country}</span>
        </div>

        {displayedBadges.length > 0 && (
          <div className="pkmn-card__attacks">
            {displayedBadges.map((badge) => {
              const info = getBadgeInfo(badge);
              return (
                <div key={badge} className={`pkmn-card__attack pkmn-card__attack--${info.rarity}`}>
                  <span className="pkmn-card__attack-icon">
                    {info.iconUrl ? <img src={info.iconUrl} alt={info.name} width={15} height={15} style={{ imageRendering: "pixelated" }} /> : info.emoji}
                  </span>
                  <span className="pkmn-card__attack-name">{info.name}</span>
                  <span className={`pkmn-card__attack-rarity pkmn-card__attack-rarity--${info.rarity}`}>
                    {info.rarity === "legendary" ? "★★★★★" : info.rarity === "mythic" ? "★★★★" : info.rarity === "epic" ? "★★★" : info.rarity === "rare" ? "★★" : "★"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {holoFull && <HoloEffect mx={mousePos.current.x} my={mousePos.current.y} active={isHovered} variant={holoFull} alphaBlend={true} />}
      </div>
    </div>
  );
});
