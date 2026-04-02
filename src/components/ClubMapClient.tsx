"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { Link } from "@/i18n/navigation";

const GenericMap = dynamic(() => import("./GenericMap"), { ssr: false });

export type MapClub = {
  id: string;
  name: string;
  city: string;
  country: string;
  continentCode: string;
  logoPath?: string | null;
  memberCount: number;
  lat: number;
  lng: number;
};

const CONTINENTS = [
  { code: "", label: "All" },
  { code: "EU", label: "Europe" },
  { code: "NA", label: "N. America" },
  { code: "SA", label: "S. America" },
  { code: "AS", label: "Asia" },
  { code: "OC", label: "Oceania" },
  { code: "AF", label: "Africa" },
];

const CONTINENT_VIEW: Record<string, { center: [number, number]; zoom: number }> = {
  EU: { center: [50, 10], zoom: 4 },
  NA: { center: [40, -100], zoom: 3 },
  SA: { center: [-15, -60], zoom: 3 },
  AS: { center: [30, 100], zoom: 3 },
  OC: { center: [-30, 155], zoom: 3 },
  AF: { center: [5, 20], zoom: 3 },
};

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

export function ClubMapClient({ clubs, userContinent }: { clubs: MapClub[]; userContinent?: string }) {
  const t = useTranslations("tournament");
  const [selectedClub, setSelectedClub] = useState<MapClub | null>(null);
  const [continent, setContinent] = useState(userContinent ?? "");

  const filtered = clubs.filter((c) => {
    if (!continent) return true;
    return c.continentCode === continent;
  });

  const markers = filtered.map((c) => ({
    id: c.id,
    lat: c.lat,
    lng: c.lng,
    color: "#8b5cf6",
    label: c.name,
    sublabel: `${c.city}, ${c.country}`,
  }));

  return (
    <div className="map-section-layout">
      <div className="map-container-wrap">
        <GenericMap
          markers={markers}
          onSelect={(id) => setSelectedClub(filtered.find((c) => c.id === id) ?? null)}
          {...(continent && CONTINENT_VIEW[continent] ? { center: CONTINENT_VIEW[continent].center, zoom: CONTINENT_VIEW[continent].zoom } : {})}
        />
      </div>

      <div className="map-side-panel">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 700, fontFamily: "var(--font-display)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Continent</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {CONTINENTS.map((c) => (
                <FilterBtn key={c.code} active={continent === c.code} onClick={() => { setContinent(c.code); setSelectedClub(null); }}>
                  {c.label}
                </FilterBtn>
              ))}
            </div>
          </div>
        </div>

        {selectedClub ? (
          <div className="panel" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 16 }}>{selectedClub.name}</h3>
              <button type="button" onClick={() => setSelectedClub(null)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 18, lineHeight: 1, padding: 0 }}>✕</button>
            </div>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
              {selectedClub.city}, {selectedClub.country}
            </div>
            <div style={{ fontSize: 13 }}>
              {selectedClub.memberCount} membre{selectedClub.memberCount !== 1 ? "s" : ""}
            </div>
            <Link href={`/club/${selectedClub.id}`} className="primary" style={{ fontSize: 13 }}>
              Voir le club →
            </Link>
          </div>
        ) : (
          <div className="panel" style={{ padding: "20px", color: "var(--text-muted)", fontSize: 13, textAlign: "center" }}>
            <p style={{ margin: 0 }}>{t("click_marker")}</p>
            <p style={{ margin: "8px 0 0", fontSize: 20, lineHeight: 1.8 }}>
              <span style={{ color: "#8b5cf6" }}>●</span>
            </p>
          </div>
        )}

        <div className="home-stats" style={{ justifyContent: "center" }}>
          <span><strong>{clubs.length}</strong> clubs</span>
          <span className="home-stats__dot">·</span>
          <span><strong>{new Set(clubs.map((c) => c.country)).size}</strong> pays</span>
        </div>
      </div>
    </div>
  );
}
