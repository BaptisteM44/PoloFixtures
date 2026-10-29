"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useLocale, useTranslations } from "next-intl";
import type { MapTournament } from "./TournamentMap";

const TournamentMap = dynamic(() => import("./TournamentMap"), { ssr: false });

const CONTINENT_CODES = ["", "EU", "NA", "SA", "AS", "OC", "AF"];

const FORMATS = ["1v1", "2v2", "3v3", "4v4", "5v5", "ABC", "ABC Chapeau"];

type Props = {
  tournaments: MapTournament[];
  stats?: { players: number; tournaments: number; countries: number; labels: { players: string; tournaments: string; countries: string } };
  userContinent?: string;
};

const CONTINENT_VIEW: Record<string, { center: [number, number]; zoom: number }> = {
  EU: { center: [52, 15], zoom: 3 },
  NA: { center: [45, -100], zoom: 2 },
  SA: { center: [-15, -60], zoom: 2 },
  AS: { center: [30, 95], zoom: 2 },
  OC: { center: [-28, 148], zoom: 2 },
  AF: { center: [5, 20], zoom: 2 },
};

// Dates de tournoi = jours (minuit UTC) : formatées en UTC, dans la langue de la page.
function formatDate(iso: string, locale: string) {
  return new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

// "live" | "reg_open" | "reg_closed" | "announced"
type StatusFilter = "" | "live" | "reg_open" | "reg_closed" | "announced";

function getStatusCode(t: MapTournament): StatusFilter {
  if (t.status === "LIVE") return "live";
  const now = new Date();
  if (t.registrationStart && t.registrationEnd &&
    new Date(t.registrationStart) <= now && new Date(t.registrationEnd) >= now) return "reg_open";
  if (t.registrationEnd && new Date(t.registrationEnd) < now) return "reg_closed";
  return "announced";
}

export default function TournamentMapClient({ tournaments, stats, userContinent }: Props) {
  const t = useTranslations("tournament");
  const th = useTranslations("home");
  const locale = useLocale();
  const continentLabel = (code: string) => (code ? th(`continent_${code.toLowerCase()}` as never) : t("filter_all"));
  const [selectedTournament, setSelectedTournament] = useState<MapTournament | null>(null);
  const [continent, setContinent] = useState(userContinent ?? "");
  const [format, setFormat] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");

  const STATUS_FILTERS: { code: StatusFilter; label: string; color: string }[] = [
    { code: "", label: t("filter_all"), color: "var(--teal)" },
    { code: "live", label: t("status_live"), color: "#ef4444" },
    { code: "reg_open", label: t("status_reg_open"), color: "#22c55e" },
    { code: "reg_closed", label: t("status_reg_closed"), color: "#f97316" },
    { code: "announced", label: t("status_announced"), color: "#3b82f6" },
  ];

  function getStatusLabel(tournament: MapTournament): { label: string; color: string } {
    if (tournament.status === "LIVE") return { label: t("status_live"), color: "#ef4444" };
    const now = new Date();
    if (tournament.registrationStart && tournament.registrationEnd &&
      new Date(tournament.registrationStart) <= now && new Date(tournament.registrationEnd) >= now) {
      return { label: t("status_reg_open"), color: "#22c55e" };
    }
    if (tournament.registrationEnd && new Date(tournament.registrationEnd) < now) {
      return { label: t("status_reg_closed"), color: "#f97316" };
    }
    return { label: t("status_announced"), color: "#3b82f6" };
  }

  const filtered = tournaments.filter((tournament) => {
    const continentMatch = !continent
      || tournament.continentCode === continent
      || ((continent === "AS" || continent === "OC") && tournament.continentCode === "AP");
    return continentMatch &&
      (!format || tournament.format === format) &&
      (!statusFilter || getStatusCode(tournament) === statusFilter);
  });

  const reset = () => setSelectedTournament(null);

  return (
    <section className="map-block">
      <div className="map-block__head">
        <h2>{t("map_title")}</h2>
        {stats && (
          <p className="map-block__stats">
            <strong>{stats.tournaments}</strong> {stats.labels.tournaments} · <strong>{stats.countries}</strong> {stats.labels.countries} · <strong>{stats.players}</strong> {stats.labels.players}
          </p>
        )}
      </div>

      {/* Filtres : une seule barre — continents en pastilles, format et statut en menus */}
      <div className="map-block__filters">
        <div className="map-block__continents" role="tablist">
          {CONTINENT_CODES.map((code) => (
            <button key={code || "all"} type="button" role="tab" aria-selected={continent === code}
              className={`map-chip${continent === code ? " is-on" : ""}`}
              onClick={() => { setContinent(code); reset(); }}>
              {continentLabel(code)}
            </button>
          ))}
        </div>
        <div className="map-block__selects">
          <select value={format} onChange={(e) => { setFormat(e.target.value); reset(); }} aria-label="Format">
            <option value="">{t("map_all_formats")}</option>
            {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as StatusFilter); reset(); }} aria-label={t("map_status")}>
            <option value="">{t("map_all_status")}</option>
            {STATUS_FILTERS.filter((x) => x.code).map((x) => <option key={x.code} value={x.code}>{x.label}</option>)}
          </select>
        </div>
      </div>

      <div className="map-block__map map-container-wrap">
        <TournamentMap
          tournaments={filtered}
          onSelect={setSelectedTournament}
          center={continent && CONTINENT_VIEW[continent] ? CONTINENT_VIEW[continent].center : [20, 10]}
          zoom={continent && CONTINENT_VIEW[continent] ? CONTINENT_VIEW[continent].zoom : 1}
        />

        {/* Légende, posée sur la carte */}
        <div className="map-block__legend">
          {STATUS_FILTERS.filter((x) => x.code).map((x) => (
            <span key={x.code}><i style={{ background: x.color }} />{x.label}</span>
          ))}
        </div>

        {/* Tournoi cliqué : fiche flottante */}
        {selectedTournament && (() => {
          const { label, color } = getStatusLabel(selectedTournament);
          return (
            <div className="map-block__card">
              <button type="button" className="map-block__close" onClick={reset} aria-label="✕">✕</button>
              <span className="map-block__status" style={{ background: color }}>{label}</span>
              <h3>{selectedTournament.name}</h3>
              <p>📍 {selectedTournament.city}, {selectedTournament.country}</p>
              <p>📅 {formatDate(selectedTournament.dateStart, locale)} → {formatDate(selectedTournament.dateEnd, locale)} · {selectedTournament.format}</p>
              <a href={`/${locale}/tournament/${selectedTournament.slug ?? selectedTournament.id}`} className="primary">{t("map_view_tournament")} →</a>
            </div>
          );
        })()}
      </div>
    </section>
  );
}
