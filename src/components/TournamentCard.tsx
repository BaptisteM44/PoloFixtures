import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { Tournament } from "@prisma/client";
import { FollowButton } from "@/components/FollowButton";

// Statut d'inscription unifié — partagé avec TournamentBrowser
export function getTournamentStatusBadge(
  dbStatus: string,
  registrationStart: Date | string | null,
  registrationEnd: Date | string | null
): { label: string; cls: string } {
  if (dbStatus === "LIVE") return { label: "En cours", cls: "live" };
  if (dbStatus === "COMPLETED") return { label: "Terminé", cls: "completed" };
  const now = new Date();
  const start = registrationStart ? new Date(registrationStart) : null;
  const end = registrationEnd ? new Date(registrationEnd) : null;
  if (start && end && start <= now && end >= now) return { label: "Inscriptions ouvertes", cls: "reg-open" };
  if (end && end < now) return { label: "Inscriptions fermées", cls: "reg-closed" };
  return { label: "Annoncé", cls: "announced" };
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

  const { label, cls } = getTournamentStatusBadge(
    tournament.status,
    tournament.registrationStart,
    tournament.registrationEnd
  );

  const dateStart = new Date(tournament.dateStart);
  const dateEnd = new Date(tournament.dateEnd);

  const dayStart = dateStart.getDate();
  const monthStart = dateStart.toLocaleString("fr-FR", { month: "short" });
  const dayEnd = dateEnd.getDate();
  const monthEnd = dateEnd.toLocaleString("fr-FR", { month: "short" });
  const sameDay = dayStart === dayEnd && monthStart === monthEnd;

  return (
    <div className={`tournament-card-wrapper${tournament.bannerPath ? " tournament-card-wrapper--has-banner" : ""}`}>
      <Link className={`tournament-card${tournament.bannerPath ? " tournament-card--has-banner" : ""}`} href={`/tournament/${tournament.id}`}>

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

        {/* Banner full height */}
        {tournament.bannerPath && (
          <div className="tournament-card__banner">
            <img src={tournament.bannerPath} alt="" />
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
