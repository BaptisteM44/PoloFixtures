"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { joinSessionAction, leaveSessionAction } from "@/app/[locale]/club/[id]/actions";
import { sessionCalendarLinks } from "@/lib/session-calendar";

export type TrainingTileData = {
  id: string;
  clubId: string;
  clubName: string;
  title: string | null;
  date: string;
  duration: number;
  place: string | null;
  mapLink: string | null;
  color: string | null;
  attendees: { id: string; name: string; photoPath: string | null }[];
  myStatus: string | null;
  lastMessage: { name: string; content: string } | null;
  messageCount: number;
};

/** Prochains entraînements de mes clubs, en tuiles sous le prochain tournoi. */
export function TrainingTiles({ sessions }: { sessions: TrainingTileData[] }) {
  if (sessions.length === 0) return null;
  return (
    <div className="training-tiles">
      {sessions.map((s) => <TrainingTile key={s.id} s={s} />)}
    </div>
  );
}

function TrainingTile({ s }: { s: TrainingTileData }) {
  const t = useTranslations("home");
  const tc = useTranslations("club");
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [calOpen, setCalOpen] = useState(false);

  const d = new Date(s.date);
  const today = new Date();
  const dayDiff = Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
      new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86_400_000
  );
  const when = dayDiff === 0
    ? t("training_today")
    : dayDiff === 1
      ? t("training_tomorrow")
      : d.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
  const time = d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const cal = sessionCalendarLinks({ id: s.id, date: s.date, duration: s.duration, title: s.title, place: s.place, clubName: s.clubName });
  const href = `/club/${s.clubId}?tab=sessions`;
  const going = s.myStatus === "CONFIRMED";

  const act = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
    });

  return (
    <div className={`training-tile${going ? " training-tile--going" : ""}`}>
      {/* Bandeau : quand + heure, avec la couleur de la séance */}
      <div className="training-tile__band" style={s.color ? { background: s.color } : undefined}>
        <span className="training-tile__when">{when}</span>
        <span className="training-tile__time">{time}</span>
        <div className="training-tile__band-actions">
          {s.messageCount > 0 && (
            <Link href={href} className="training-tile__chip" title={s.lastMessage ? `${s.lastMessage.name} : ${s.lastMessage.content}` : undefined}>
              💬 {s.messageCount}
            </Link>
          )}
          <button type="button" className="training-tile__chip" onClick={() => setCalOpen((o) => !o)} aria-expanded={calOpen} title={tc("sessions_add_to_calendar")}>
            📅
          </button>
        </div>
        {calOpen && (
          <div className="training-tile__cal">
            <a href={cal.ics}>iPhone / Outlook</a>
            <a href={cal.google} target="_blank" rel="noopener noreferrer">Google</a>
          </div>
        )}
      </div>

      {/* Quoi / où */}
      <Link href={href} className="training-tile__body">
        <span className="training-tile__club">{s.clubName}</span>
        <span className="training-tile__place">{s.title || s.place || t("training_card_title")}</span>
        {s.title && s.place && <span className="training-tile__place">📍 {s.place}</span>}
      </Link>

      {/* Qui vient */}
      <div className="training-tile__who">
        <div className="training-tile__avatars">
          {s.attendees.slice(0, 5).map((a) =>
            a.photoPath
              // eslint-disable-next-line @next/next/no-img-element
              ? <img key={a.id} src={a.photoPath} alt={a.name} title={a.name} />
              : <span key={a.id} title={a.name}>{a.name.charAt(0).toUpperCase()}</span>
          )}
        </div>
        <span>{s.attendees.length > 0 ? t("training_count", { count: s.attendees.length }) : t("training_nobody_short")}</span>
      </div>

      {/* Réponse en un clic */}
      {going ? (
        <div className="training-tile__cta training-tile__cta--going">
          <span>✓ {t("training_going")}</span>
          <button type="button" className="training-tile__undo" disabled={isPending}
            onClick={() => act(() => leaveSessionAction(s.clubId, s.id))}>
            {t("training_not_going")}
          </button>
        </div>
      ) : s.myStatus === "PENDING" ? (
        <span className="training-tile__cta training-tile__cta--pending">{tc("sessions_pending")}</span>
      ) : (
        <button type="button" className="training-tile__cta" disabled={isPending}
          onClick={() => act(() => joinSessionAction(s.clubId, s.id))}>
          {t("training_join")}
        </button>
      )}
    </div>
  );
}
