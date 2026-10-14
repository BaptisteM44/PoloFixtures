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

  const avatars = (
    <div style={{ display: "flex" }}>
      {s.attendees.slice(0, 6).map((a, i) => (
        a.photoPath
          // eslint-disable-next-line @next/next/no-img-element
          ? <img key={a.id} src={a.photoPath} alt={a.name} title={a.name} style={{ width: 24, height: 24, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--surface)", marginLeft: i ? -7 : 0 }} />
          : <span key={a.id} title={a.name} style={{ width: 24, height: 24, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, background: "var(--surface-2)", border: "2px solid var(--surface)", marginLeft: i ? -7 : 0 }}>{a.name.charAt(0).toUpperCase()}</span>
      ))}
    </div>
  );

  return (
    <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "stretch", flexWrap: "wrap" }}>
        {/* Pastille date / heure (même esprit que le compte à rebours du tournoi) */}
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          padding: "10px 14px", background: "var(--teal)", borderRight: "2px solid var(--border)",
          minWidth: 84, flexShrink: 0, color: "var(--border)",
        }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" }}>🚲 {when}</span>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 20, lineHeight: 1.1 }}>{time}</span>
        </div>

        {/* Infos + qui vient */}
        <div style={{ flex: "1 1 220px", minWidth: 0, padding: "8px 12px", display: "grid", gap: 4, alignContent: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            <Link href={discussionHref} style={{ color: "inherit", textDecoration: "none" }}>{s.title || t("training_card_title")} · {s.clubName}</Link>
            {s.place && (
              <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>
                {" · "}
                {s.mapLink ? <a href={s.mapLink} target="_blank" rel="noopener noreferrer" style={{ color: "var(--teal)" }}>📍 {s.place}</a> : <>📍 {s.place}</>}
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-muted)", flexWrap: "wrap" }}>
            {avatars}
            <span>{s.attendees.length > 0 ? t("training_count", { count: s.attendees.length }) : t("training_nobody")}</span>
            <Link href={discussionHref} style={{ color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>
              💬 {s.lastMessage
                ? <><strong>{s.lastMessage.name}</strong> : {s.lastMessage.content.length > 60 ? s.lastMessage.content.slice(0, 57) + "…" : s.lastMessage.content}</>
                : t("training_no_message")}
            </Link>
          </div>
        </div>

        {/* Réponse en un clic + agenda */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "center", gap: 4, padding: "8px 12px", flexShrink: 0 }}>
          {s.myStatus === "CONFIRMED" ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: "var(--teal)" }}>✓ {t("training_going")}</span>
              <button type="button" className="ghost" style={{ fontSize: 12, padding: "4px 10px" }} disabled={isPending}
                onClick={() => act(() => leaveSessionAction(s.clubId, s.id))}>
                {t("training_not_going")}
              </button>
            </div>
          ) : s.myStatus === "PENDING" ? (
            <span className="meta" style={{ fontSize: 12 }}>{tc("sessions_pending")}</span>
          ) : (
            <button type="button" className="primary" style={{ fontSize: 13, padding: "6px 14px" }} disabled={isPending}
              onClick={() => act(() => joinSessionAction(s.clubId, s.id))}>
              {t("training_join")}
            </button>
          )}
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            📅 <a href={cal.ics} style={{ color: "var(--teal)" }}>iPhone / Outlook</a>
            {" · "}
            <a href={cal.google} target="_blank" rel="noopener noreferrer" style={{ color: "var(--teal)" }}>Google</a>
          </span>
        </div>
      </div>
    </div>
  );
}
