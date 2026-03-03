"use client";

import { useRef, useState, useCallback } from "react";
import { getBadgeInfo, getCardRarity } from "@/lib/badge-catalog";
import { COUNTRIES } from "@/lib/countries";
import { HoloEffect } from "./HoloEffect";

type Props = {
  name: string;
  country: string;
  city?: string | null;
  photoPath?: string | null;
  clubLogoPath?: string | null;
  emblemPosition?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | null;
  teamLogoPath?: string | null;
  teamLogoPosition?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | null;
  badges?: string[];
  pinnedBadges?: string[];
  startYear?: number | null;
  hand?: string | null;
  gender?: "MALE" | "FEMALE" | "NON_BINARY" | "PREFER_NOT_SAY" | null;
  showGender?: boolean;
  theme?: "default" | "black" | "green" | "holofoil" | "ivory" | "cream" | "pearl" | "anthracite" | "gradient"
       | "rose" | "lavender" | "sand" | "mint" | "amber"
       | "midnight" | "forest" | "carbon" | "teal" | "burgundy";
  variant?: "classic" | "fullart";
  metalBorder?: "bronze" | "silver" | "gold" | "platinum" | "diamond";
  holoVariant?: "glitter" | "iris" | "constellation" | "chromatic";
  cardFx?: "foil" | "glow" | "scanlines";
};

/** Resolve country name → ISO 2-letter code for flag URL */
function getCountryCode(name: string): string | null {
  const entry = COUNTRIES.find((c) => c.name.toLowerCase() === name.toLowerCase() || c.code.toLowerCase() === name.toLowerCase());
  return entry ? entry.code.toLowerCase() : null;
}

export function PokemonCard({ name, country, city, photoPath, clubLogoPath, emblemPosition = "top-left", teamLogoPath, teamLogoPosition, badges = [], pinnedBadges, startYear, hand, gender, showGender = false, theme = "default", variant = "classic", metalBorder, holoVariant, cardFx }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardStyle, setCardStyle] = useState<React.CSSProperties>({});
  const [isHovered, setIsHovered] = useState(false);
  const [imgError, setImgError] = useState(false);
  const mousePos = useRef({ x: 0.5, y: 0.5 });

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

  // If pinnedBadges is provided and non-empty, show those; otherwise fallback to first 5 badges
  const displayedBadges = pinnedBadges && pinnedBadges.length > 0 ? pinnedBadges : badges.slice(0, 5);
  const rarity = getCardRarity(badges.length);
  const rarityLabels: Record<string, string> = { common: "", uncommon: "★", rare: "★★", epic: "★★★", mythic: "★★★★", legendary: "★★★★★" };
  const rarityIntensity: Record<string, number> = { common: 0, uncommon: 0.2, rare: 0.4, epic: 0.6, mythic: 0.8, legendary: 1 };
  const themeClass = theme !== "default" ? ` pkmn-card--${theme}` : "";
  const variantClass = variant !== "classic" ? ` pkmn-card--${variant}` : "";
  const borderClass = metalBorder ? ` pkmn-card--border-${metalBorder}` : "";
  const fxClass = cardFx ? ` pkmn-card--fx-${cardFx}` : "";
  const countryCode = getCountryCode(country);
  const flagSrc = countryCode ? `https://flagcdn.com/w80/${countryCode}.png` : null;

  // Club logo corner (flag always top-left)
  const clubCorner = (emblemPosition && emblemPosition !== "top-left") ? emblemPosition : "top-right";
  // Team logo corner — auto-shift if same as club
  const ALL_CORNERS = ["top-right", "bottom-right", "bottom-left"] as const;
  const rawTeamCorner = (teamLogoPosition ?? "bottom-right") as string;
  const teamCorner = rawTeamCorner === clubCorner
    ? (ALL_CORNERS.find(c => c !== clubCorner) ?? "bottom-left")
    : rawTeamCorner;

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
          {/* Full bleed photo */}
          <div className="pkmn-card__fullart-img">
            {photoPath && !imgError ? (
              <img src={photoPath} alt={name} onError={() => setImgError(true)} />
            ) : (
              <div className="pkmn-card__img-placeholder">{initials}</div>
            )}
          {/* WebGL holo overlay — legendary only to stay under browser GL context limit */}
            {rarity === "legendary" && <HoloEffect mx={mousePos.current.x} my={mousePos.current.y} active={isHovered} variant={holoVariant} />}
            {/* CSS overlays uniquement sur les cartes non-legendary (WebGL gère le legendary) */}
            {rarity !== "legendary" && <div className="pkmn-card__sparkle" />}
            {rarity !== "legendary" && <div className="pkmn-card__holo" />}
            {rarity !== "legendary" && <div className="pkmn-card__glare" />}
          </div>

          {/* Emblems — flag always top-left, club + team in chosen corners */}
          {flagSrc && (
            <img src={flagSrc} alt={country} className="pkmn-card__emblem pkmn-card__emblem--top-left pkmn-card__emblem--flag" style={{ position: "absolute", top: 18, left: 18, transform: "none" }} />
          )}
          {clubLogoPath && (
            <img src={clubLogoPath} alt="Club" className="pkmn-card__emblem pkmn-card__emblem--club" style={{ position: "absolute", transform: "none", ...(clubCorner.startsWith("top") ? { top: 18 } : { bottom: 18 }), ...(clubCorner.endsWith("right") ? { right: 18 } : { left: 18 }) }} />
          )}
          {teamLogoPath && (
            <img src={teamLogoPath} alt="Team" className="pkmn-card__emblem pkmn-card__emblem--team" style={{ position: "absolute", transform: "none", ...(teamCorner.startsWith("top") ? { top: 18 } : { bottom: 18 }), ...(teamCorner.endsWith("right") ? { right: 18 } : { left: 18 }) }} />
          )}

          {/* Overlay info at bottom */}
          <div className="pkmn-card__fullart-overlay">
            <div className="pkmn-card__top">
              <span className="pkmn-card__name">{name}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {rarityLabels[rarity] && (
                  <span className={`pkmn-card__rarity-stars pkmn-card__rarity-stars--${rarity}`}>{rarityLabels[rarity]}</span>
                )}
                <span className="pkmn-card__hp"><strong>{startYear ?? "—"}</strong></span>
              </div>
            </div>
            <div className="pkmn-card__strip">
              <span className="pkmn-card__location">{city ? `${city}, ${country}` : country}</span>
              <div className="pkmn-card__tags">
                {showGender && gender && gender !== "PREFER_NOT_SAY" && (
                  <span className="pkmn-card__tag pkmn-card__tag--gender">
                    {gender === "MALE" ? "Homme" : gender === "FEMALE" ? "Femme" : "Non-binaire"}
                  </span>
                )}
                {hand && (
                  <span className="pkmn-card__tag">
                    {hand === "LEFT" ? "Gaucher·e" : "Droitier·e"}
                  </span>
                )}
              </div>
            </div>
            {displayedBadges.length > 0 && (
              <div className="pkmn-card__attacks">
                {displayedBadges.map((badge) => {
                  const info = getBadgeInfo(badge);
                  return (
                    <div key={badge} className={`pkmn-card__attack pkmn-card__attack--${info.rarity}`}>
                      <span className="pkmn-card__attack-icon">{info.emoji}</span>
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
        {/* Foil glare for holofoil theme */}
        {theme === "holofoil" && <div className="pkmn-card__foil-glare" />}
        <div className="pkmn-card__top">
          <span className="pkmn-card__name">{name}</span>
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
          {/* WebGL holo overlay — legendary only to stay under browser GL context limit */}
          {rarity === "legendary" && <HoloEffect mx={mousePos.current.x} my={mousePos.current.y} active={isHovered} variant={holoVariant} />}
          {/* CSS overlays uniquement sur les cartes non-legendary */}
          {rarity !== "legendary" && <div className="pkmn-card__sparkle" />}
          {rarity !== "legendary" && <div className="pkmn-card__holo" />}
          {rarity !== "legendary" && <div className="pkmn-card__glare" />}
          {/* Flag — always top-left */}
          {flagSrc && (
            <img
              src={flagSrc}
              alt={country}
              className="pkmn-card__emblem pkmn-card__emblem--top-left pkmn-card__emblem--flag"
            />
          )}
          {/* Club logo */}
          {clubLogoPath && (
            <img
              src={clubLogoPath}
              alt="Club"
              className={`pkmn-card__emblem pkmn-card__emblem--${clubCorner} pkmn-card__emblem--club`}
            />
          )}
          {/* Team logo */}
          {teamLogoPath && (
            <img
              src={teamLogoPath}
              alt="Team"
              className={`pkmn-card__emblem pkmn-card__emblem--${teamCorner} pkmn-card__emblem--team`}
            />
          )}
        </div>

        <div className="pkmn-card__strip">
          <span className="pkmn-card__location">{city ? `${city}, ${country}` : country}</span>
          <div className="pkmn-card__tags">
            {showGender && gender && gender !== "PREFER_NOT_SAY" && (
              <span className="pkmn-card__tag pkmn-card__tag--gender">
                {gender === "MALE" ? "Homme" : gender === "FEMALE" ? "Femme" : "Non-binaire"}
              </span>
            )}
            {hand && (
              <span className="pkmn-card__tag">
                {hand === "LEFT" ? "Gaucher·e" : "Droitier·e"}
              </span>
            )}
          </div>
        </div>

        {displayedBadges.length > 0 && (
          <div className="pkmn-card__attacks">
            {displayedBadges.map((badge) => {
              const info = getBadgeInfo(badge);
              return (
                <div key={badge} className={`pkmn-card__attack pkmn-card__attack--${info.rarity}`}>
                  <span className="pkmn-card__attack-icon">{info.emoji}</span>
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
  );
}
