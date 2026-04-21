"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";

type Announcement = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  author: { id: string; name: string };
};

interface Props {
  clubId: string;
  initialAnnouncements: Announcement[];
  isAdmin: boolean;
  currentPlayerId: string | null;
}

export function ClubAnnouncements({ clubId, initialAnnouncements, isAdmin, currentPlayerId }: Props) {
  const t = useTranslations("club");
  const locale = useLocale();
  const [announcements, setAnnouncements] = useState<Announcement[]>(initialAnnouncements);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", content: "" });
  const [saving, setSaving] = useState(false);

  const fetchAnnouncements = async () => {
    const res = await fetch(`/api/clubs/${clubId}/announcements`);
    if (res.ok) setAnnouncements(await res.json());
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.content.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/clubs/${clubId}/announcements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setForm({ title: "", content: "" });
      setShowForm(false);
      await fetchAnnouncements();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("announcement_delete_confirm"))) return;
    const res = await fetch(`/api/clubs/${clubId}/announcements/${id}`, { method: "DELETE" });
    if (res.ok) setAnnouncements((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Admin: bouton créer */}
      {isAdmin && (
        <div>
          {!showForm ? (
            <button className="ghost" style={{ fontSize: 13 }} onClick={() => setShowForm(true)}>
              + {t("announcement_create_btn")}
            </button>
          ) : (
            <form className="panel" onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <h4 style={{ margin: 0 }}>{t("announcement_create_title")}</h4>
              <label className="field-row">
                {t("announcement_field_title")}
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder={t("announcement_title_placeholder")}
                  maxLength={200}
                  required
                />
              </label>
              <label className="field-row">
                {t("announcement_field_content")}
                <textarea
                  value={form.content}
                  onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                  placeholder={t("announcement_content_placeholder")}
                  maxLength={2000}
                  rows={4}
                  style={{ resize: "vertical" }}
                  required
                />
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="primary" type="submit" disabled={saving} style={{ fontSize: 13 }}>
                  {saving ? "…" : t("announcement_save_btn")}
                </button>
                <button className="ghost" type="button" style={{ fontSize: 13 }} onClick={() => { setShowForm(false); setForm({ title: "", content: "" }); }}>
                  {t("announcement_cancel_btn")}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Liste */}
      {announcements.length === 0 ? (
        <div className="empty-state"><p>{t("announcement_empty")}</p></div>
      ) : (
        announcements.map((a) => (
          <div key={a.id} className="panel" style={{ position: "relative" }}>
            {isAdmin && (
              <button
                onClick={() => handleDelete(a.id)}
                style={{ position: "absolute", top: 10, right: 12, background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--text-muted)" }}
                title={t("announcement_delete_btn")}
              >
                ✕
              </button>
            )}
            <div style={{ marginBottom: 6 }}>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15 }}>{a.title}</span>
              <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 10 }}>
                {a.author.name} · {new Date(a.createdAt).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{a.content}</p>
          </div>
        ))
      )}
    </div>
  );
}
