"use client";

import { useRef, useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { COUNTRIES } from "@/lib/countries";
import { fixImageOrientation } from "@/lib/fix-orientation";

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
  saving,
}: {
  initial?: Venue;
  onSave: (data: Omit<Venue, "id">) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const t = useTranslations("club");
  const [name, setName] = useState(initial?.name ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [mapLink, setMapLink] = useState(initial?.mapLink ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [color, setColor] = useState(initial?.color ?? "#3b82f6");

  return (
    <div className="club-venue-form">
      <input className="form-input" placeholder={t("venues_name_placeholder")} value={name} onChange={(e) => setName(e.target.value)} />
      <input className="form-input" placeholder={t("venues_address_placeholder")} value={address} onChange={(e) => setAddress(e.target.value)} />
      <input className="form-input" placeholder={t("venues_map_placeholder")} value={mapLink} onChange={(e) => setMapLink(e.target.value)} />
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
        <button type="button" className="primary" style={{ fontSize: 13 }} onClick={() => onSave({ name, address: address || null, mapLink: mapLink || null, notes: notes || null, color: color || null })} disabled={saving || !name.trim()}>
          {initial ? t("venues_btn_save") : t("venues_btn_add")}
        </button>
        <button type="button" className="ghost" style={{ fontSize: 13 }} onClick={onCancel}>{t("venues_btn_cancel")}</button>
      </div>
    </div>
  );
}

export default function EditClubPage() {
  const t = useTranslations("club");
  const tc = useTranslations("common");
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { data: session, status } = useSession();

  const [form, setForm] = useState({
    name: "", city: "", country: "France", description: "", website: "", instagram: "", trainingMapLink: "",
  });
  const [logoPath, setLogoPath] = useState("");
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  // Venues state
  const [venues, setVenues] = useState<Venue[]>([]);
  const [showAddVenue, setShowAddVenue] = useState(false);
  const [editingVenueId, setEditingVenueId] = useState<string | null>(null);
  const [venueSaving, setVenueSaving] = useState(false);
  const [venueError, setVenueError] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/clubs/${id}`).then((r) => r.json()),
      fetch(`/api/clubs/${id}/venues`).then((r) => r.json()),
    ]).then(([club, venueList]) => {
      setForm({
        name: club.name ?? "",
        city: club.city ?? "",
        country: club.country ?? "France",
        description: club.description ?? "",
        website: club.website ?? "",
        instagram: club.instagram ?? "",
        trainingMapLink: club.trainingMapLink ?? "",
      });
      setLogoPath(club.logoPath ?? "");
      setVenues(venueList);
      setFetching(false);
    });
  }, [id]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [k]: e.target.value }));

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    setLogoUploadError(null);
    try {
      const fd = new FormData();
      fd.append("file", await fixImageOrientation(file));
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const txt = await res.text().catch(() => null);
        throw new Error(txt || `Upload échoué (${res.status})`);
      }
      const data = await res.json().catch(() => null);
      if (!data || !data.path) throw new Error("Réponse d'upload invalide");
      setLogoPath(data.path);
    } catch (err: any) {
      setLogoUploadError(err?.message ?? "Erreur lors de l'upload");
    } finally {
      setLogoUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/clubs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, logoPath: logoPath || null }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error?.formErrors?.[0] ?? data?.error ?? "Erreur");
      setLoading(false);
      return;
    }
    router.push(`/club/${id}`);
  }

  async function handleAddVenue(data: Omit<Venue, "id">) {
    setVenueSaving(true);
    setVenueError(null);
    try {
      const res = await fetch(`/api/clubs/${id}/venues`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const venue = await res.json();
        setVenues((prev) => [...prev, venue]);
        setShowAddVenue(false);
      } else {
        const body = await res.json().catch(() => ({}));
        setVenueError(body?.error ?? `Erreur ${res.status}`);
      }
    } catch {
      setVenueError("Erreur réseau, veuillez réessayer.");
    } finally {
      setVenueSaving(false);
    }
  }

  async function handleUpdateVenue(venueId: string, data: Omit<Venue, "id">) {
    setVenueSaving(true);
    setVenueError(null);
    try {
      const res = await fetch(`/api/clubs/${id}/venues/${venueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const updated = await res.json();
        setVenues((prev) => prev.map((v) => v.id === venueId ? updated : v));
        setEditingVenueId(null);
      } else {
        const body = await res.json().catch(() => ({}));
        setVenueError(body?.error ?? `Erreur ${res.status}`);
      }
    } catch {
      setVenueError("Erreur réseau, veuillez réessayer.");
    } finally {
      setVenueSaving(false);
    }
  }

  async function handleDeleteVenue(venueId: string) {
    if (!confirm(t("venues_confirm_delete"))) return;
    await fetch(`/api/clubs/${id}/venues/${venueId}`, { method: "DELETE" });
    setVenues((prev) => prev.filter((v) => v.id !== venueId));
  }

  if (status === "loading" || fetching) return null;

  if (!session?.user?.playerId) {
    return (
      <div className="page">
        <div className="panel" style={{ textAlign: "center", padding: 48 }}>
          <h2>{tc("auth_required_title")}</h2>
          <p style={{ color: "var(--text-muted)" }}>{tc("auth_required_desc")}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 600, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
        <button type="button" className="ghost" onClick={() => router.back()}>{tc("back")}</button>
        <h1>{t("edit_title")}</h1>
      </div>

      {/* Club info form */}
      <div className="panel" style={{ marginBottom: 24 }}>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label className="field-row">
            {t("field_name")}
            <input required value={form.name} onChange={set("name")} placeholder="Paris Bike Polo" />
          </label>
          <label className="field-row">
            {t("field_city")}
            <input required value={form.city} onChange={set("city")} placeholder="Paris" />
          </label>
          <label className="field-row">
            {t("field_country")}
            <select required value={form.country} onChange={set("country")}>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.name}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="field-row">
            {t("field_description")}
            <textarea
              value={form.description}
              onChange={set("description")}
              rows={3}
              placeholder={t("placeholder_description")}
              maxLength={500}
            />
          </label>
          <label className="field-row">
            {t("field_website")}
            <input type="url" value={form.website} onChange={set("website")} placeholder="https://…" />
          </label>
          <label className="field-row">
            Instagram
            <input value={form.instagram} onChange={set("instagram")} placeholder="@monclub ou https://instagram.com/monclub" />
          </label>
          <label className="field-row">
            {t("field_training_map")}
            <input type="url" value={form.trainingMapLink} onChange={set("trainingMapLink")} placeholder="https://maps.google.com/…" />
          </label>

          {/* Logo */}
          <div className="field-row" style={{ alignItems: "flex-start" }}>
            <span>{t("field_logo")}</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {logoPath && (
                <div style={{ position: "relative", display: "inline-block" }}>
                  <img src={logoPath} alt="Logo" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: "50%", border: "2px solid var(--border)" }} />
                  <button
                    type="button"
                    onClick={() => setLogoPath("")}
                    style={{ position: "absolute", top: -6, right: -6, background: "var(--danger)", color: "#fff", border: "none", borderRadius: "50%", width: 20, height: 20, minWidth: 20, minHeight: 20, padding: 0, cursor: "pointer", fontSize: 11, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}
                  >✕</button>
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleLogoUpload} />
              <button type="button" className="ghost" style={{ fontSize: 12 }} onClick={() => fileRef.current?.click()} disabled={logoUploading}>
                {logoUploading ? t("logo_uploading") : logoPath ? t("logo_change") : t("logo_upload")}
              </button>
              {logoUploadError && <p style={{ color: "var(--danger)", marginTop: 6, fontSize: 13 }}>{logoUploadError}</p>}
              {!logoPath && (
                <input placeholder={t("placeholder_logo_url")} value={logoPath} onChange={(e) => setLogoPath(e.target.value)} style={{ fontSize: 12 }} />
              )}
            </div>
          </div>

          {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}
          <button type="submit" className="primary" disabled={loading}>
            {loading ? t("btn_saving") : t("btn_save")}
          </button>
        </form>
      </div>

      {/* Venues section */}
      <div className="panel">
        <div className="club-venues__header" style={{ marginBottom: showAddVenue ? 12 : venues.length > 0 ? 12 : 0 }}>
          <h2 style={{ fontSize: 18, margin: 0 }}>{t("edit_venues_title")}</h2>
          {!showAddVenue && (
            <button className="ghost" style={{ fontSize: 13 }} onClick={() => setShowAddVenue(true)}>
              {t("venues_add_btn")}
            </button>
          )}
        </div>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
          {t("edit_venues_desc")}
        </p>

        {venueError && <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 10 }}>{venueError}</p>}
        </p>

        {showAddVenue && (
          <VenueForm
            onSave={handleAddVenue}
            onCancel={() => setShowAddVenue(false)}
            saving={venueSaving}
          />
        )}

        {venues.length === 0 && !showAddVenue && (
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{t("venues_empty")}</p>
        )}

        <div className="club-venues__list">
          {venues.map((v) =>
            editingVenueId === v.id ? (
              <VenueForm
                key={v.id}
                initial={v}
                onSave={(data) => handleUpdateVenue(v.id, data)}
                onCancel={() => setEditingVenueId(null)}
                saving={venueSaving}
              />
            ) : (
              <div key={v.id} className="club-venue-card" style={{ borderLeft: v.color ? `4px solid ${v.color}` : undefined }}>
                <div className="club-venue-card__top">
                  <div className="club-venue-card__name">{v.name}</div>
                  <div className="club-venue-card__actions">
                    <button className="ghost" style={{ fontSize: 11, padding: "2px 8px" }} onClick={() => setEditingVenueId(v.id)}>✏️</button>
                    <button className="ghost" style={{ fontSize: 11, padding: "2px 8px", color: "var(--text-muted)" }} onClick={() => handleDeleteVenue(v.id)}>✕</button>
                  </div>
                </div>
                {v.address && <div className="club-venue-card__address">📍 {v.address}</div>}
                {v.mapLink && (
                  <a href={v.mapLink} target="_blank" rel="noopener noreferrer" className="club-venue-card__map-link">
                    {t("venues_map_link")}
                  </a>
                )}
                {v.notes && <div className="club-venue-card__notes">{v.notes}</div>}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
