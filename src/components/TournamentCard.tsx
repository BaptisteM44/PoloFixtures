import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { Tournament } from "@prisma/client";
import { formatDate } from "@/lib/utils";

async function RegistrationBadge({ start, end }: { start: Date | null; end: Date | null }) {
  const t = await getTranslations("registration");
  const now = new Date();

  if (end && now > end) {
    return <span className="reg-badge reg-badge--closed">{t("reg_badge_closed")}</span>;
  }

  if (start && now < start) {
    const days = Math.ceil((start.getTime() - now.getTime()) / 86_400_000);
    const label = days <= 1 ? t("reg_badge_opens_tomorrow") : t("reg_badge_opens_in_days", { days });
    return <span className="reg-badge reg-badge--soon">{label}</span>;
  }

  if (end) {
    const days = Math.ceil((end.getTime() - now.getTime()) / 86_400_000);
    if (days <= 1)
      return <span className="reg-badge reg-badge--urgent">{t("reg_badge_last_day")}</span>;
    if (days <= 7)
      return <span className="reg-badge reg-badge--urgent">{t("reg_badge_days_left", { days })}</span>;
    if (days <= 30)
      return <span className="reg-badge reg-badge--open">{t("reg_badge_days_left", { days })}</span>;
    return <span className="reg-badge reg-badge--open">{t("reg_badge_open")}</span>;
  }

  if (start && now >= start) {
    return <span className="reg-badge reg-badge--open">{t("reg_badge_open")}</span>;
  }

  return null;
}

export async function TournamentCard({ tournament, teamCount }: { tournament: Tournament; teamCount: number }) {
  const t = await getTranslations("tournaments");
  const STATUS_LABELS: Record<string, string> = {
    LIVE: t("status_live"),
    UPCOMING: t("status_upcoming"),
    COMPLETED: t("status_completed"),
  };

  return (
    <Link className={`tournament-card${tournament.bannerPath ? " tournament-card--has-banner" : ""}`} href={`/tournament/${tournament.id}`}>
      <div className="tournament-card__body">
        <div className="tournament-card__header">
          <h3>{tournament.name}</h3>
          <span className={`status ${tournament.status.toLowerCase()}`}>
            {STATUS_LABELS[tournament.status] ?? tournament.status}
          </span>
        </div>
        <p className="tournament-card__location">📍 {tournament.city}, {tournament.country}</p>
        <p className="meta">{formatDate(tournament.dateStart)} — {formatDate(tournament.dateEnd)}</p>
        <p className="meta">{tournament.format} · {t("teams_slots", { count: teamCount, max: tournament.maxTeams })}</p>
        <RegistrationBadge
          start={tournament.registrationStart}
          end={tournament.registrationEnd}
        />
      </div>
      {tournament.bannerPath && (
        <div className="tournament-card__banner">
          <img src={tournament.bannerPath} alt="" />
        </div>
      )}
    </Link>
  );
}
