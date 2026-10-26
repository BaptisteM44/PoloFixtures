"use client";

import { useState, useRef } from "react";

export function OrgaNoteEditor({
  teamId,
  initialNote,
  label,
  placeholder,
}: {
  teamId: string;
  initialNote: string;
  label: string;
  placeholder: string;
}) {
  const [note, setNote] = useState(initialNote);
  // Replié tant qu'il n'y a pas de note : sinon un champ ouvert par équipe
  // rallonge la liste de plusieurs écrans.
  const [open, setOpen] = useState(!!initialNote);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = async (value: string) => {
    setSaving(true);
    setSaved(false);
    await fetch(`/api/teams/${teamId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgaNote: value || null }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setNote(value);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => save(value), 800);
  };

  if (!open) {
    return (
      <button type="button" className="ghost" onClick={() => setOpen(true)} style={{ marginTop: 6, fontSize: 11, padding: "3px 8px", minHeight: 0, boxShadow: "none" }}>
        + {label}
      </button>
    );
  }

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)" }}>{label}</span>
        {saving && <span style={{ fontSize: 10, color: "var(--text-muted)" }}>…</span>}
        {saved && <span style={{ fontSize: 10, color: "var(--teal)" }}>✓</span>}
      </div>
      <textarea
        value={note}
        onChange={handleChange}
        placeholder={placeholder}
        maxLength={1000}
        rows={2}
        autoFocus={!initialNote}
        style={{ width: "100%", fontSize: 12, resize: "vertical", padding: "6px 10px", borderRadius: 6, border: "1.5px solid var(--border)", background: "var(--surface)", color: "var(--text)", boxSizing: "border-box" }}
      />
    </div>
  );
}
