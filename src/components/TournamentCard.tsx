import { Link } from "@/i18n/navigation";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { getLocale } from "next-intl/server";
import { Tournament } from "@prisma/client";
import { FollowButton } from "@/components/FollowButton";

// Statut d'inscription unifié — partagé avec TournamentBrowser
export function getTournamentStatusBadge(
  dbStatus: string,
  registrationStart: Date | string | null,
  registrationEnd: Date | string | null,
  labels?: { live: string; completed: string; reg_open: string; reg_closed: string; announced: string }
): { label: string; cls: string } {
  const l = labels ?? { live: "Live", completed: "Completed", reg_open: "Registration open", reg_closed: "Registration closed", announced: "Announced" };
  if (dbStatus === "LIVE") return { label: l.live, cls: "live" };
  if (dbStatus === "COMPLETED") return { label: l.completed, cls: "completed" };
  const now = new Date();
  const start = registrationStart ? new Date(registrationStart) : null;
  const end = registrationEnd ? new Date(registrationEnd) : null;
  if (start && end && start <= now && end >= now) return { label: l.reg_open, cls: "reg-open" };
  if (end && end < now) return { label: l.reg_closed, cls: "reg-closed" };
  return { label: l.announced, cls: "announced" };
}

export async function TournamentCard({
  tournament,
  teamCount,
  initialFollowing = false,
  isLoggedIn = false,
}: {
  tournament: Tournament;
  teamCount: number;
  initialFollowing?: boolean;
  isLoggedIn?: boolean;
}) {
  const t = await getTranslations("tournaments");
  const locale = await getLocale();

  const { label, cls } = getTournamentStatusBadge(
    tournament.status,
    tournament.registrationStart,
    tournament.registrationEnd,
    {
      live: t("status_live"),
      completed: t("status_completed"),
      reg_open: t("status_reg_open"),
      reg_closed: t("status_reg_closed"),
      announced: t("status_announced"),
    }
  );

  const dateStart = new Date(tournament.dateStart);
  const dateEnd = new Date(tournament.dateEnd);

  const dayStart = dateStart.getDate();
  const monthStart = dateStart.toLocaleString(locale, { month: "short" });
  const dayEnd = dateEnd.getDate();
  const monthEnd = dateEnd.toLocaleString(locale, { month: "short" });
  const sameDay = dayStart === dayEnd && monthStart === monthEnd;

  return (
    <div className={`tournament-card-wrapper${tournament.bannerPath ? " tournament-card-wrapper--has-banner" : ""}`}>
      <Link className={`tournament-card${tournament.bannerPath ? " tournament-card--has-banner" : ""}`} href={`/tournament/${tournament.slug ?? tournament.id}`}>

        {/* Date column */}
        <div className="tournament-card__date">
          <span className="tournament-card__day">{dayStart}</span>
          <span className="tournament-card__month">{monthStart}</span>
          {!sameDay && (
            <>
              <span className="tournament-card__date-arrow">↓</span>
              <span className="tournament-card__day-end">{dayEnd}</span>
              <span className="tournament-card__month-end">{monthEnd}</span>
            </>
          )}
        </div>

        {/* Body */}
        <div className="tournament-card__body">
          <div className="tournament-card__header">
            <h3>{tournament.name}</h3>
            <span className={`status ${cls}`}>{label}</span>
          </div>
          <p className="tournament-card__location">📍 {tournament.city}, {tournament.country}</p>
          <p className="meta">{tournament.format} · {t("teams_slots", { count: teamCount, max: tournament.maxTeams })}</p>
        </div>

        {/* Banner full height (next/image : redimensionné à 90px, lazy, webp/avif) */}
        {tournament.bannerPath && (
          <div className="tournament-card__banner">
            <Image
              src={tournament.bannerPath}
              alt=""
              fill
              sizes="90px"
              style={{ objectFit: "cover" }}
            />
          </div>
        )}
      </Link>

      {/* Follow button — outside the link */}
      <div className="tournament-card__follow">
        <FollowButton
          tournamentId={tournament.id}
          initialFollowing={initialFollowing}
          isLoggedIn={isLoggedIn}
        />
      </div>
    </div>
  );
}
