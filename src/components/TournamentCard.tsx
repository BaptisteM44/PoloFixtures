import Link from "next/link";
import { Tournament } from "@prisma/client";
import { formatDate } from "@/lib/utils";

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
    </Link>
  );
}
