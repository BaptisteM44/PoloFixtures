"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapMarker = {
  id: string;
  lat: number;
  lng: number;
  color: string;
  label: string;
  sublabel?: string;
  href?: string;
  linkLabel?: string;
};

type Props = {
  markers: MapMarker[];
  onSelect?: (id: string) => void;
  center?: [number, number];
  zoom?: number;
};

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

function MapFlyTo({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom, { duration: 0.8 });
  }, [map, center[0], center[1], zoom]);
  return null;
}

const TILE_LIGHT = "https://tiles.stadiamaps.com/tiles/stamen_toner_lite/{z}/{x}/{y}{r}.png";
const TILE_DARK  = "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png";
const ATTRIBUTION = '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://stamen.com">Stamen Design</a>';

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

export default function GenericMap({ markers, onSelect, center = [25, 20], zoom = 2 }: Props) {

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
      {markers.map((m) => (
        <Marker
          key={m.id}
          position={[m.lat, m.lng]}
          icon={createCircleIcon(m.color)}
          eventHandlers={{ click: () => onSelect?.(m.id) }}
        >
          <Popup>
            <strong>{m.label}</strong>
            {m.sublabel && <><br /><span style={{ color: "#666", fontSize: "0.85em" }}>{m.sublabel}</span></>}
            {m.href && (
              <><br /><a href={m.href} style={{ color: "#60c9cf", fontWeight: 700, fontSize: "0.85em" }}>{m.linkLabel ?? "Voir"} →</a></>
            )}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
