import Link from "next/link";

export type ClubCardProps = {
  id: string;
  name: string;
  city: string;
  country: string;
  logoPath?: string | null;
  memberCount?: number;
  approved?: boolean;
};

export function ClubCard({ id, name, city, country, logoPath, memberCount, approved }: ClubCardProps) {
  return (
    <Link href={`/club/${id}`} className="club-card">
      <div className="club-card__logo">
        {logoPath
          ? <img src={logoPath} alt={name} />
          : <div className="club-card__logo-placeholder">{name[0]?.toUpperCase()}</div>
        }
      </div>
      <div className="club-card__info">
        <h4 className="club-card__name">{name}</h4>
        <p className="club-card__location">📍 {city}, {country}</p>
        {memberCount !== undefined && (
          <p className="club-card__meta">{memberCount} membre{memberCount !== 1 ? "s" : ""}</p>
        )}
        {approved === false && (
          <span className="club-card__pending">En attente d&apos;approbation</span>
        )}
      </div>
    </Link>
  );
}
