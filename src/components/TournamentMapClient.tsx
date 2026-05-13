"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import type { MapTournament } from "./TournamentMap";

const TournamentMap = dynamic(() => import("./TournamentMap"), { ssr: false });

const CONTINENTS = [
  { code: "", label: "All" },
  { code: "EU", label: "Europe" },
  { code: "NA", label: "N. America" },
  { code: "SA", label: "S. America" },
  { code: "AS", label: "Asia" },
  { code: "OC", label: "Oceania" },
  { code: "AF", label: "Africa" },
];

const FORMATS = ["2v2", "3v3", "4v4", "5v5", "ABC", "ABC Chapeau"];

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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
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

function FilterBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "5px 12px",
        borderRadius: 20,
        border: "2px solid var(--border)",
        background: active ? "var(--teal)" : "var(--surface)",
        color: active ? "var(--bg)" : "var(--text)",
        cursor: "pointer",
        fontFamily: "var(--font-display)",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.04em",
        transition: "var(--transition)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

export default function TournamentMapClient({ tournaments, stats, userContinent }: Props) {
  const t = useTranslations("tournament");
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

  return (
    <section>
      <div className="map-section-layout">
        {/* Map */}
        <div className="map-container-wrap">
          <TournamentMap
            tournaments={filtered}
            onSelect={setSelectedTournament}
            center={continent && CONTINENT_VIEW[continent] ? CONTINENT_VIEW[continent].center : [20, 10]}
            zoom={continent && CONTINENT_VIEW[continent] ? CONTINENT_VIEW[continent].zoom : 1}
          />
        </div>

        {/* Side panel */}
        <div className="map-side-panel">

          {/* Filters */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Continent */}
            <div>
              <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 700, fontFamily: "var(--font-display)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Continent</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {CONTINENTS.map((c) => (
                  <FilterBtn key={c.code} active={continent === c.code} onClick={() => { setContinent(c.code); setSelectedTournament(null); }}>
                    {c.label}
                  </FilterBtn>
                ))}
              </div>
            </div>

            {/* Format */}
            <div>
              <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 700, fontFamily: "var(--font-display)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Format</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <FilterBtn active={format === ""} onClick={() => { setFormat(""); setSelectedTournament(null); }}>{t("filter_all")}</FilterBtn>
                {FORMATS.map((f) => (
                  <FilterBtn key={f} active={format === f} onClick={() => { setFormat(f); setSelectedTournament(null); }}>
                    {f}
                  </FilterBtn>
                ))}
              </div>
            </div>

            {/* Statut */}
            <div>
              <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 700, fontFamily: "var(--font-display)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Statut</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {STATUS_FILTERS.map((s) => (
                  <FilterBtn key={s.code} active={statusFilter === s.code} onClick={() => { setStatusFilter(s.code); setSelectedTournament(null); }}>
                    {s.code !== "" && <span style={{ color: s.color, marginRight: 4 }}>●</span>}
                    {s.label}
                  </FilterBtn>
                ))}
              </div>
            </div>
          </div>

          {/* Tournament card */}
          {selectedTournament ? (
            <div className="panel" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 16 }}>{selectedTournament.name}</h3>
                <button type="button" onClick={() => setSelectedTournament(null)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 18, lineHeight: 1, padding: 0 }}>✕</button>
              </div>
              <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                📍 {selectedTournament.city}, {selectedTournament.country}
              </div>
              <div style={{ fontSize: 13 }}>
                📅 {formatDate(selectedTournament.dateStart)} → {formatDate(selectedTournament.dateEnd)}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {(() => {
                  const { label, color } = getStatusLabel(selectedTournament);
                  return (
                    <span style={{ padding: "3px 10px", borderRadius: 12, background: color, color: "#fff", fontSize: 11, fontWeight: 700, fontFamily: "var(--font-display)", letterSpacing: "0.05em" }}>
                      {label}
                    </span>
                  );
                })()}
                <span style={{ padding: "3px 10px", borderRadius: 12, background: "var(--surface-2)", border: "1.5px solid var(--border)", fontSize: 11, fontWeight: 700, fontFamily: "var(--font-display)" }}>
                  {selectedTournament.format}
                </span>
              </div>
              <a href={`/tournament/${selectedTournament.slug ?? selectedTournament.id}`} className="primary" style={{ fontSize: 13 }}>
                View tournament →
              </a>
            </div>
          ) : (
            <div className="panel" style={{ padding: "20px", color: "var(--text-muted)", fontSize: 13, textAlign: "center" }}>
              <p style={{ margin: 0 }}>{t("click_marker")}</p>
              <p style={{ margin: "8px 0 0", fontSize: 12, lineHeight: 1.8 }}>
                <span style={{ color: "#ef4444" }}>●</span> {t("status_live")} &nbsp;
                <span style={{ color: "#22c55e" }}>●</span> {t("status_reg_open")} &nbsp;
                <span style={{ color: "#f97316" }}>●</span> {t("status_reg_closed")} &nbsp;
                <span style={{ color: "#3b82f6" }}>●</span> {t("status_announced")}
              </p>
            </div>
          )}

          {stats && (
            <div className="home-stats" style={{ justifyContent: "center" }}>
              <span><strong>{stats.players}</strong> {stats.labels.players}</span>
              <span className="home-stats__dot">·</span>
              <span><strong>{stats.tournaments}</strong> {stats.labels.tournaments}</span>
              <span className="home-stats__dot">·</span>
              <span><strong>{stats.countries}</strong> {stats.labels.countries}</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
