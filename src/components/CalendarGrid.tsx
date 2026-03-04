"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export type CalendarTournament = {
  id: string;
  name: string;
  dateStart: string;
  dateEnd: string;
  status: string;
  city: string;
  country: string;
  format?: string;
};

type Props = {
  tournaments: CalendarTournament[];
  initialMonth?: number;
  initialYear?: number;
  mini?: boolean;
};

const DAY_NAMES = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const DAY_NAMES_SHORT = ["L", "M", "M", "J", "V", "S", "D"];
const MONTH_NAMES = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

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

function fmtFR(d: Date) {
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

export function CalendarGrid({ tournaments, initialMonth, initialYear, mini = false }: Props) {
  const now = new Date();
  const [month, setMonth] = useState(initialMonth ?? now.getMonth());
  const [year, setYear] = useState(initialYear ?? now.getFullYear());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const days = useMemo(() => getCalendarDays(year, month), [year, month]);

  /* Assign each tournament a unique colour */
  const colorMap = useMemo(() => {
    const map = new Map<string, string>();
    tournaments.forEach((t, i) => map.set(t.id, EVENT_PALETTE[i % EVENT_PALETTE.length]));
    return map;
  }, [tournaments]);

  const tournamentsForDay = useMemo(() => {
    const map = new Map<string, CalendarTournament[]>();
    for (const day of days) {
      const key = day.date.toISOString().slice(0, 10);
      const matching = tournaments.filter((t) => {
        const s = new Date(t.dateStart);
        const e = new Date(t.dateEnd);
        s.setHours(0, 0, 0, 0);
        e.setHours(23, 59, 59, 999);
        return day.date >= s && day.date <= e;
      });
      if (matching.length > 0) map.set(key, matching);
    }
    return map;
  }, [days, tournaments]);

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
    setExpandedId(null);
    if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1);
  };
  const next = () => {
    setExpandedId(null);
    if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1);
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expanded = expandedId ? tournaments.find((t) => t.id === expandedId) ?? null : null;
  const dayNames = mini ? DAY_NAMES_SHORT : DAY_NAMES;

  const calendarContent = (
    <div className={`calendar${mini ? " calendar--mini" : ""}`}>
      <div className="calendar-header">
        <button type="button" className="ghost calendar-nav" onClick={prev}>←</button>
        <span className="calendar-title">{MONTH_NAMES[month]} {year}</span>
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
                  className={`calendar-event${expandedId === t.id ? " calendar-event--active" : ""}`}
                  style={{ background: colorMap.get(t.id) }}
                  title={`${t.name} — ${t.city}, ${t.country}`}
                  onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                >
                  {`${t.name} · ${t.city}`}
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

  /* Full mode: layout côte-à-côte */
  return (
    <div className="calendar-layout">
      <div className="calendar-main">{calendarContent}</div>

      <div className="calendar-sidebar">
        {expanded ? (
          <div className="calendar-expand" style={{ borderLeftColor: colorMap.get(expanded.id) }}>
            <div className="calendar-expand__header">
              <h4>{expanded.name}</h4>
              <button type="button" className="ghost calendar-expand__close" onClick={() => setExpandedId(null)}>✕</button>
            </div>
            <p className="calendar-expand__meta">📍 {expanded.city}, {expanded.country}</p>
            <p className="calendar-expand__meta">
              📅 {fmtFR(new Date(expanded.dateStart))} — {fmtFR(new Date(expanded.dateEnd))}
            </p>
            {expanded.format && <p className="calendar-expand__meta">🏆 Format : {expanded.format}</p>}
            <p className="calendar-expand__meta" style={{ textTransform: "capitalize" }}>
              🔴 Statut : {expanded.status.toLowerCase()}
            </p>
            <Link href={`/tournament/${expanded.id}`} className="calendar-expand__link">
              Voir le tournoi →
            </Link>
          </div>
        ) : (
          <div className="calendar-sidebar-placeholder">
            <span>👆</span>
            <p>Cliquez sur un tournoi dans le calendrier pour voir ses informations</p>
          </div>
        )}
      </div>
    </div>
  );
}
