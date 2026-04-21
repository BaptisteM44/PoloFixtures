"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
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

const TYPE_KEYS: Record<string, string> = {
  feature: "roadmap_type_feature",
  bug: "roadmap_type_bug",
  improvement: "roadmap_type_improvement",
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: "#e53935",
  high:     "#f57c00",
  normal:   "#1976d2",
  low:      "#757575",
};

const PRIORITY_KEYS: Record<string, string> = {
  critical: "roadmap_priority_critical",
  high:     "roadmap_priority_high",
  normal:   "roadmap_priority_normal",
  low:      "roadmap_priority_low",
};

const STATUS_COLORS: Record<string, string> = {
  todo:        "var(--text-muted)",
  in_progress: "#f57c00",
  done:        "#43a047",
};

const STATUS_KEYS: Record<string, string> = {
  todo:        "roadmap_status_todo",
  in_progress: "roadmap_status_in_progress",
  done:        "roadmap_status_done",
};

const STATUSES = ["todo", "in_progress", "done"] as const;

export function RoadmapBoard({ items: initialItems }: { items: Item[] }) {
  const t = useTranslations("admin");
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
    if (!confirm(t("roadmap_confirm_delete"))) return;
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
          <button className="primary" onClick={() => setShowAdd(true)}>{t("roadmap_btn_add")}</button>
        ) : (
          <div className="panel roadmap-add-form">
            <h3 style={{ marginBottom: 16 }}>{t("roadmap_form_title")}</h3>
            <div className="roadmap-add-form__fields">
              <input
                className="form-input"
                placeholder={t("roadmap_field_title")}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                autoFocus
              />
              <textarea
                className="form-input"
                placeholder={t("roadmap_field_desc")}
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                rows={2}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <select className="form-select" value={newType} onChange={(e) => setNewType(e.target.value)}>
                  {Object.entries(TYPE_KEYS).map(([k, tKey]) => <option key={k} value={k}>{t(tKey as Parameters<typeof t>[0])}</option>)}
                </select>
                <select className="form-select" value={newPriority} onChange={(e) => setNewPriority(e.target.value)}>
                  {Object.entries(PRIORITY_KEYS).map(([k, tKey]) => <option key={k} value={k}>{t(tKey as Parameters<typeof t>[0])}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="primary" onClick={handleAdd} disabled={isPending}>{t("roadmap_btn_submit")}</button>
              <button className="ghost" onClick={() => setShowAdd(false)}>{t("roadmap_btn_cancel")}</button>
            </div>
          </div>
        )}
      </div>

      {/* Columns */}
      <div className="roadmap-columns">
        {grouped.map(({ status, items: colItems }) => (
          <div key={status} className="roadmap-column">
            <div className="roadmap-column__header">
              <span style={{ color: STATUS_COLORS[status], fontWeight: 700 }}>
                {t(STATUS_KEYS[status] as Parameters<typeof t>[0])}
              </span>
              <span className="roadmap-column__count">{colItems.length}</span>
            </div>

            <div className="roadmap-column__items">
              {colItems.map((item, idx) => (
                <div key={item.id} className={`roadmap-item roadmap-item--${item.status}`}>
                  <div className="roadmap-item__header">
                    <span className="roadmap-item__type">{t((TYPE_KEYS[item.type] ?? "roadmap_type_feature") as Parameters<typeof t>[0])}</span>
                    <span
                      className="roadmap-item__priority"
                      style={{ color: PRIORITY_COLORS[item.priority] }}
                    >
                      {t((PRIORITY_KEYS[item.priority] ?? "roadmap_priority_normal") as Parameters<typeof t>[0])}
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
                        <option key={s} value={s}>{t(STATUS_KEYS[s] as Parameters<typeof t>[0])}</option>
                      ))}
                    </select>

                    {/* Move */}
                    <div style={{ display: "flex", gap: 2 }}>
                      <button
                        className="roadmap-item__move-btn"
                        onClick={() => handleMove(item.id, "up")}
                        disabled={idx === 0 || isPending}
                        title={t("roadmap_move_up")}
                      >↑</button>
                      <button
                        className="roadmap-item__move-btn"
                        onClick={() => handleMove(item.id, "down")}
                        disabled={idx === colItems.length - 1 || isPending}
                        title={t("roadmap_move_down")}
                      >↓</button>
                    </div>

                    <button
                      className="roadmap-item__delete-btn"
                      onClick={() => handleDelete(item.id)}
                      disabled={isPending}
                      title={t("roadmap_btn_delete")}
                    >✕</button>
                  </div>
                </div>
              ))}

              {colItems.length === 0 && (
                <div className="roadmap-column__empty">{t("roadmap_column_empty")}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
