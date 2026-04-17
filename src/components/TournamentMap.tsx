"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { MapContainer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const TILE_LIGHT = "https://tiles.stadiamaps.com/tiles/stamen_toner_lite/{z}/{x}/{y}{r}.png";
const TILE_DARK  = "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png";
const ATTRIBUTION = '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>';

function TileLayerSwitcher() {
  const map = useMap();
  useEffect(() => {
    let currentLayer: L.TileLayer | null = null;
    const applyTile = () => {
      const dark = document.documentElement.getAttribute("data-theme") === "dark";
      const url = dark ? TILE_DARK : TILE_LIGHT;
      if (currentLayer) map.removeLayer(currentLayer);
      currentLayer = L.tileLayer(url, { attribution: ATTRIBUTION, minZoom: 1 });
      currentLayer.addTo(map);
    };
    applyTile();
    const observer = new MutationObserver(applyTile);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      observer.disconnect();
      if (currentLayer) map.removeLayer(currentLayer);
    };
  }, [map]);
  return null;
}

export type MapTournament = {
  id: string;
  slug?: string | null;
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
  center?: [number, number];
  zoom?: number;
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

// Force Leaflet to recalculate tile layout after mount + fit world on small screens
function MapInvalidator() {
  const map = useMap();
  useEffect(() => {
    setTimeout(() => {
      map.invalidateSize();
      if (map.getContainer().clientWidth < 600) {
        map.setZoom(1, { animate: false });
      }
    }, 0);
  }, [map]);
  return null;
}

// Fly to new center/zoom when props change
function MapFlyTo({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom, { duration: 0.8 });
  }, [map, center[0], center[1], zoom]);
  return null;
}

export default function TournamentMap({ tournaments, onSelect, center = [25, 20], zoom = 2 }: Props) {
  const tr = useTranslations("tournament");
  return (
    <MapContainer
      center={center}
      zoom={zoom}
      style={{ width: "100%", height: "100%" }}
      scrollWheelZoom={false}
      worldCopyJump
      minZoom={1}
    >
      <MapInvalidator />
      <MapFlyTo center={center} zoom={zoom} />
      <TileLayerSwitcher />
      {tournaments.map((t) => (
        <Marker
          key={t.id}
          position={[t.lat, t.lng]}
          icon={createCircleIcon(getMarkerColor(t))}
          eventHandlers={{ click: () => onSelect?.(t) }}
        >
          <Popup>
            <strong>{t.name}</strong><br />
            <span style={{ color: "#666", fontSize: "0.85em" }}>{t.city}, {t.country}</span><br />
            <a
              href={`/tournament/${t.slug ?? t.id}`}
              style={{ color: "#60c9cf", fontWeight: 700, fontSize: "0.85em" }}
            >
              {tr("edit_view_tournament")} →
            </a>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
