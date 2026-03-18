"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapTournament = {
  id: string;
  name: string;
  city: string;
  country: string;
  continentCode: string;
  format: string;
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
  onSelect?: (tournament: MapTournament) => void;
};

function getMarkerColor(t: MapTournament): string {
  if (t.status === "LIVE") return "#ef4444";
  const now = new Date();
  // Inscriptions ouvertes
  if (
    t.registrationStart && t.registrationEnd &&
    new Date(t.registrationStart) <= now && new Date(t.registrationEnd) >= now
  ) return "#22c55e";
  // Inscriptions fermées (reg passée ou pas de dates d'inscription mais tournoi futur)
  if (
    (t.registrationEnd && new Date(t.registrationEnd) < now) ||
    (t.registrationStart && new Date(t.registrationStart) > now && t.registrationEnd && new Date(t.registrationEnd) < now)
  ) return "#f97316";
  // Annoncé (pas encore de dates d'inscription ouvertes)
  return "#3b82f6";
}

function createCircleIcon(color: string) {
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

// Force Leaflet to recalculate tile layout after mount
function MapInvalidator() {
  const map = useMap();
  useEffect(() => {
    setTimeout(() => map.invalidateSize(), 0);
  }, [map]);
  return null;
}

export default function TournamentMap({ tournaments, onSelect }: Props) {
  return (
    <MapContainer
      center={[30, 10]}
      zoom={2}
      style={{ width: "100%", height: "100%" }}
      scrollWheelZoom={false}
      worldCopyJump
    >
      <MapInvalidator />
      <TileLayer
        url="https://tiles.stadiamaps.com/tiles/stamen_toner_lite/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://stamen.com">Stamen Design</a>'
      />
      {tournaments.map((t) => (
        <Marker
          key={t.id}
          position={[t.lat, t.lng]}
          icon={createCircleIcon(getMarkerColor(t))}
          eventHandlers={{ click: () => onSelect?.(t) }}
        >
          <Popup>
            <strong>{t.name}</strong><br />
            {t.city}, {t.country}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
