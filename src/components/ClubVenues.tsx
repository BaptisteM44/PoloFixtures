"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  createVenueAction,
  updateVenueAction,
  deleteVenueAction,
} from "@/app/[locale]/club/[id]/actions";

type Venue = {
  id: string;
  name: string;
  address: string | null;
  mapLink: string | null;
  notes: string | null;
  color: string | null;
};

function VenueForm({
  initial,
  onSave,
  onCancel,
  isPending,
}: {
  initial?: Venue;
  onSave: (data: { name: string; address: string; mapLink: string; notes: string; color: string }) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const t = useTranslations("club");
  const [name, setName] = useState(initial?.name ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [mapLink, setMapLink] = useState(initial?.mapLink ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [color, setColor] = useState(initial?.color ?? "#3b82f6");

  return (
    <div className="club-venue-form">
      <input
        className="form-input"
        placeholder={t("venues_name_placeholder")}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        className="form-input"
        placeholder={t("venues_address_placeholder")}
        value={address}
        onChange={(e) => setAddress(e.target.value)}
      />
      <input
        className="form-input"
        placeholder={t("venues_map_placeholder")}
        value={mapLink}
        onChange={(e) => setMapLink(e.target.value)}
      />
      <textarea
        className="form-input"
        placeholder={t("venues_notes_placeholder")}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <label style={{ fontSize: 13 }}>{t("venues_color_label")}</label>
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 36, height: 28, border: "none", padding: 0, cursor: "pointer" }} />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="primary"
          style={{ fontSize: 13 }}
          onClick={() => onSave({ name, address, mapLink, notes, color })}
          disabled={isPending || !name.trim()}
        >
          {initial ? t("venues_btn_save") : t("venues_btn_add")}
        </button>
        <button className="ghost" style={{ fontSize: 13 }} onClick={onCancel}>
          {t("venues_btn_cancel")}
        </button>
      </div>
    </div>
  );
}

export function ClubVenues({
  clubId,
  venues: initialVenues,
  isAdmin,
}: {
  clubId: string;
  venues: Venue[];
  isAdmin: boolean;
}) {
  const t = useTranslations("club");
  const [venues, setVenues] = useState(initialVenues);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCreate(data: { name: string; address: string; mapLink: string; notes: string; color: string }) {
    startTransition(async () => {
      const res = await createVenueAction(clubId, data);
      if ("ok" in res) {
        setShowAdd(false);
        window.location.reload();
      }
    });
  }

  function handleUpdate(venueId: string, data: { name: string; address: string; mapLink: string; notes: string; color: string }) {
    startTransition(async () => {
      const res = await updateVenueAction(clubId, venueId, data);
      if ("ok" in res) {
        setEditingId(null);
        window.location.reload();
      }
    });
  }

  function handleDelete(venueId: string) {
    if (!confirm(t("venues_confirm_delete"))) return;
    startTransition(async () => {
      await deleteVenueAction(clubId, venueId);
      setVenues((prev) => prev.filter((v) => v.id !== venueId));
    });
  }

  return (
    <div className="club-venues">
      <div className="club-venues__header">
        <h3>{t("venues_title", { count: venues.length })}</h3>
        {isAdmin && !showAdd && (
          <button className="ghost" style={{ fontSize: 13 }} onClick={() => setShowAdd(true)}>
            {t("venues_add_btn")}
          </button>
        )}
      </div>

      {showAdd && (
        <VenueForm
          onSave={handleCreate}
          onCancel={() => setShowAdd(false)}
          isPending={isPending}
        />
      )}

      {venues.length === 0 && !showAdd && (
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{t("venues_empty")}</p>
      )}

      <div className="club-venues__list">
        {venues.map((v) =>
          editingId === v.id ? (
            <VenueForm
              key={v.id}
              initial={v}
              onSave={(data) => handleUpdate(v.id, data)}
              onCancel={() => setEditingId(null)}
              isPending={isPending}
            />
          ) : (
            <div key={v.id} className="club-venue-card" style={{ borderLeft: v.color ? `4px solid ${v.color}` : undefined }}>
              <div className="club-venue-card__top">
                <div className="club-venue-card__name">{v.name}</div>
                {isAdmin && (
                  <div className="club-venue-card__actions">
                    <button className="ghost" style={{ fontSize: 11, padding: "2px 8px" }} onClick={() => setEditingId(v.id)}>
                      ✏️
                    </button>
                    <button className="ghost" style={{ fontSize: 11, padding: "2px 8px", color: "var(--text-muted)" }} onClick={() => handleDelete(v.id)} disabled={isPending}>
                      ✕
                    </button>
                  </div>
                )}
              </div>
              {v.address && (
                <div className="club-venue-card__address">📍 {v.address}</div>
              )}
              {v.mapLink && (
                <a
                  href={v.mapLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="club-venue-card__map-link"
                >
                  {t("venues_map_link")}
                </a>
              )}
              {v.notes && (
                <div className="club-venue-card__notes">{v.notes}</div>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
}
