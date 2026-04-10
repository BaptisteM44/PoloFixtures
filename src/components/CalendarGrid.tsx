"use client";

import { useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";

export type CalendarTournament = {
  id: string;
  slug?: string | null;
  name: string;
  dateStart: string;
  dateEnd: string;
  status: string;
  city: string;
  country: string;
  continentCode?: string;
  format?: string;
};

type Props = {
  tournaments: CalendarTournament[];
  initialMonth?: number;
  initialYear?: number;
  mini?: boolean;
  defaultContinent?: string | null;
};

const MONTH_KEYS = ["january","february","march","april","may","june","july","august","september","october","november","december"] as const;
const DAY_KEYS = ["mon","tue","wed","thu","fri","sat","sun"] as const;

/* Palette to visually differentiate tournaments sharing the same dates */
const EVENT_PALETTE = [
  "#60c9cf", "#ffa2af", "#7c5cfc", "#ff8c42",
  "#5cb85c", "#e8575a", "#3498db", "#f0c040",
];

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getCalendarDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  let startDow = firstDay.getDay() - 1;
  if (startDow < 0) startDow = 6;

  const days: Array<{ date: Date; inMonth: boolean }> = [];

  for (let i = startDow - 1; i >= 0; i--) {
    days.push({ date: new Date(year, month, -i), inMonth: false });
  }
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push({ date: new Date(year, month, d), inMonth: true });
  }
  while (days.length % 7 !== 0) {
    const last = days[days.length - 1].date;
    days.push({
      date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1),
      inMonth: false,
    });
  }
  return days;
}

function fmtDate(d: Date, locale: string) {
  return d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
}

/** Label to display in the calendar event chip for a given day index within the tournament span. */
function eventDayLabel(t: CalendarTournament, dayDate: Date): string {
  const start = new Date(t.dateStart);
  start.setHours(0, 0, 0, 0);
  const diff = Math.round((dayDate.getTime() - start.getTime()) / 86400000);
  const end = new Date(t.dateEnd);
  end.setHours(0, 0, 0, 0);
  const totalDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;

  if (totalDays <= 1) return t.city;           // 1 jour → ville
  if (totalDays === 2) {
    return diff === 0 ? t.city : t.name;       // jour 1 → ville, jour 2 → nom
  }
  // 3+ jours: jour 1 → ville, jour 2 → nom, reste → format ou rien
  if (diff === 0) return t.city;
  if (diff === 1) return t.name;
  return t.format ?? "";
}

export function CalendarGrid({ tournaments, initialMonth, initialYear, mini = false, defaultContinent = null }: Props) {
  const now = new Date();
  const router = useRouter();
  const locale = useLocale();
  const tFilter = useTranslations("tournaments");
  const tCal = useTranslations("calendar");
  const [month, setMonth] = useState(initialMonth ?? now.getMonth());
  const [year, setYear] = useState(initialYear ?? now.getFullYear());
  const [continent, setContinent] = useState(() => defaultContinent ?? "");

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string, slug?: string) => {
    if (mini) { router.push(`/tournament/${slug ?? id}`); return; }
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, [mini, router]);

  const clearAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  const days = useMemo(() => getCalendarDays(year, month), [year, month]);

  const filteredTournaments = useMemo(() => {
    if (!continent) return tournaments;
    return tournaments.filter((t) => t.continentCode === continent);
  }, [tournaments, continent]);

  /* Assign each tournament a unique colour */
  const colorMap = useMemo(() => {
    const map = new Map<string, string>();
    filteredTournaments.forEach((t, i) => map.set(t.id, EVENT_PALETTE[i % EVENT_PALETTE.length]));
    return map;
  }, [filteredTournaments]);

  const tournamentsForDay = useMemo(() => {
    const map = new Map<string, CalendarTournament[]>();
    for (const day of days) {
      const key = day.date.toISOString().slice(0, 10);
      const matching = filteredTournaments.filter((t) => {
        const s = new Date(t.dateStart);
        const e = new Date(t.dateEnd);
        s.setHours(0, 0, 0, 0);
        e.setHours(23, 59, 59, 999);
        return day.date >= s && day.date <= e;
      });
      if (matching.length > 0) map.set(key, matching);
    }
    return map;
  }, [days, filteredTournaments]);

  /* Tournaments visible in the current month view (for legend) */
  const visibleTournaments = useMemo(() => {
    const seen = new Set<string>();
    const list: CalendarTournament[] = [];
    for (const [, evts] of tournamentsForDay) {
      for (const t of evts) {
        if (!seen.has(t.id)) { seen.add(t.id); list.push(t); }
      }
    }
    return list;
  }, [tournamentsForDay]);

  const prev = () => {
    if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1);
  };
  const next = () => {
    if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1);
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  /* Tournois sélectionnés, dans l'ordre de la palette */
  const expandedList = filteredTournaments.filter((t) => expandedIds.has(t.id));
  const dayNames = DAY_KEYS.map((k) => mini ? tCal(`days_mini.${k}`) : tCal(`days_short.${k}`));
  const monthNames = MONTH_KEYS.map((k) => tCal(`months.${k}`));

  const CONTINENTS = [
    { code: "", label: tFilter("filter_all_continents") },
    { code: "EU", label: tFilter("continent_eu") },
    { code: "NA", label: tFilter("continent_na") },
    { code: "SA", label: tFilter("continent_sa") },
    { code: "AS", label: tFilter("continent_as") },
    { code: "OC", label: tFilter("continent_oc") },
    { code: "AF", label: tFilter("continent_af") },
  ];

  const calendarContent = (
    <div className={`calendar${mini ? " calendar--mini" : ""}`}>
      {!mini && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            {CONTINENTS.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => { setContinent(c.code); setExpandedIds(new Set()); }}
                style={{
                  padding: "5px 12px",
                  borderRadius: 20,
                  border: "2px solid var(--border)",
                  background: continent === c.code ? "var(--teal)" : "var(--surface)",
                  color: continent === c.code ? "var(--bg)" : "var(--text)",
                  cursor: "pointer",
                  fontFamily: "var(--font-display)",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  transition: "var(--transition)",
                  whiteSpace: "nowrap",
                }}
              >
                {c.label}
              </button>
            ))}
            <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: "auto" }}>
              {tCal("tournament_count", { count: filteredTournaments.length })}
            </span>
          </div>
        </div>
      )}
      <div className="calendar-header">
        <button type="button" className="ghost calendar-nav" onClick={prev}>←</button>
        <span className="calendar-title">{monthNames[month]} {year}</span>
        <button type="button" className="ghost calendar-nav" onClick={next}>→</button>
      </div>

      <div className="calendar-grid">
        {dayNames.map((n, i) => (
          <div key={i} className="calendar-day-name">{n}</div>
        ))}

        {days.map(({ date, inMonth }, i) => {
          const key = date.toISOString().slice(0, 10);
          const events = tournamentsForDay.get(key) ?? [];
          const isToday = isSameDay(date, today);

          return (
            <div
              key={i}
              className={`calendar-day${!inMonth ? " calendar-day--outside" : ""}${isToday ? " calendar-day--today" : ""}${events.length > 0 ? " calendar-day--has-events" : ""}`}
            >
              <span className="calendar-day__number">{date.getDate()}</span>
              {events.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`calendar-event${expandedIds.has(t.id) ? " calendar-event--active" : ""}`}
                  style={{ background: colorMap.get(t.id) }}
                  title={`${t.name} — ${t.city}, ${t.country}`}
                  onClick={() => toggle(t.id, t.slug ?? undefined)}
                >
                  {eventDayLabel(t, date)}
                </button>
              ))}
            </div>
          );
        })}
      </div>

      {/* Legend (full mode only) */}
      {!mini && visibleTournaments.length > 0 && (
        <div className="calendar-legend">
          {visibleTournaments.slice(0, 8).map((t) => (
            <span key={t.id}>
              <span className="calendar-legend__dot" style={{ background: colorMap.get(t.id) }} />
              {t.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );

  /* Mini mode: rendu simple sans sidebar */
  if (mini) return calendarContent;

  /* Une carte d'info réutilisable */
  const InfoCard = ({ t }: { t: CalendarTournament }) => (
    <div className="calendar-expand" style={{ borderLeftColor: colorMap.get(t.id) }}>
      <div className="calendar-expand__header">
        <h4>{t.name}</h4>
        <button type="button" className="ghost calendar-expand__close" onClick={() => toggle(t.id)}>✕</button>
      </div>
      <p className="calendar-expand__meta">📍 {t.city}, {t.country}</p>
      <p className="calendar-expand__meta">
        📅 {fmtDate(new Date(t.dateStart), locale)} — {fmtDate(new Date(t.dateEnd), locale)}
      </p>
      {t.format && <p className="calendar-expand__meta">🏆 {tCal("label_format")} : {t.format}</p>}
      <p className="calendar-expand__meta">
        🔴 {tCal("label_status")} : {tCal(`status_${t.status.toLowerCase()}` as any)}
      </p>
      <Link href={`/tournament/${t.slug ?? t.id}`} className="calendar-expand__link">
        {tCal("link_view_tournament")}
      </Link>
    </div>
  );

  /* Full mode: layout côte-à-côte + modal mobile */
  return (
    <>
      <div className="calendar-layout">
        <div className="calendar-main">{calendarContent}</div>
        <div className="calendar-sidebar">
          {expandedList.map((t) => <InfoCard key={t.id} t={t} />)}
          {Array.from({ length: Math.max(0, 3 - expandedList.length) }).map((_, i) => (
            <div key={`ghost-${i}`} className="calendar-expand calendar-expand--ghost" />
          ))}
        </div>
      </div>

      {/* Modal bottom-sheet — mobile/tablette uniquement (CSS gère l'affichage) */}
      {expandedList.length > 0 && (
        <div className="cal-modal-overlay" onClick={clearAll}>
          <div className="cal-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cal-modal-handle" />
            {expandedList.map((t) => (
              <div key={t.id} className="cal-modal-card" style={{ borderLeftColor: colorMap.get(t.id) }}>
                <div className="calendar-expand__header">
                  <h4>{t.name}</h4>
                  <button type="button" className="ghost calendar-expand__close" onClick={() => toggle(t.id)}>✕</button>
                </div>
                <p className="calendar-expand__meta">📍 {t.city}, {t.country}</p>
                <p className="calendar-expand__meta">
                  📅 {fmtDate(new Date(t.dateStart), locale)} — {fmtDate(new Date(t.dateEnd), locale)}
                </p>
                {t.format && <p className="calendar-expand__meta">🏆 {tCal("label_format")} : {t.format}</p>}
                <p className="calendar-expand__meta" style={{ textTransform: "capitalize" }}>
                  🔴 {tCal("label_status")} : {t.status.toLowerCase()}
                </p>
                <Link href={`/tournament/${t.slug ?? t.id}`} className="calendar-expand__link">
                  {tCal("link_view_tournament")}
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
