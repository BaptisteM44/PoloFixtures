"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { joinSessionAction, leaveSessionAction } from "@/app/[locale]/club/[id]/actions";
import { sessionCalendarLinks } from "@/lib/session-calendar";

type Props = {
  session: {
    id: string;
    clubId: string;
    clubName: string;
    title: string | null;
    date: string;
    duration: number;
    place: string | null;
    mapLink: string | null;
    attendees: { id: string; name: string; photoPath: string | null }[];
    myStatus: string | null;
    lastMessage: { name: string; content: string } | null;
    messageCount: number;
  };
};

/** Carte « prochain entraînement » en tête de l'accueil : qui vient, et « J'y vais » en un clic. */
export function NextTrainingCard({ session: s }: Props) {
  const t = useTranslations("home");
  const tc = useTranslations("club");
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

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
      : d.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "short" });
  const time = d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const cal = sessionCalendarLinks({ id: s.id, date: s.date, duration: s.duration, title: s.title, place: s.place, clubName: s.clubName });
  const discussionHref = `/club/${s.clubId}?tab=sessions`;

  const act = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
    });

  return (
    <div className="panel next-training" style={{ display: "grid", gap: 12, borderLeft: "6px solid var(--teal)" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>
          🚲 {t("training_card_title")}
        </span>
        <Link href={discussionHref} style={{ fontSize: 12, color: "var(--text-muted)" }}>{s.clubName} →</Link>
      </div>

      <div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, lineHeight: 1.15, textTransform: "capitalize" }}>
          {when} · {time}
        </div>
        <div style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 2 }}>
          {s.title ? <strong style={{ color: "var(--text)" }}>{s.title}</strong> : null}
          {s.title && s.place ? " · " : ""}
          {s.place && (s.mapLink
            ? <a href={s.mapLink} target="_blank" rel="noopener noreferrer" style={{ color: "var(--teal)" }}>📍 {s.place}</a>
            : <span>📍 {s.place}</span>)}
        </div>
      </div>

      {/* Qui vient */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex" }}>
          {s.attendees.slice(0, 8).map((a, i) => (
            a.photoPath
              // eslint-disable-next-line @next/next/no-img-element
              ? <img key={a.id} src={a.photoPath} alt={a.name} title={a.name} style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--surface)", marginLeft: i ? -8 : 0 }} />
              : <span key={a.id} title={a.name} style={{ width: 30, height: 30, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, background: "var(--surface-2)", border: "2px solid var(--surface)", marginLeft: i ? -8 : 0 }}>{a.name.charAt(0).toUpperCase()}</span>
          ))}
        </div>
        <span style={{ fontSize: 13, fontWeight: 600 }}>
          {s.attendees.length > 0 ? t("training_count", { count: s.attendees.length }) : t("training_nobody")}
        </span>
      </div>

      {/* Réponse en un clic */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {s.myStatus === "CONFIRMED" ? (
          <>
            <span style={{ fontWeight: 700, color: "var(--teal)" }}>✓ {t("training_going")}</span>
            <button type="button" className="ghost" style={{ fontSize: 13 }} disabled={isPending}
              onClick={() => act(() => leaveSessionAction(s.clubId, s.id))}>
              {t("training_not_going")}
            </button>
          </>
        ) : s.myStatus === "PENDING" ? (
          <span className="meta">{tc("sessions_pending")}</span>
        ) : (
          <button type="button" className="primary" disabled={isPending}
            onClick={() => act(() => joinSessionAction(s.clubId, s.id))}>
            {t("training_join")}
          </button>
        )}
        <span className="meta" style={{ fontSize: 12 }}>
          📅 <a href={cal.ics} style={{ color: "var(--teal)" }}>iPhone / Outlook</a>
          {" · "}
          <a href={cal.google} target="_blank" rel="noopener noreferrer" style={{ color: "var(--teal)" }}>Google</a>
        </span>
      </div>

      {/* Discussion de la séance, bien visible */}
      <Link href={discussionHref} style={{ display: "block", textDecoration: "none", color: "inherit", background: "var(--surface-2)", borderRadius: 8, padding: "8px 12px", fontSize: 13 }}>
        {s.lastMessage ? (
          <>
            💬 <strong>{s.lastMessage.name}</strong> : {s.lastMessage.content.length > 140 ? s.lastMessage.content.slice(0, 137) + "…" : s.lastMessage.content}
            <span className="meta" style={{ display: "block", fontSize: 11, marginTop: 2 }}>{t("training_messages", { count: s.messageCount })} →</span>
          </>
        ) : (
          <span className="meta">💬 {t("training_no_message")} →</span>
        )}
      </Link>
    </div>
  );
}
