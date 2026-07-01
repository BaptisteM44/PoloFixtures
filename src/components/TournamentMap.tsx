"use client";

import { useEffect, useState, useCallback } from "react";
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

// Group tournaments by position key, return groupKey per id and groups map
function buildGroups(tournaments: MapTournament[]): {
  groupKey: Map<string, string>;
  groups: Map<string, MapTournament[]>;
} {
  const groupKey = new Map<string, string>();
  const groups = new Map<string, MapTournament[]>();
  for (const t of tournaments) {
    const key = `${t.lat.toFixed(4)},${t.lng.toFixed(4)}`;
    groupKey.set(t.id, key);
    const arr = groups.get(key) ?? [];
    arr.push(t);
    groups.set(key, arr);
  }
  return { groupKey, groups };
}

// Compute spread positions for a group given a radius (in degrees)
function spreadPositions(group: MapTournament[], radius: number): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>();
  group.forEach((t, idx) => {
    if (group.length === 1) {
      out.set(t.id, [t.lat, t.lng]);
    } else {
      const angle = (idx / group.length) * 2 * Math.PI - Math.PI / 2;
      out.set(t.id, [t.lat + radius * Math.cos(angle), t.lng + radius * Math.sin(angle)]);
    }
  });
  return out;
}

function MarkersLayer({
  tournaments,
  onSelect,
}: {
  tournaments: MapTournament[];
  onSelect?: (t: MapTournament) => void;
}) {
  const map = useMap();
  const tr = useTranslations("tournament");
  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);

  const { groupKey, groups } = buildGroups(tournaments);

  // Convert N pixels to degrees latitude at current map zoom/center
  const pxToDeg = useCallback((px: number) => {
    const zoom = map.getZoom();
    const center = map.getCenter();
    const p1 = map.project(center, zoom);
    const p2 = L.point(p1.x, p1.y - px);
    const latLng = map.unproject(p2, zoom);
    return Math.abs(latLng.lat - center.lat);
  }, [map]);

  const positions = new Map<string, [number, number]>();
  for (const [key, group] of groups) {
    const isHovered = hoveredGroup === key;
    const radius = pxToDeg(isHovered ? 22 : 10);
    for (const [id, pos] of spreadPositions(group, radius)) {
      positions.set(id, pos);
    }
  }

  return (
    <>
      {tournaments.map((t) => {
        const key = groupKey.get(t.id)!;
        const isGroup = (groups.get(key)?.length ?? 1) > 1;
        return (
          <Marker
            key={t.id}
            position={positions.get(t.id) ?? [t.lat, t.lng]}
            icon={createCircleIcon(getMarkerColor(t))}
            eventHandlers={{
              click: () => onSelect?.(t),
              mouseover: () => { if (isGroup) setHoveredGroup(key); },
              mouseout: () => { if (isGroup) setHoveredGroup(null); },
            }}
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
        );
      })}
    </>
  );
}

export default function TournamentMap({ tournaments, onSelect, center = [25, 20], zoom = 2 }: Props) {
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
      <MarkersLayer tournaments={tournaments} onSelect={onSelect} />
    </MapContainer>
  );
}
