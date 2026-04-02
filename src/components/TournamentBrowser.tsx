"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { FollowButton } from "@/components/FollowButton";
import { getTournamentStatusBadge } from "@/components/TournamentCard";

type TournamentRow = {
  id: string;
  slug?: string | null;
  name: string;
  continentCode: string;
  country: string;
  city: string;
  dateStart: string;
  dateEnd: string;
  format: string;
  status: string;
  maxTeams: number;
  teamCount: number;
  registrationStart: string | null;
  registrationEnd: string | null;
  bannerPath: string | null;
};

const COUNTRY_FLAGS: Record<string, string> = {
  France: "🇫🇷", "United States": "🇺🇸", "United Kingdom": "🇬🇧",
  Germany: "🇩🇪", Spain: "🇪🇸", Italy: "🇮🇹", Belgium: "🇧🇪",
  Netherlands: "🇳🇱", Canada: "🇨🇦", Australia: "🇦🇺",
  Switzerland: "🇨🇭", Poland: "🇵🇱", "Czech Republic": "🇨🇿", Austria: "🇦🇹",
  Portugal: "🇵🇹", Sweden: "🇸🇪", Denmark: "🇩🇰", Finland: "🇫🇮",
  Norway: "🇳🇴", Japan: "🇯🇵", Brazil: "🇧🇷", Argentina: "🇦🇷",
  Mexico: "🇲🇽", Colombia: "🇨🇴", Chile: "🇨🇱", "New Zealand": "🇳🇿",
  Ireland: "🇮🇪", Israel: "🇮🇱", Turkey: "🇹🇷", Greece: "🇬🇷",
  Hungary: "🇭🇺", Romania: "🇷🇴", Croatia: "🇭🇷", Slovakia: "🇸🇰",
  Slovenia: "🇸🇮", Serbia: "🇷🇸", Ukraine: "🇺🇦", Russia: "🇷🇺",
  "South Africa": "🇿🇦", India: "🇮🇳", China: "🇨🇳", "South Korea": "🇰🇷",
  Taiwan: "🇹🇼", Singapore: "🇸🇬", Thailand: "🇹🇭", Philippines: "🇵🇭",
};

// ─── helpers ────────────────────────────────────────────────────────────────

function toMonthKey(dateStart: string): string {
  const d = new Date(dateStart);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthKeyLabel(key: string, locale: string): string {
  const [year, month] = key.split("-");
  return new Date(Number(year), Number(month) - 1, 1).toLocaleString(locale, {
    month: "long",
    year: "numeric",
  });
}

type MonthGroup = { key: string; label: string; tournaments: TournamentRow[] };

function groupByMonth(items: TournamentRow[], locale: string): MonthGroup[] {
  const map = new Map<string, TournamentRow[]>();
  for (const t of items) {
    const key = toMonthKey(t.dateStart);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(t);
  }
  return [...map.entries()].map(([key, ts]) => ({
    key,
    label: monthKeyLabel(key, locale),
    tournaments: ts,
  }));
}

// ─── smart defaults ─────────────────────────────────────────────────────────

function getDefaultYear(): string {
  const now = new Date();
  // From October onward, show next year by default (season shift)
  return String(now.getMonth() >= 9 ? now.getFullYear() + 1 : now.getFullYear());
}


// ─── component ──────────────────────────────────────────────────────────────

export function TournamentBrowser({
  tournaments,
  defaultContinent = null,
  isLoggedIn = false,
  followedIds = [],
}: {
  tournaments: TournamentRow[];
  defaultContinent?: string | null;
  isLoggedIn?: boolean;
  followedIds?: string[];
}) {
  const t = useTranslations("tournaments");
  const r = useTranslations("registration");
  const locale = useLocale();
  const statusLabels = {
    live: t("status_live"),
    completed: t("status_completed"),
    reg_open: t("status_reg_open"),
    reg_closed: t("status_reg_closed"),
    announced: t("status_announced"),
  };

  const CONTINENTS = [
    { code: "", label: t("filter_all_continents") },
    { code: "NA", label: t("continent_na") },
    { code: "SA", label: t("continent_sa") },
    { code: "EU", label: t("continent_eu") },
    { code: "AF", label: t("continent_af") },
    { code: "AS", label: t("continent_as") },
    { code: "OC", label: t("continent_oc") },
  ];

  const STATUSES = [
    { code: "", label: t("filter_all_statuses") },
    { code: "live", label: t("status_live") },
    { code: "reg-open", label: t("status_reg_open") },
    { code: "reg-closed", label: t("status_reg_closed") },
    { code: "announced", label: t("status_announced") },
    { code: "completed", label: t("status_completed") },
  ];

  const getRegLabel = (item: TournamentRow): string => {
    const now = new Date();
    const fmt = (d: string) =>
      new Date(d).toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    if (item.registrationEnd) {
      const end = new Date(item.registrationEnd);
      if (now > end) return r("reg_badge_closed");
      if (item.registrationStart && now < new Date(item.registrationStart)) {
        const daysToOpen = Math.ceil((new Date(item.registrationStart).getTime() - now.getTime()) / 86_400_000);
        const openLabel = daysToOpen <= 1 ? r("reg_badge_opens_tomorrow") : r("reg_badge_opens_in_days", { days: daysToOpen });
        return `${openLabel} (${fmt(item.registrationStart)})`;
      }
      const daysLeft = Math.ceil((end.getTime() - now.getTime()) / 86_400_000);
      const countdown = daysLeft <= 1 ? r("reg_badge_last_day") : daysLeft <= 7 ? `🔥 J-${daysLeft}` : r("reg_badge_days_left", { days: daysLeft });
      return `${countdown} · ${r("reg_badge_closes_on", { date: fmt(item.registrationEnd) })}`;
    }
    if (item.registrationStart) {
      const start = new Date(item.registrationStart);
      if (now < start) {
        const daysToOpen = Math.ceil((start.getTime() - now.getTime()) / 86_400_000);
        const openLabel = daysToOpen <= 1 ? r("reg_badge_opens_tomorrow") : r("reg_badge_opens_in_days", { days: daysToOpen });
        return `${openLabel} (${fmt(item.registrationStart)})`;
      }
      return r("reg_badge_open");
    }
    return "—";
  };
  const [statusFilter, setStatusFilter] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [yearFilter, setYearFilter] = useState(() => getDefaultYear());
  const [monthFilter, setMonthFilter] = useState("");
  const [continent, setContinent] = useState(() => defaultContinent ?? "");

  const countries = [...new Set(tournaments.map((tour) => tour.country))].sort();

  const availableYears = [
    ...new Set(tournaments.map((tour) => new Date(tour.dateStart).getFullYear())),
  ].sort((a, b) => a - b);

  const availableMonthKeys = [
    ...new Set(tournaments.map((tour) => toMonthKey(tour.dateStart))),
  ].sort();

  const filtered = tournaments.filter((tour) => {
    if (continent && tour.continentCode !== continent) return false;
    if (statusFilter) {
      const { cls } = getTournamentStatusBadge(tour.status, tour.registrationStart, tour.registrationEnd);
      if (cls !== statusFilter) return false;
    }
    if (countryFilter && tour.country !== countryFilter) return false;
    if (monthFilter && toMonthKey(tour.dateStart) !== monthFilter) return false;
    if (
      yearFilter &&
      !monthFilter &&
      new Date(tour.dateStart).getFullYear() !== Number(yearFilter)
    )
      return false;
    return true;
  });

  const sorted = [...filtered].sort(
    (a, b) => new Date(a.dateStart).getTime() - new Date(b.dateStart).getTime()
  );

  const groups = groupByMonth(sorted, locale);

  return (
    <div>
      {/* ── Filters ── */}
      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 28,
          alignItems: "center",
        }}
      >
        <select
          value={continent}
          onChange={(e) => setContinent(e.target.value)}
        >
          {CONTINENTS.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>

        <select
          value={countryFilter}
          onChange={(e) => setCountryFilter(e.target.value)}
        >
          <option value="">{t("filter_all_countries")}</option>
          {countries.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          {STATUSES.map((s) => (
            <option key={s.code} value={s.code}>
              {s.label}
            </option>
          ))}
        </select>

        {/* Year filter */}
        <select
          value={yearFilter}
          onChange={(e) => {
            const y = e.target.value;
            setYearFilter(y);
            if (monthFilter && !monthFilter.startsWith(y)) setMonthFilter("");
          }}
        >
          <option value="">{t("filter_all_years")}</option>
          {availableYears.map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </select>

        {/* Month filter */}
        <select
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
        >
          <option value="">{t("filter_all_months")}</option>
          {availableMonthKeys
            .filter((k) => !yearFilter || k.startsWith(yearFilter))
            .map((k) => (
              <option key={k} value={k}>
                {monthKeyLabel(k, locale)}
              </option>
            ))}
        </select>

        <span
          style={{ fontSize: 13, color: "var(--text-muted)", marginLeft: "auto" }}
        >
          {filtered.length === 1 ? t("filter_count_one", { count: filtered.length }) : t("filter_count_other", { count: filtered.length })}
        </span>
      </div>

      {/* ── Agenda groups ── */}
      <div>
      {groups.length === 0 && (
        <div className="empty-state">
          <p>{t("empty_no_match")}</p>
        </div>
      )}

      {groups.map((group) => (
        <section key={group.key} className="agenda-month">
          <h2 className="agenda-month__heading">{group.label}</h2>
          <div className="tournament-grid">
            {group.tournaments.map((tour) => {
              const dStart = new Date(tour.dateStart);
              const dEnd = new Date(tour.dateEnd);
              const dayStart = dStart.getDate();
              const monthStart = dStart.toLocaleString(locale, { month: "short" });
              const dayEnd = dEnd.getDate();
              const monthEnd = dEnd.toLocaleString(locale, { month: "short" });
              const sameDay = dayStart === dayEnd && monthStart === monthEnd;
              const { label: statusLabel, cls: statusCls } = getTournamentStatusBadge(tour.status, tour.registrationStart, tour.registrationEnd, statusLabels);

              return (
                <div key={tour.id} className={`tournament-card-wrapper${tour.bannerPath ? " tournament-card-wrapper--has-banner" : ""}`}>
                  <Link className={`tournament-card${tour.bannerPath ? " tournament-card--has-banner" : ""}`} href={`/tournament/${tour.slug ?? tour.id}`}>
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
                        <h3>{tour.name}</h3>
                        <span className={`status ${statusCls}`}>{statusLabel}</span>
                      </div>
                      <p className="tournament-card__location">📍 {tour.city}, {tour.country}</p>
                      <p className="meta">{tour.format} · {t("teams_slots", { count: tour.teamCount, max: tour.maxTeams })}</p>
                    </div>

                    {/* Banner full height */}
                    {tour.bannerPath && (
                      <div className="tournament-card__banner">
                        <img src={tour.bannerPath} alt="" />
                      </div>
                    )}
                  </Link>

                  {/* Follow button — outside the link */}
                  <div className="tournament-card__follow">
                    <FollowButton
                      tournamentId={tour.id}
                      initialFollowing={followedIds.includes(tour.id)}
                      isLoggedIn={isLoggedIn}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
      </div>
    </div>
  );
}
