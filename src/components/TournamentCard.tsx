import Link from "next/link";
import { Tournament } from "@prisma/client";
import { formatDate } from "@/lib/utils";

function RegistrationBadge({ start, end }: { start: Date | null; end: Date | null }) {
  const now = new Date();

  if (end && now > end) {
    return <span className="reg-badge reg-badge--closed">🔒 Inscriptions fermées</span>;
  }

  if (start && now < start) {
    const days = Math.ceil((start.getTime() - now.getTime()) / 86_400_000);
    const label = days <= 1 ? "demain" : `dans ${days}j`;
    return <span className="reg-badge reg-badge--soon">🔓 Ouverture {label}</span>;
  }

  if (end) {
    const days = Math.ceil((end.getTime() - now.getTime()) / 86_400_000);
    if (days <= 1)
      return <span className="reg-badge reg-badge--urgent">🔥 Dernier jour !</span>;
    if (days <= 7)
      return <span className="reg-badge reg-badge--urgent">⏳ J-{days}</span>;
    if (days <= 30)
      return <span className="reg-badge reg-badge--open">⏳ J-{days}</span>;
    return <span className="reg-badge reg-badge--open">🔓 Inscriptions ouvertes</span>;
  }

  if (start && now >= start) {
    return <span className="reg-badge reg-badge--open">🔓 Inscriptions ouvertes</span>;
  }

  return null;
}

export function TournamentCard({ tournament, teamCount }: { tournament: Tournament; teamCount: number }) {
  return (
    <Link className="tournament-card" href={`/tournament/${tournament.id}`}>
      <div className="tournament-card__header">
        <h3>{tournament.name}</h3>
        <span className={`status ${tournament.status.toLowerCase()}`}>{tournament.status}</span>
      </div>
      <p className="tournament-card__location">📍 {tournament.city}, {tournament.country}</p>
      <p className="meta">{formatDate(tournament.dateStart)} — {formatDate(tournament.dateEnd)}</p>
      <p className="meta">{tournament.format} · {teamCount}/{tournament.maxTeams} équipes</p>
      <RegistrationBadge
        start={tournament.registrationStart}
        end={tournament.registrationEnd}
      />
    </Link>
  );
}
