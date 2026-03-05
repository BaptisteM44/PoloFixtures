"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { COUNTRIES } from "@/lib/countries";

export default function NewClubPage() {
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
        <button type="button" className="ghost" onClick={() => router.back()}>← Retour</button>
        <h1>Créer un club</h1>
      </div>

      <div className="panel">
        <p className="meta" style={{ marginBottom: 16 }}>
          Après création, votre club sera soumis à l&apos;approbation d&apos;un admin avant d&apos;apparaître publiquement.
          Vous en deviendrez automatiquement le manager.
        </p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label className="field-row">
            Nom du club *
            <input required value={form.name} onChange={set("name")} placeholder="Paris Bike Polo" />
          </label>
          <label className="field-row">
            Ville *
            <input required value={form.city} onChange={set("city")} placeholder="Paris" />
          </label>
          <label className="field-row">
            Pays *
            <select required value={form.country} onChange={set("country")}>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.name}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="field-row">
            Description
            <textarea
              value={form.description}
              onChange={set("description")}
              rows={3}
              placeholder="Présentez votre club en quelques mots…"
              maxLength={500}
            />
          </label>
          <label className="field-row">
            Site web
            <input type="url" value={form.website} onChange={set("website")} placeholder="https://…" />
          </label>

          {/* Logo */}
          <div className="field-row" style={{ alignItems: "flex-start" }}>
            <span>Logo du club</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {logoPath && (
                <img src={logoPath} alt="Logo" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8, border: "2px solid var(--border)" }} />
              )}
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleLogoUpload} />
              <button type="button" className="ghost" style={{ fontSize: 12 }} onClick={() => fileRef.current?.click()} disabled={logoUploading}>
                {logoUploading ? "Upload…" : logoPath ? "Changer le logo" : "Uploader un logo"}
              </button>
              {!logoPath && (
                <input placeholder="…ou coller une URL" value={logoPath} onChange={(e) => setLogoPath(e.target.value)} style={{ fontSize: 12 }} />
              )}
            </div>
          </div>

          {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}

          <button type="submit" className="primary" disabled={loading}>
            {loading ? "Création…" : "Créer le club"}
          </button>
        </form>
      </div>
    </div>
  );
}
