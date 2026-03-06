"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { formatDate } from "@/lib/utils";

type TournamentRow = {
  id: string;
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

function getDefaultContinent(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz.startsWith("Europe/")) return "EU";
    if (tz.startsWith("America/")) {
      // Rough split: known South American timezones
      const sa = ["America/Bogota","America/Lima","America/Santiago","America/Argentina",
        "America/Sao_Paulo","America/Caracas","America/La_Paz","America/Guayaquil",
        "America/Asuncion","America/Montevideo","America/Manaus","America/Recife",
        "America/Fortaleza","America/Belem","America/Cuiaba","America/Porto_Velho"];
      return sa.some((z) => tz === z || tz.startsWith(z + "/")) ? "SA" : "NA";
    }
    if (tz.startsWith("Africa/")) return "AF";
    if (tz.startsWith("Asia/") || tz.startsWith("Pacific/Asia")) return "AS";
    if (tz.startsWith("Australia/") || tz.startsWith("Pacific/")) return "OC";
  } catch {
    // ignore
  }
  return "";
}

// ─── component ──────────────────────────────────────────────────────────────

export function TournamentBrowser({
  tournaments,
}: {
  tournaments: TournamentRow[];
}) {
  const t = useTranslations("tournaments");
  const r = useTranslations("registration");
  const locale = useLocale();

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
    { code: "LIVE", label: t("status_live") },
    { code: "UPCOMING", label: t("status_upcoming") },
    { code: "COMPLETED", label: t("status_completed") },
  ];

  const STATUS_LABELS: Record<string, string> = {
    LIVE: t("status_live"),
    UPCOMING: t("status_upcoming"),
    COMPLETED: t("status_completed"),
  };

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
  const [continent, setContinent] = useState(() => getDefaultContinent());

  const countries = [...new Set(tournaments.map((tour) => tour.country))].sort();

  const availableYears = [
    ...new Set(tournaments.map((tour) => new Date(tour.dateStart).getFullYear())),
  ].sort((a, b) => a - b);

  const availableMonthKeys = [
    ...new Set(tournaments.map((tour) => toMonthKey(tour.dateStart))),
  ].sort();

  const filtered = tournaments.filter((tour) => {
    if (continent && tour.continentCode !== continent) return false;
    if (statusFilter && tour.status !== statusFilter) return false;
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
          <div className="agenda-list">
            {group.tournaments.map((tour) => {
              const d = new Date(tour.dateStart);

              return (
                <Link key={tour.id} href={`/tournament/${tour.id}`} className={`agenda-row${tour.bannerPath ? " agenda-row--has-banner" : ""}`} style={{ textDecoration: "none", color: "inherit" }}>
                  {/* Date column */}
                  <div className="agenda-row__date">
                    <span className="agenda-row__day">{d.getDate()}</span>
                    <span className="agenda-row__month-short">
                      {d.toLocaleString(locale, { month: "short" })}
                    </span>
                  </div>

                  {/* Body */}
                  <div className="agenda-row__body">
                    <div className="agenda-row__header">
                      <h3 className="agenda-row__title">{tour.name}</h3>
                      <span className={`status ${tour.status.toLowerCase()}`}>
                        {STATUS_LABELS[tour.status] ?? tour.status}
                      </span>
                    </div>
                    <div className="agenda-row__meta-row">
                      <span className="meta">
                        {COUNTRY_FLAGS[tour.country] ?? ""} {tour.city}, {tour.country}
                      </span>
                      <span className="meta">
                        {formatDate(new Date(tour.dateStart))} →{" "}
                        {formatDate(new Date(tour.dateEnd))}
                      </span>
                      <span className="meta">
                        {tour.format} · {t("teams_slots", { count: tour.teamCount, max: tour.maxTeams })}
                      </span>
                      <span className="meta">
                        {getRegLabel(tour)}
                      </span>
                    </div>
                  </div>

                  {/* Banner — flush right, full height */}
                  {tour.bannerPath && (
                    <div className="agenda-row__banner">
                      <img src={tour.bannerPath} alt="" />
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </section>
      ))}
      </div>
    </div>
  );
}
