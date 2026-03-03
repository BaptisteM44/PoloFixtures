import Link from "next/link";

export type PlayerCardProps = {
  id: string;
  slug?: string | null;
  name: string;
  country: string;
  city?: string | null;
  photoPath?: string | null;
  badges?: string[];
  stats?: { goals: number; penalties: number };
};

export function PlayerCard({ id, slug, name, country, city, photoPath, badges = [], stats }: PlayerCardProps) {
  const href = `/player/${slug ?? id}`;

  return (
    <Link href={href} className="player-card" style={{ textDecoration: "none", color: "inherit", display: "block" }}>
      <div className="player-photo">
        {photoPath ? <img src={photoPath} alt={name} /> : <div className="placeholder">{name[0]}</div>}
      </div>
      <div className="player-info">
        <h4>{name}</h4>
        <p>{city ? `${city}, ${country}` : country}</p>
        {stats && (
          <p className="meta">Goals {stats.goals} · Penalties {stats.penalties}</p>
        )}
        {badges.length > 0 && (
          <div className="badges">
            {badges.map((badge) => (
              <span key={badge} className="badge">{badge}</span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
