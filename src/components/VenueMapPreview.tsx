"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";

const GenericMap = dynamic(() => import("./GenericMap"), { ssr: false });

/**
 * Fiche → Lieux : où le tournoi apparaît sur la carte des tournois. Le point
 * vient de l'adresse du terrain si elle est renseignée, sinon de la ville —
 * il se met à jour à l'enregistrement.
 */
export function VenueMapPreview({ lat, lng, name }: { lat: number | null; lng: number | null; name: string }) {
  const t = useTranslations("tournament_edit");
  if (lat == null || lng == null) return <p className="meta" style={{ margin: 0 }}>📍 {t("map_preview_none")}</p>;
  return (
    <div className="venue-map">
      <div className="venue-map__box">
        <GenericMap markers={[{ id: "t", lat, lng, color: "#ffa2af", label: name }]} center={[lat, lng]} zoom={13} />
      </div>
      <small className="meta">📍 {t("map_preview_hint")}</small>
    </div>
  );
}
