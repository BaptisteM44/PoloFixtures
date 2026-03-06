"use client";

import { useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { COUNTRIES } from "@/lib/countries";

export default function NewClubPage() {
  const t = useTranslations("club");
  const tc = useTranslations("common");
  const router = useRouter();
  const [form, setForm] = useState({
    name: "", city: "", country: "France", description: "", website: "",
  });
  const [logoPath, setLogoPath] = useState("");
  const [logoUploading, setLogoUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [k]: e.target.value }));

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const data = await res.json();
    setLogoPath(data.path ?? "");
    setLogoUploading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/clubs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, logoPath: logoPath || null }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error?.formErrors?.[0] ?? data?.error ?? "Erreur");
      setLoading(false);
      return;
    }
    const club = await res.json();
    router.push(`/club/${club.id}?created=1`);
  }

  return (
    <div style={{ maxWidth: 600, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
        <button type="button" className="ghost" onClick={() => router.back()}>{tc("back")}</button>
        <h1>{t("create_title")}</h1>
      </div>

      <div className="panel">
        <p className="meta" style={{ marginBottom: 16 }}>
          {t("new_desc")}
        </p>

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

          {/* Logo */}
          <div className="field-row" style={{ alignItems: "flex-start" }}>
            <span>{t("field_logo")}</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {logoPath && (
                <img src={logoPath} alt="Logo" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8, border: "2px solid var(--border)" }} />
              )}
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleLogoUpload} />
              <button type="button" className="ghost" style={{ fontSize: 12 }} onClick={() => fileRef.current?.click()} disabled={logoUploading}>
                {logoUploading ? t("logo_uploading") : logoPath ? t("logo_change") : t("logo_upload")}
              </button>
              {!logoPath && (
                <input placeholder={t("placeholder_logo_url")} value={logoPath} onChange={(e) => setLogoPath(e.target.value)} style={{ fontSize: 12 }} />
              )}
            </div>
          </div>

          {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}

          <button type="submit" className="primary" disabled={loading}>
            {loading ? t("btn_creating") : t("btn_create")}
          </button>
        </form>
      </div>
    </div>
  );
}
