"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export type AdminPhoto = {
  id: string; imagePath: string; createdAt: string; hidden: boolean; reportCount: number; revealed: boolean;
  author: { name: string; slug: string | null };
  tournament: { slug: string; name: string };
};

/** Modération des pellicules : signalées en tête, masquer / réafficher / supprimer. */
export function AdminPhotos({ photos }: { photos: AdminPhoto[] }) {
  const t = useTranslations("photos");
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const call = async (id: string, init: RequestInit) => {
    setBusy(id);
    setError(null);
    const res = await fetch(`/api/tournament-photos/${id}`, init);
    if (!res.ok) setError(t("error"));
    setBusy(null);
    router.refresh();
  };

  if (photos.length === 0) return <p className="meta">{t("admin_empty")}</p>;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {error && <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p>}
      {photos.map((p) => (
        <div key={p.id} className="panel" style={{ display: "flex", gap: 12, padding: 12, alignItems: "center", flexWrap: "wrap", borderColor: p.reportCount > 0 ? "var(--danger)" : undefined }}>
          <a href={p.imagePath} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.imagePath} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 6, display: "block" }} />
          </a>
          <div style={{ flex: "1 1 220px", minWidth: 0, fontSize: 13, display: "grid", gap: 2 }}>
            <strong>{p.author.slug ? <Link href={`/player/${p.author.slug}`}>{p.author.name}</Link> : p.author.name}</strong>
            <span>
              <Link href={`/tournament/${p.tournament.slug}?tab=photos`}>🏆 {p.tournament.name}</Link>
              <span style={{ color: "var(--text-muted)" }}> · {new Date(p.createdAt).toLocaleString()}</span>
            </span>
            <span style={{ display: "flex", gap: 8, flexWrap: "wrap", fontWeight: 700 }}>
              {!p.revealed && <span style={{ color: "var(--text-muted)" }}>🔒 {t("admin_sealed")}</span>}
              {p.reportCount > 0 && <span style={{ color: "var(--danger)" }}>⚠ {t("admin_reports", { count: p.reportCount })}</span>}
              {p.hidden && <span style={{ color: "var(--danger)" }}>🚫 {t("admin_hidden")}</span>}
            </span>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button className="ghost" style={{ fontSize: 12 }} disabled={busy === p.id}
              onClick={() => call(p.id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hidden: !p.hidden }) })}>
              {p.hidden ? t("admin_unhide") : t("admin_hide")}
            </button>
            <button className="danger" style={{ fontSize: 12 }} disabled={busy === p.id}
              onClick={() => { if (confirm(t("confirm_delete"))) call(p.id, { method: "DELETE" }); }}>
              {t("delete")}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
