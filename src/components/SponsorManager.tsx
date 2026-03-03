"use client";

import { useRef, useState, useTransition } from "react";

type Sponsor = {
  id: string;
  name: string;
  logoPath: string | null;
  url: string | null;
};

type Props = {
  tournamentId: string;
  sponsors: Sponsor[];
  addAction: (
    tournamentId: string,
    name: string,
    url: string | null,
    logoPath: string | null
  ) => Promise<{ ok?: boolean; error?: string }>;
  deleteAction: (
    sponsorId: string,
    tournamentId: string
  ) => Promise<{ ok?: boolean; error?: string }>;
};

export function SponsorManager({ tournamentId, sponsors, addAction, deleteAction }: Props) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);

    try {
      // Prévisualisation locale immédiate
      const preview = URL.createObjectURL(file);
      setLogoPreview(preview);

      const fd = new FormData();
      fd.append("file", file);

      const resp = await fetch("/api/upload", { method: "POST", body: fd });
      if (!resp.ok) {
        setError("Erreur upload");
        setLogoPreview(null);
        return;
      }
      const json = await resp.json();
      setLogoPath(json.path);
    } catch {
      setError("Erreur lors de la lecture du fichier");
      setLogoPreview(null);
    } finally {
      setUploading(false);
    }
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError("Nom requis"); return; }
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await addAction(tournamentId, name, url || null, logoPath);
      if (result.ok) {
        setName(""); setUrl(""); setLogoPath(null); setLogoPreview(null);
        if (fileRef.current) fileRef.current.value = "";
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(typeof result.error === "string" ? result.error : "Erreur");
      }
    });
  };

  const handleDelete = (sponsorId: string) => {
    if (!confirm("Supprimer ce sponsor ?")) return;
    startTransition(async () => {
      await deleteAction(sponsorId, tournamentId);
    });
  };

  return (
    <div className="panel" style={{ marginBottom: 24 }}>
      <h3 style={{ marginBottom: 16 }}>Sponsors</h3>

      {/* List */}
      {sponsors.length > 0 && (
        <div style={{ display: "grid", gap: 8, marginBottom: 20 }}>
          {sponsors.map((s) => (
            <div key={s.id} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
              border: "1.5px solid var(--border-light)", borderRadius: 8, background: "var(--surface-2)"
            }}>
              {s.logoPath ? (
                <img src={s.logoPath} alt={s.name} style={{ height: 32, width: "auto", maxWidth: 90, objectFit: "contain", borderRadius: 4, border: "1px solid var(--border-light)" }} />
              ) : (
                <span style={{ fontSize: 22 }}>🤝</span>
              )}
              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: 14 }}>{s.name}</strong>
                {s.url && <span style={{ marginLeft: 8, fontSize: 12, color: "var(--teal)" }}>{s.url}</span>}
              </div>
              <button
                type="button"
                onClick={() => handleDelete(s.id)}
                disabled={isPending}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)", fontSize: 16, padding: "4px 8px" }}
                title="Supprimer"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {sponsors.length === 0 && (
        <p className="meta" style={{ marginBottom: 16 }}>Aucun sponsor pour l&apos;instant.</p>
      )}

      {/* Add form */}
      <form onSubmit={handleAdd} style={{ display: "grid", gap: 12 }}>
        <p style={{ fontSize: 12, fontFamily: "var(--font-display)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.05em", margin: 0, color: "var(--text-muted)" }}>
          Ajouter un sponsor
        </p>

        <label className="field-row" style={{ margin: 0 }}>
          Nom *
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du sponsor" required />
        </label>

        <label className="field-row" style={{ margin: 0 }}>
          Site web <span style={{ color: "var(--text-muted)", fontSize: 12 }}>(optionnel)</span>
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://exemple.com" />
        </label>

        <label className="field-row" style={{ margin: 0 }}>
          Logo / Photo
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} />
        </label>

        {logoPreview && (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <img src={logoPreview} alt="preview" style={{ height: 48, width: "auto", maxWidth: 140, objectFit: "contain", borderRadius: 6, border: "1.5px solid var(--border-light)" }} />
            <button type="button" onClick={() => { setLogoPreview(null); setLogoPath(null); if (fileRef.current) fileRef.current.value = ""; }}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 13 }}>
              Retirer
            </button>
          </div>
        )}

        {error && <p className="error" style={{ margin: 0 }}>{error}</p>}
        {success && <p style={{ margin: 0, color: "var(--success)", fontSize: 13, fontWeight: 700 }}>✅ Sponsor ajouté !</p>}

        <button className="primary" type="submit" disabled={isPending || uploading} style={{ justifyContent: "center" }}>
          {uploading ? "Upload…" : isPending ? "Ajout…" : "Ajouter le sponsor"}
        </button>
      </form>
    </div>
  );
}
