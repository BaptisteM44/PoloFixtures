"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { MapTournament } from "./TournamentMap";

const TournamentMap = dynamic(() => import("./TournamentMap"), { ssr: false });

const CONTINENTS = [
  { code: "", label: "All" },
  { code: "EU", label: "Europe" },
  { code: "NA", label: "N. America" },
  { code: "SA", label: "S. America" },
  { code: "AP", label: "Asia/Pacific" },
  { code: "AF", label: "Africa" },
];

const FORMATS = ["2v2", "3v3", "4v4", "5v5", "ABC", "ABC Chapeau"];

type Props = { tournaments: MapTournament[] };

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function getStatusLabel(t: MapTournament): { label: string; color: string } {
  if (t.status === "LIVE") return { label: "En cours", color: "#ef4444" };
  const now = new Date();
  // Inscriptions ouvertes
  if (t.registrationStart && t.registrationEnd &&
    new Date(t.registrationStart) <= now && new Date(t.registrationEnd) >= now) {
    return { label: "Inscriptions ouvertes", color: "#22c55e" };
  }
  // Inscriptions fermées (reg passée)
  if (t.registrationEnd && new Date(t.registrationEnd) < now) {
    return { label: "Inscriptions fermées", color: "#f97316" };
  }
  // Annoncé (pas encore ouvert aux inscriptions)
  return { label: "Annoncé", color: "#3b82f6" };
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

// "live" | "reg_open" | "reg_closed" | "announced"
type StatusFilter = "" | "live" | "reg_open" | "reg_closed" | "announced";

const STATUS_FILTERS: { code: StatusFilter; label: string; color: string }[] = [
  { code: "", label: "Tous", color: "var(--teal)" },
  { code: "live", label: "En cours", color: "#ef4444" },
  { code: "reg_open", label: "Inscriptions ouvertes", color: "#22c55e" },
  { code: "reg_closed", label: "Inscriptions fermées", color: "#f97316" },
  { code: "announced", label: "Annoncé", color: "#3b82f6" },
];

function getStatusCode(t: MapTournament): StatusFilter {
  if (t.status === "LIVE") return "live";
  const now = new Date();
  if (t.registrationStart && t.registrationEnd &&
    new Date(t.registrationStart) <= now && new Date(t.registrationEnd) >= now) return "reg_open";
  if (t.registrationEnd && new Date(t.registrationEnd) < now) return "reg_closed";
  return "announced";
}

export default function TournamentMapClient({ tournaments }: Props) {
  const [selectedTournament, setSelectedTournament] = useState<MapTournament | null>(null);
  const [continent, setContinent] = useState("");
  const [format, setFormat] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");

  const filtered = tournaments.filter((t) =>
    (!continent || t.continentCode === continent) &&
    (!format || t.format === format) &&
    (!statusFilter || getStatusCode(t) === statusFilter)
  );

  return (
    <section className="section">
      <div className="map-section-layout">
        {/* Map */}
        <div className="map-container-wrap">
          <TournamentMap
            tournaments={filtered}
            onSelect={setSelectedTournament}
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
                <FilterBtn active={format === ""} onClick={() => { setFormat(""); setSelectedTournament(null); }}>Tous</FilterBtn>
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
              <a href={`/tournament/${selectedTournament.id}`} className="primary" style={{ fontSize: 13 }}>
                View tournament →
              </a>
            </div>
          ) : (
            <div className="panel" style={{ padding: "20px", color: "var(--text-muted)", fontSize: 13, textAlign: "center" }}>
              <p style={{ margin: 0 }}>Cliquez sur un marqueur pour voir les détails.</p>
              <p style={{ margin: "8px 0 0", fontSize: 12, lineHeight: 1.8 }}>
                <span style={{ color: "#ef4444" }}>●</span> En cours &nbsp;
                <span style={{ color: "#22c55e" }}>●</span> Inscriptions ouvertes &nbsp;
                <span style={{ color: "#f97316" }}>●</span> Inscriptions fermées &nbsp;
                <span style={{ color: "#3b82f6" }}>●</span> Annoncé
              </p>
            </div>
          )}

          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {filtered.length} tournament{filtered.length !== 1 ? "s" : ""} on the map
          </div>
        </div>
      </div>
    </section>
  );
}
