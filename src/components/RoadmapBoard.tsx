"use client";

import { useState, useTransition } from "react";
import {
  createRoadmapItemAction,
  updateRoadmapItemAction,
  deleteRoadmapItemAction,
  moveRoadmapItemAction,
} from "@/app/[locale]/admin/roadmap/actions";

type Item = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  priority: string;
  status: string;
  order: number;
};

const TYPE_LABELS: Record<string, string> = {
  feature: "✨ Feature",
  bug: "🐛 Bug",
  improvement: "🔧 Amélioration",
};

const PRIORITY_LABELS: Record<string, { label: string; color: string }> = {
  critical: { label: "Critique", color: "#e53935" },
  high:     { label: "Haute",    color: "#f57c00" },
  normal:   { label: "Normale",  color: "#1976d2" },
  low:      { label: "Basse",    color: "#757575" },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  todo:        { label: "À faire",   color: "var(--text-muted)" },
  in_progress: { label: "En cours",  color: "#f57c00" },
  done:        { label: "Fait ✓",    color: "#43a047" },
};

const STATUSES = ["todo", "in_progress", "done"] as const;

export function RoadmapBoard({ items: initialItems }: { items: Item[] }) {
  const [items, setItems] = useState(initialItems);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Add form state
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newType, setNewType] = useState("feature");
  const [newPriority, setNewPriority] = useState("normal");

  function handleAdd() {
    if (!newTitle.trim()) return;
    startTransition(async () => {
      await createRoadmapItemAction({ title: newTitle.trim(), description: newDesc.trim() || undefined, type: newType, priority: newPriority });
      setNewTitle(""); setNewDesc(""); setNewType("feature"); setNewPriority("normal");
      setShowAdd(false);
    });
  }

  function handleStatus(id: string, status: string) {
    startTransition(async () => {
      await updateRoadmapItemAction(id, { status });
      setItems((prev) => prev.map((i) => i.id === id ? { ...i, status } : i));
    });
  }

  function handleDelete(id: string) {
    if (!confirm("Supprimer cet élément ?")) return;
    startTransition(async () => {
      await deleteRoadmapItemAction(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    });
  }

  function handleMove(id: string, direction: "up" | "down") {
    startTransition(async () => {
      await moveRoadmapItemAction(id, direction);
      // Optimistic reorder
      setItems((prev) => {
        const sorted = [...prev].sort((a, b) => a.order - b.order);
        const idx = sorted.findIndex((i) => i.id === id);
        const swapIdx = direction === "up" ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= sorted.length) return prev;
        const newArr = [...sorted];
        [newArr[idx], newArr[swapIdx]] = [newArr[swapIdx], newArr[idx]];
        return newArr;
      });
    });
  }

  const todoItems = items.filter((i) => i.status === "todo");
  const inProgressItems = items.filter((i) => i.status === "in_progress");
  const doneItems = items.filter((i) => i.status === "done");

  const grouped = [
    { status: "in_progress", items: inProgressItems },
    { status: "todo", items: todoItems },
    { status: "done", items: doneItems },
  ];

  return (
    <div className="roadmap">
      {/* Add button */}
      <div style={{ marginBottom: 24 }}>
        {!showAdd ? (
          <button className="primary" onClick={() => setShowAdd(true)}>+ Ajouter</button>
        ) : (
          <div className="panel roadmap-add-form">
            <h3 style={{ marginBottom: 16 }}>Nouvelle entrée</h3>
            <div className="roadmap-add-form__fields">
              <input
                className="form-input"
                placeholder="Titre *"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                autoFocus
              />
              <textarea
                className="form-input"
                placeholder="Description (optionnel)"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                rows={2}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <select className="form-select" value={newType} onChange={(e) => setNewType(e.target.value)}>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <select className="form-select" value={newPriority} onChange={(e) => setNewPriority(e.target.value)}>
                  {Object.entries(PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="primary" onClick={handleAdd} disabled={isPending}>Ajouter</button>
              <button className="ghost" onClick={() => setShowAdd(false)}>Annuler</button>
            </div>
          </div>
        )}
      </div>

      {/* Columns */}
      <div className="roadmap-columns">
        {grouped.map(({ status, items: colItems }) => (
          <div key={status} className="roadmap-column">
            <div className="roadmap-column__header">
              <span style={{ color: STATUS_LABELS[status].color, fontWeight: 700 }}>
                {STATUS_LABELS[status].label}
              </span>
              <span className="roadmap-column__count">{colItems.length}</span>
            </div>

            <div className="roadmap-column__items">
              {colItems.map((item, idx) => (
                <div key={item.id} className={`roadmap-item roadmap-item--${item.status}`}>
                  <div className="roadmap-item__header">
                    <span className="roadmap-item__type">{TYPE_LABELS[item.type] ?? item.type}</span>
                    <span
                      className="roadmap-item__priority"
                      style={{ color: PRIORITY_LABELS[item.priority]?.color }}
                    >
                      {PRIORITY_LABELS[item.priority]?.label}
                    </span>
                  </div>

                  <p className="roadmap-item__title">{item.title}</p>
                  {item.description && <p className="roadmap-item__desc">{item.description}</p>}

                  <div className="roadmap-item__actions">
                    {/* Status cycle */}
                    <select
                      className="roadmap-item__status-select"
                      value={item.status}
                      onChange={(e) => handleStatus(item.id, e.target.value)}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>{STATUS_LABELS[s].label}</option>
                      ))}
                    </select>

                    {/* Move */}
                    <div style={{ display: "flex", gap: 2 }}>
                      <button
                        className="roadmap-item__move-btn"
                        onClick={() => handleMove(item.id, "up")}
                        disabled={idx === 0 || isPending}
                        title="Monter"
                      >↑</button>
                      <button
                        className="roadmap-item__move-btn"
                        onClick={() => handleMove(item.id, "down")}
                        disabled={idx === colItems.length - 1 || isPending}
                        title="Descendre"
                      >↓</button>
                    </div>

                    <button
                      className="roadmap-item__delete-btn"
                      onClick={() => handleDelete(item.id)}
                      disabled={isPending}
                      title="Supprimer"
                    >✕</button>
                  </div>
                </div>
              ))}

              {colItems.length === 0 && (
                <div className="roadmap-column__empty">Aucun élément</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
