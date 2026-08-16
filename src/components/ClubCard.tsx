import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("clubs");
  return (
    <Link href={`/club/${id}`} className="club-card">
      <div className="club-card__logo">
        {logoPath
          ? <Image src={logoPath} alt={name} fill sizes="64px" style={{ objectFit: "cover" }} />
          : <div className="club-card__logo-placeholder">{name[0]?.toUpperCase()}</div>
        }
      </div>
      <div className="club-card__info">
        <h4 className="club-card__name">{name}</h4>
        <p className="club-card__location">📍 {city}, {country}</p>
        {memberCount !== undefined && (
          <p className="club-card__meta">{t("members_count", { count: memberCount })}</p>
        )}
        {approved === false && (
          <span className="club-card__pending">{t("pending_approval")}</span>
        )}
      </div>
    </Link>
  );
}
