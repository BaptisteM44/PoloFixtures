"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export type AdminStory = {
  id: string; imagePath: string; caption: string | null; createdAt: string; expiresAt: string;
  highlightTitle: string | null; hiddenAt: string | null; reportCount: number;
  author: { name: string; slug: string | null };
  tournament: { name: string } | null;
};

/** Modération des stories : signalées en tête, épingler à la une, masquer, supprimer. */
export function AdminStories({ stories }: { stories: AdminStory[] }) {
  const t = useTranslations("stories");
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const call = async (id: string, init: RequestInit) => {
    setBusy(id);
    setError(null);
    const res = await fetch(`/api/stories/${id}`, init);
    if (!res.ok) setError(t("error"));
    setBusy(null);
    router.refresh();
  };
  const patch = (id: string, body: object) =>
    call(id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  const pin = (s: AdminStory) => {
    const title = window.prompt(t("pin_prompt"), s.highlightTitle ?? s.tournament?.name ?? "");
    if (title === null) return;
    patch(s.id, { highlightTitle: title.trim() || null });
  };

  if (stories.length === 0) return <p className="meta">{t("admin_empty")}</p>;
  const now = Date.now();

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {error && <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p>}
      {stories.map((s) => {
        const expired = Date.parse(s.expiresAt) < now && !s.highlightTitle;
        return (
          <div key={s.id} className="panel" style={{ display: "flex", gap: 12, padding: 12, alignItems: "center", flexWrap: "wrap", opacity: expired ? 0.6 : 1, borderColor: s.reportCount > 0 ? "var(--danger)" : undefined }}>
            <a href={s.imagePath} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.imagePath} alt="" style={{ width: 54, height: 80, objectFit: "cover", borderRadius: 6, display: "block" }} />
            </a>
            <div style={{ flex: "1 1 220px", minWidth: 0, fontSize: 13, display: "grid", gap: 2 }}>
              <strong>{s.author.slug ? <Link href={`/player/${s.author.slug}`}>{s.author.name}</Link> : s.author.name}</strong>
              {s.caption && <span>{s.caption}</span>}
              <span style={{ color: "var(--text-muted)" }}>
                {new Date(s.createdAt).toLocaleString()}
                {s.tournament && <> · 🏆 {s.tournament.name}</>}
                {expired && <> · {t("admin_expired")}</>}
              </span>
              <span style={{ display: "flex", gap: 8, flexWrap: "wrap", fontWeight: 700 }}>
                {s.highlightTitle && <span>★ {s.highlightTitle}</span>}
                {s.reportCount > 0 && <span style={{ color: "var(--danger)" }}>⚠ {t("admin_reports", { count: s.reportCount })}</span>}
                {s.hiddenAt && <span style={{ color: "var(--danger)" }}>🚫 {t("admin_hidden")}</span>}
              </span>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button className="ghost" style={{ fontSize: 12 }} disabled={busy === s.id} onClick={() => pin(s)}>
                ★ {s.highlightTitle ? t("edit_pin") : t("pin")}
              </button>
              {s.highlightTitle && (
                <button className="ghost" style={{ fontSize: 12 }} disabled={busy === s.id} onClick={() => patch(s.id, { highlightTitle: null })}>{t("unpin")}</button>
              )}
              <button className="ghost" style={{ fontSize: 12 }} disabled={busy === s.id} onClick={() => patch(s.id, { hidden: !s.hiddenAt })}>
                {s.hiddenAt ? t("admin_unhide") : t("admin_hide")}
              </button>
              <button className="danger" style={{ fontSize: 12 }} disabled={busy === s.id}
                onClick={() => { if (confirm(t("confirm_delete"))) call(s.id, { method: "DELETE" }); }}>
                {t("delete")}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
