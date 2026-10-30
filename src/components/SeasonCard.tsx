/**
 * Carte « Saison » — le cadeau de fin d'année du récap (dessinée sur /demo-cards).
 *
 * Placements Top Trumps (étiquette en haut, grande case photo, bandeau nom en
 * travers, encart texte à gauche, colonne de stats à droite, logo en bas), en
 * langue Poloperator : fond crème, contours noirs, ombres dures, aplats
 * d'accents, terrain de bike polo tracé derrière le joueur. Stats de la
 * SAISON, jamais de victoires ni de défaites. Taille standard 340×520.
 */
import { BADGE_CATALOG } from "@/lib/badge-catalog";
import { BadgeIcon } from "@/components/CoachCard";
import { countryToIso } from "@/lib/country-utils";

export type SeasonStat = { label: string; value: string | number };

export type SeasonCardProps = {
  season: number;
  name: string;
  country: string;
  city: string;
  clubName?: string | null;
  clubLogoPath?: string | null;
  teamLogoPath?: string | null;
  photoUrl?: string | null;
  bio?: string | null;
  stats: SeasonStat[];
  pinnedBadges: string[];
  /** Palier 1–5, selon la participation (nombre de tournois), jamais la performance. */
  stars: number;
  /** N° de la carte dans la série de l'année. */
  serial: string;
};

/** Étoiles selon le nombre de tournois joués dans la saison. */
export function seasonStars(tournaments: number): number {
  if (tournaments >= 9) return 5;
  if (tournaments >= 6) return 4;
  if (tournaments >= 4) return 3;
  if (tournaments >= 2) return 2;
  return 1;
}

// Fond des cases valeur : les accents du site, en rotation
const STAT_BG = ["var(--yellow, #fffc8a)", "var(--teal, #60c9cf)", "var(--pink, #ffa2af)"];

function nameSize(name: string) {
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

export function SeasonCard({
  season, name, country, city, clubName, clubLogoPath, teamLogoPath,
  photoUrl, bio, stats, pinnedBadges, stars, serial,
}: SeasonCardProps) {
  const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const iso = countryToIso(country)?.toLowerCase();
  const info = bio?.trim()
    || `Une saison ${season} sur les courts${clubName ? ` avec ${clubName}` : ""}. Merci d'avoir roulé avec nous !`;

  return (
    <div className="ssn">
      <div className="ssn-tag">Saison {season}</div>
      <div className="ssn-serial">N° {serial}</div>

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
          {iso && <img src={`https://flagcdn.com/w80/${iso}.png`} alt={country} className="ssn-emblem" />}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {clubLogoPath && <img src={clubLogoPath} alt={clubName ?? "Club"} className="ssn-emblem" />}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {teamLogoPath && <img src={teamLogoPath} alt="" className="ssn-emblem" />}
        </div>
      </div>

      <div className="ssn-name">
        <span style={{ fontSize: nameSize(name) }}>{name}</span>
      </div>

      <div className="ssn-info">
        <div className="ssn-info__head">Ta saison</div>
        <p>{info}</p>
        <p className="ssn-info__loc">{city}{clubName ? ` · ${clubName}` : ""}</p>
      </div>

      <div className="ssn-badges">
        {pinnedBadges.slice(0, 5).map((b) => (
          <span key={b} className="ssn-badge" title={BADGE_CATALOG[b]?.name ?? b}>
            <BadgeIcon id={b} size={15} />
          </span>
        ))}
      </div>

      <div className="ssn-stats">
        {stats.slice(0, 6).map((s, i) => (
          <div key={s.label} className="ssn-stat">
            <span className="ssn-stat__label">{s.label}</span>
            <span className="ssn-stat__value" style={{ background: STAT_BG[i % STAT_BG.length] }}>{s.value}</span>
          </div>
        ))}
      </div>

      <div className="ssn-logo">
        <span className="ssn-logo__mark"><span className="ssn-logo__dot" />Poloperator</span>
        <span className="ssn-logo__stars">{"★".repeat(stars)}<span style={{ opacity: 0.25 }}>{"★".repeat(5 - stars)}</span></span>
      </div>
    </div>
  );
}
