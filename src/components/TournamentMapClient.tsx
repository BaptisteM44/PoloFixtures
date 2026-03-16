"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { MapTournament } from "./TournamentMap";

const TournamentMap = dynamic(() => import("./TournamentMap"), { ssr: false });

const CONTINENTS = [
  { code: "", label: "All" },
  { code: "EU", label: "Europe" },
  { code: "NA", label: "North America" },
  { code: "SA", label: "South America" },
  { code: "AP", label: "Asia / Pacific" },
  { code: "AF", label: "Africa" },
];

type Props = {
  tournaments: MapTournament[];
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function getStatusLabel(t: MapTournament): { label: string; color: string } {
  if (t.status === "LIVE") return { label: "LIVE", color: "#ef4444" };
  const now = new Date();
  if (
    t.registrationStart &&
    t.registrationEnd &&
    new Date(t.registrationStart) <= now &&
    new Date(t.registrationEnd) >= now
  ) {
    return { label: "Registrations open", color: "#22c55e" };
  }
  return { label: "Upcoming", color: "#f97316" };
}

export default function TournamentMapClient({ tournaments }: Props) {
  const [selectedTournament, setSelectedTournament] = useState<MapTournament | null>(null);
  const [selectedContinent, setSelectedContinent] = useState("");

  return (
    <section className="section">
      <div className="map-section-layout">
        {/* Map 60% */}
        <div className="map-container-wrap">
          <TournamentMap
            tournaments={tournaments}
            selectedContinent={selectedContinent || undefined}
            onSelect={setSelectedTournament}
          />
        </div>

        {/* Side panel 40% */}
        <div className="map-side-panel">
          {/* Continent filter */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {CONTINENTS.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => setSelectedContinent(c.code)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 20,
                  border: "2px solid var(--border)",
                  background: selectedContinent === c.code ? "var(--teal)" : "var(--surface)",
                  color: selectedContinent === c.code ? "var(--border)" : "var(--text)",
                  cursor: "pointer",
                  fontFamily: "var(--font-display)",
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  transition: "var(--transition)",
                }}
              >
                {c.label}
              </button>
            ))}
          </div>

          {/* Selected tournament card */}
          {selectedTournament ? (
            <div className="panel" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 16 }}>
                  {selectedTournament.name}
                </h3>
                <button
                  type="button"
                  onClick={() => setSelectedTournament(null)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 18, lineHeight: 1, padding: 0 }}
                >
                  ✕
                </button>
              </div>
              <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                {selectedTournament.city}, {selectedTournament.country}
              </div>
              <div style={{ fontSize: 13 }}>
                {formatDate(selectedTournament.dateStart)} → {formatDate(selectedTournament.dateEnd)}
              </div>
              <div>
                {(() => {
                  const { label, color } = getStatusLabel(selectedTournament);
                  return (
                    <span style={{
                      display: "inline-block",
                      padding: "3px 10px",
                      borderRadius: 12,
                      background: color,
                      color: "#fff",
                      fontSize: 11,
                      fontWeight: 700,
                      fontFamily: "var(--font-display)",
                      letterSpacing: "0.05em",
                    }}>
                      {label}
                    </span>
                  );
                })()}
              </div>
              <a href={`/tournament/${selectedTournament.id}`} className="primary" style={{ fontSize: 13 }}>
                View tournament →
              </a>
            </div>
          ) : (
            <div className="panel" style={{ padding: "20px", color: "var(--text-muted)", fontSize: 13, textAlign: "center" }}>
              <p style={{ margin: 0 }}>Click a marker on the map to see tournament details.</p>
              <p style={{ margin: "8px 0 0", fontSize: 12 }}>
                <span style={{ color: "#ef4444" }}>●</span> Live &nbsp;
                <span style={{ color: "#22c55e" }}>●</span> Registrations open &nbsp;
                <span style={{ color: "#f97316" }}>●</span> Upcoming
              </p>
            </div>
          )}

          {/* Count */}
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {tournaments.length} tournament{tournaments.length !== 1 ? "s" : ""} on the map
          </div>
        </div>
      </div>
    </section>
  );
}
