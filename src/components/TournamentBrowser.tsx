"use client";

import { useState } from "react";
import Link from "next/link";
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

const CONTINENTS = [
  { code: "", label: "Tous les continents" },
  { code: "NA", label: "North America" },
  { code: "SA", label: "South America" },
  { code: "EU", label: "Europe" },
  { code: "AF", label: "Africa" },
  { code: "AS", label: "Asia" },
  { code: "OC", label: "Oceania" },
];

const STATUSES = [
  { code: "", label: "Tous les statuts" },
  { code: "LIVE", label: "En cours" },
  { code: "UPCOMING", label: "À venir" },
  { code: "COMPLETED", label: "Terminés" },
];

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

function monthKeyLabel(key: string): string {
  const [year, month] = key.split("-");
  return new Date(Number(year), Number(month) - 1, 1).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
}

type MonthGroup = { key: string; label: string; tournaments: TournamentRow[] };

function groupByMonth(items: TournamentRow[]): MonthGroup[] {
  const map = new Map<string, TournamentRow[]>();
  for (const t of items) {
    const key = toMonthKey(t.dateStart);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(t);
  }
  return [...map.entries()].map(([key, ts]) => ({
    key,
    label: monthKeyLabel(key),
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
  const [continent, setContinent] = useState(() => getDefaultContinent());
  const [statusFilter, setStatusFilter] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [yearFilter, setYearFilter] = useState(() => getDefaultYear());
  const [monthFilter, setMonthFilter] = useState("");

  const countries = [...new Set(tournaments.map((t) => t.country))].sort();

  const availableYears = [
    ...new Set(tournaments.map((t) => new Date(t.dateStart).getFullYear())),
  ].sort((a, b) => a - b);

  const availableMonthKeys = [
    ...new Set(tournaments.map((t) => toMonthKey(t.dateStart))),
  ].sort();

  const filtered = tournaments.filter((t) => {
    if (continent && t.continentCode !== continent) return false;
    if (statusFilter && t.status !== statusFilter) return false;
    if (countryFilter && t.country !== countryFilter) return false;
    if (monthFilter && toMonthKey(t.dateStart) !== monthFilter) return false;
    if (
      yearFilter &&
      !monthFilter &&
      new Date(t.dateStart).getFullYear() !== Number(yearFilter)
    )
      return false;
    return true;
  });

  const sorted = [...filtered].sort(
    (a, b) => new Date(a.dateStart).getTime() - new Date(b.dateStart).getTime()
  );

  const groups = groupByMonth(sorted);

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
          <option value="">Tous les pays</option>
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
          <option value="">Toutes les années</option>
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
          <option value="">Tous les mois</option>
          {availableMonthKeys
            .filter((k) => !yearFilter || k.startsWith(yearFilter))
            .map((k) => (
              <option key={k} value={k}>
                {monthKeyLabel(k)}
              </option>
            ))}
        </select>

        <span
          style={{ fontSize: 13, color: "var(--text-muted)", marginLeft: "auto" }}
        >
          {filtered.length} tournoi{filtered.length > 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Agenda groups ── */}
      <div>
      {groups.length === 0 && (
        <div className="empty-state">
          <p>Aucun tournoi ne correspond à ces filtres.</p>
        </div>
      )}

      {groups.map((group) => (
        <section key={group.key} className="agenda-month">
          <h2 className="agenda-month__heading">{group.label}</h2>
          <div className="agenda-list">
            {group.tournaments.map((t) => {
              const d = new Date(t.dateStart);

              return (
                <Link key={t.id} href={`/tournament/${t.id}`} className={`agenda-row${t.bannerPath ? " agenda-row--has-banner" : ""}`} style={{ textDecoration: "none", color: "inherit" }}>
                  {/* Date column */}
                  <div className="agenda-row__date">
                    <span className="agenda-row__day">{d.getDate()}</span>
                    <span className="agenda-row__month-short">
                      {d.toLocaleString("en-US", { month: "short" })}
                    </span>
                  </div>

                  {/* Body */}
                  <div className="agenda-row__body">
                    <div className="agenda-row__header">
                      <h3 className="agenda-row__title">{t.name}</h3>
                      <span className={`status ${t.status.toLowerCase()}`}>
                        {t.status}
                      </span>
                    </div>
                    <div className="agenda-row__meta-row">
                      <span className="meta">
                        {COUNTRY_FLAGS[t.country] ?? ""} {t.city}, {t.country}
                      </span>
                      <span className="meta">
                        {formatDate(new Date(t.dateStart))} →{" "}
                        {formatDate(new Date(t.dateEnd))}
                      </span>
                      <span className="meta">
                        {t.format} · {t.teamCount}/{t.maxTeams} équipes
                      </span>
                      <span className="meta">
                        {(() => {
                          const now = new Date();
                          const fmt = (d: string) =>
                            new Date(d).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
                          if (t.registrationEnd) {
                            const end = new Date(t.registrationEnd);
                            if (now > end) return "🔒 Inscriptions fermées";
                            if (t.registrationStart && now < new Date(t.registrationStart)) {
                              const daysToOpen = Math.ceil((new Date(t.registrationStart).getTime() - now.getTime()) / 86_400_000);
                              return `🔓 Ouverture ${daysToOpen <= 1 ? "demain" : `dans ${daysToOpen}j`} (${fmt(t.registrationStart)})`;
                            }
                            const daysLeft = Math.ceil((end.getTime() - now.getTime()) / 86_400_000);
                            const countdown = daysLeft <= 1 ? "🔥 Dernier jour" : daysLeft <= 7 ? `🔥 J-${daysLeft}` : `⏳ J-${daysLeft}`;
                            return `${countdown} · Clôture le ${fmt(t.registrationEnd)}`;
                          }
                          if (t.registrationStart) {
                            const start = new Date(t.registrationStart);
                            if (now < start) {
                              const daysToOpen = Math.ceil((start.getTime() - now.getTime()) / 86_400_000);
                              return `🔓 Ouverture ${daysToOpen <= 1 ? "demain" : `dans ${daysToOpen}j`} (${fmt(t.registrationStart)})`;
                            }
                            return "🔓 Inscriptions ouvertes";
                          }
                          return "—";
                        })()}
                      </span>
                    </div>
                  </div>

                  {/* Banner — flush right, full height */}
                  {t.bannerPath && (
                    <div className="agenda-row__banner">
                      <img src={t.bannerPath} alt="" />
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
