"use client";

import { useState, useRef } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

export function CreateSquadForm() {
  const t = useTranslations("my_teams");
  const router = useRouter();
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [logoPath, setLogoPath] = useState("");
  const [logoUploading, setLogoUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    if (res.ok) {
      const data = await res.json();
      setLogoPath(data.path);
      setLogoUploading(false);
    } else {
      const reader = new FileReader();
      reader.onload = async () => {
        const fd2 = new FormData();
        fd2.append("base64", reader.result as string);
        const res2 = await fetch("/api/upload", { method: "POST", body: fd2 });
        if (res2.ok) { const d = await res2.json(); setLogoPath(d.path); }
        setLogoUploading(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) { setError(t("error_name_short")); return; }
    setLoading(true);
    setError(null);
    const res = await fetch("/api/squads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), bio: bio.trim() || undefined, logoPath: logoPath || undefined }),
    });
    if (res.ok) {
      const squad = await res.json();
      router.push(`/my-teams/${squad.id}`);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? t("error_create"));
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
      <label className="field-row">
        {t("field_name")}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex: Les Bisons, Team Bordeaux..."
          maxLength={60}
          required
        />
      </label>

      {/* Logo */}
      <div className="field-row">
        <span>{t("field_logo")}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {logoPath && (
            <div style={{ position: "relative" }}>
              <img src={logoPath} alt="Logo" style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--border)" }} />
              <button type="button" onClick={() => setLogoPath("")} style={{ position: "absolute", top: -6, right: -6, background: "var(--danger)", color: "#fff", border: "none", borderRadius: "50%", width: 18, height: 18, cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>
          )}
          <input ref={logoInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleLogoUpload} />
          <button type="button" className="ghost" style={{ fontSize: 12 }} onClick={() => logoInputRef.current?.click()} disabled={logoUploading}>
            {logoUploading ? t("logo_uploading") : logoPath ? t("logo_change") : t("logo_upload")}
          </button>
        </div>
      </div>

      <label className="field-row">
        {t("field_bio")}
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder={t("bio_placeholder")}
          style={{ resize: "vertical", fontFamily: "inherit", fontSize: 13 }}
        />
      </label>

      {error && <p className="error">{error}</p>}
      <button className="primary" type="submit" disabled={loading || logoUploading}>
        {loading ? t("btn_creating") : t("btn_submit")}
      </button>
    </form>
  );
}
