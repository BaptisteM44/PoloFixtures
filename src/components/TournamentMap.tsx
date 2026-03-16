"use client";

import { useEffect, useState } from "react";

export type MapTournament = {
  id: string;
  name: string;
  city: string;
  country: string;
  continentCode: string;
  dateStart: string;
  dateEnd: string;
  status: string;
  registrationStart: string | null;
  registrationEnd: string | null;
  lat: number;
  lng: number;
};

type Props = {
  tournaments: MapTournament[];
  selectedContinent?: string;
  onSelect?: (tournament: MapTournament) => void;
};

function getMarkerColor(t: MapTournament): string {
  if (t.status === "LIVE") return "#ef4444";
  const now = new Date();
  if (
    t.registrationStart &&
    t.registrationEnd &&
    new Date(t.registrationStart) <= now &&
    new Date(t.registrationEnd) >= now
  ) {
    return "#22c55e";
  }
  return "#f97316";
}

function createCircleIcon(color: string, L: any) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
    <circle cx="8" cy="8" r="6" fill="${color}" stroke="white" stroke-width="2"/>
  </svg>`;
  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

export default function TournamentMap({ tournaments, selectedContinent, onSelect }: Props) {
  const [mapComponents, setMapComponents] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      import("react-leaflet"),
      import("leaflet"),
    ]).then(([rl, L]) => {
      if (cancelled) return;
      // Fix default icon paths
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });
      setMapComponents({ rl, L });
    });
    // Load leaflet CSS
    if (!document.querySelector('link[href*="leaflet"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }
    return () => { cancelled = true; };
  }, []);

  if (!mapComponents) {
    return (
      <div style={{ width: "100%", height: "100%", minHeight: 500, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--surface-2)" }}>
        <span style={{ color: "var(--text-muted)", fontSize: 14 }}>Loading map…</span>
      </div>
    );
  }

  const { rl, L } = mapComponents;
  const { MapContainer, TileLayer, Marker, Popup } = rl;

  const filtered = selectedContinent
    ? tournaments.filter((t) => t.continentCode === selectedContinent)
    : tournaments;

  return (
    <MapContainer
      center={[20, 0]}
      zoom={2}
      style={{ width: "100%", height: "100%", minHeight: 500 }}
      scrollWheelZoom={false}
    >
      <TileLayer
        url="https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>'
      />
      {filtered.map((t) => (
        <Marker
          key={t.id}
          position={[t.lat, t.lng]}
          icon={createCircleIcon(getMarkerColor(t), L)}
          eventHandlers={{
            click: () => onSelect?.(t),
          }}
        >
          <Popup>
            <strong>{t.name}</strong>
            <br />
            {t.city}, {t.country}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
