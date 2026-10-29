"use client";

import { useEffect, useState, useTransition } from "react";
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

/** Heure / jour au format local du NAVIGATEUR, calculés après montage : le
 *  serveur ne connaît pas le fuseau du joueur (écart → erreur d'hydratation). */
function useLocalDate(iso: string, locale: string) {
  const [v, setV] = useState<{ day: string; month: string; weekday: string; time: string; rel: number } | null>(null);
  useEffect(() => {
    const d = new Date(iso);
    const today = new Date();
    const rel = Math.round(
      (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
        new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86_400_000,
    );
    setV({
      day: String(d.getDate()),
      month: d.toLocaleDateString(locale, { month: "short" }).replace(".", ""),
      weekday: d.toLocaleDateString(locale, { weekday: "short" }).replace(".", ""),
      time: d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }),
      rel,
    });
  }, [iso, locale]);
  return v;
}

/**
 * Prochain entraînement en LIGNE d'agenda (accueil) : pastille de date à
 * gauche, club / lieu / qui vient au centre, « J'y vais » à droite.
 */
export function TrainingAgendaRow({ s }: { s: TrainingTileData }) {
  const t = useTranslations("home");
  const tc = useTranslations("club");
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [calOpen, setCalOpen] = useState(false);
  const d = useLocalDate(s.date, locale);
  const cal = sessionCalendarLinks({ id: s.id, date: s.date, duration: s.duration, title: s.title, place: s.place, clubName: s.clubName });
  const href = `/club/${s.clubId}?tab=sessions`;
  const going = s.myStatus === "CONFIRMED";
  const act = (fn: () => Promise<unknown>) => startTransition(async () => { await fn(); router.refresh(); });
  const when = !d ? "" : d.rel === 0 ? t("training_today") : d.rel === 1 ? t("training_tomorrow") : d.weekday;

  return (
    <li className={`agenda-row agenda-row--training${going ? " is-going" : ""}`}>
      <Link href={href} className="agenda-row__date agenda-row__date--training" style={s.color ? { background: s.color } : undefined}>
        <span className="agenda-row__day">{d?.day ?? "·"}</span>
        <span className="agenda-row__month">{d?.month ?? ""}</span>
      </Link>
      <Link href={href} className="agenda-row__main">
        <span className="agenda-row__kicker">🚲 {t("hero_training_default")} · <strong>{when} {d?.time ?? ""}</strong></span>
        <span className="agenda-row__title">{s.clubName}{s.title ? <em> · {s.title}</em> : null}</span>
        <span className="agenda-row__meta">
          {s.place ? `📍 ${s.place} · ` : ""}
          {s.attendees.length > 0 ? t("training_count", { count: s.attendees.length }) : t("training_nobody_short")}
          {s.messageCount > 0 ? ` · 💬 ${s.messageCount}` : ""}
        </span>
      </Link>
      <div className="agenda-row__side">
        {going ? (
          <>
            <span className="agenda-row__pill is-going">✓ {t("training_going")}</span>
            <button type="button" className="agenda-row__icon" disabled={isPending} onClick={() => act(() => leaveSessionAction(s.clubId, s.id))} title={t("training_not_going")} aria-label={t("training_not_going")}>✕</button>
          </>
        ) : s.myStatus === "PENDING" ? (
          <span className="agenda-row__pill">{tc("sessions_pending")}</span>
        ) : (
          <button type="button" className="agenda-row__btn" disabled={isPending} onClick={() => act(() => joinSessionAction(s.clubId, s.id))}>
            {t("training_join")}
          </button>
        )}
        <button type="button" className="agenda-row__icon" onClick={() => setCalOpen((o) => !o)} aria-expanded={calOpen} title={tc("sessions_add_to_calendar")}>📅</button>
        {calOpen && (
          <div className="agenda-row__cal">
            <a href={cal.ics}>iPhone / Outlook</a>
            <a href={cal.google} target="_blank" rel="noopener noreferrer">Google</a>
          </div>
        )}
      </div>
    </li>
  );
}
