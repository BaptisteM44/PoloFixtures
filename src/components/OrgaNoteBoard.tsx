"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

type NoteRow = {
  id: string;
  content: string;
  author: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function OrgaNoteBoard({
  notes: initial,
  tournamentId,
  currentPlayerId,
}: {
  notes: NoteRow[];
  tournamentId: string;
  currentPlayerId: string;
}) {
  const t = useTranslations("tournament");
  const [notes, setNotes] = useState<NoteRow[]>(initial);
  const [isPending, startTransition] = useTransition();
  const [content, setContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [error, setError] = useState<string | null>(null);

  const api = `/api/tournaments/${tournamentId}/orga/notes`;

  const addNote = () => {
    if (!content.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim() }),
      });
      if (res.ok) {
        const note = await res.json();
        setNotes((prev) => [note, ...prev]);
        setContent("");
      } else {
        const text = await res.text();
        setError(`Erreur ${res.status}: ${text}`);
      }
    });
  };

  const saveEdit = (id: string) => {
    if (!editContent.trim()) return;
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, content: editContent.trim(), updatedAt: new Date().toISOString() } : n)));
    setEditingId(null);
    startTransition(async () => {
      await fetch(`${api}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent.trim() }),
      });
    });
  };

  const deleteNote = (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    startTransition(async () => {
      await fetch(`${api}/${id}`, { method: "DELETE" });
    });
  };

  return (
    <div className="orga-note-board">
      <h3 style={{ margin: "0 0 16px", fontFamily: "var(--font-display)", fontSize: 16 }}>{t("orga_notes_title")}</h3>

      {/* Add form */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={t("orga_notes_add_placeholder")}
          rows={2}
          style={{ flex: 1, fontSize: 13, resize: "vertical" }}
        />
        <button className="primary" onClick={addNote} disabled={!content.trim() || isPending} style={{ fontSize: 12, padding: "6px 14px", alignSelf: "flex-end" }}>+</button>
      </div>
      {error && <p style={{ color: "var(--danger)", fontSize: 12, margin: "-8px 0 12px" }}>{error}</p>}

      {/* Notes list */}
      {notes.length === 0 ? (
        <p className="meta" style={{ textAlign: "center", padding: 20 }}>{t("orga_notes_empty")}</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {notes.map((note) => {
            const isOwn = note.author.id === currentPlayerId;
            const wasEdited = note.updatedAt !== note.createdAt;
            return (
              <div key={note.id} className="orga-note-card">
                {editingId === note.id ? (
                  <div>
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={3}
                      autoFocus
                      style={{ width: "100%", fontSize: 13, resize: "vertical", marginBottom: 8 }}
                    />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="primary" onClick={() => saveEdit(note.id)} style={{ fontSize: 11, padding: "4px 12px" }}>OK</button>
                      <button className="ghost" onClick={() => setEditingId(null)} style={{ fontSize: 11, padding: "4px 12px" }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p style={{ margin: "0 0 8px", fontSize: 13, whiteSpace: "pre-wrap" }}>{note.content}</p>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className="meta" style={{ fontSize: 11 }}>
                        {note.author.name} · {timeAgo(note.createdAt)}
                        {wasEdited && ` · ${t("orga_notes_edited")}`}
                      </span>
                      {isOwn && (
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className="ghost" onClick={() => { setEditingId(note.id); setEditContent(note.content); }} style={{ fontSize: 11, padding: "2px 8px" }}>Edit</button>
                          <button className="ghost" onClick={() => deleteNote(note.id)} style={{ fontSize: 11, padding: "2px 8px", color: "var(--danger)" }}>×</button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
