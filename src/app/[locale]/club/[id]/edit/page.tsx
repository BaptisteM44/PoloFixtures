"use client";

import { useRef, useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { COUNTRIES } from "@/lib/countries";
import { fixImageOrientation } from "@/lib/fix-orientation";

export default function EditClubPage() {
  const t = useTranslations("club");
  const tc = useTranslations("common");
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { data: session, status } = useSession();

  const [form, setForm] = useState({
    name: "", city: "", country: "France", description: "", website: "", trainingMapLink: "",
  });
  const [logoPath, setLogoPath] = useState("");
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/clubs/${id}`)
      .then((r) => r.json())
      .then((club) => {
        setForm({
          name: club.name ?? "",
          city: club.city ?? "",
          country: club.country ?? "France",
          description: club.description ?? "",
          website: club.website ?? "",
          trainingMapLink: club.trainingMapLink ?? "",
        });
        setLogoPath(club.logoPath ?? "");
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
      console.error("Club logo upload failed:", err);
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

      <div className="panel">
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
    </div>
  );
}
