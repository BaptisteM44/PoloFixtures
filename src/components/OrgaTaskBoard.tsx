"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  deadline: string | null;
  completed: boolean;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  assignedTo: { id: string; name: string } | null;
  createdBy: { id: string; name: string };
  createdAt: string;
};

type CoOrga = { playerId: string; playerName: string };

const PRIORITY_ORDER = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

function sortTasks(tasks: TaskRow[]): TaskRow[] {
  const incomplete = tasks.filter((t) => !t.completed);
  const completed = tasks.filter((t) => t.completed);
  incomplete.sort((a, b) => {
    const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (p !== 0) return p;
    if (a.deadline && b.deadline) return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    return 0;
  });
  return [...incomplete, ...completed];
}

function deadlineStatus(deadline: string | null, completed: boolean): "overdue" | "soon" | null {
  if (!deadline || completed) return null;
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff < 0) return "overdue";
  if (diff < 48 * 60 * 60 * 1000) return "soon";
  return null;
}

function formatDeadline(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function OrgaTaskBoard({
  tasks: initial,
  tournamentId,
  coOrganizers,
}: {
  tasks: TaskRow[];
  tournamentId: string;
  coOrganizers: CoOrga[];
}) {
  const t = useTranslations("tournament");
  const [tasks, setTasks] = useState<TaskRow[]>(initial);
  const [isPending, startTransition] = useTransition();

  // Add form state
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskRow["priority"]>("MEDIUM");
  const [assignee, setAssignee] = useState("");
  const [deadline, setDeadline] = useState("");

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const api = `/api/tournaments/${tournamentId}/orga/tasks`;

  const addTask = () => {
    if (!title.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          priority,
          assignedToId: assignee || undefined,
          deadline: deadline || undefined,
        }),
      });
      if (res.ok) {
        const task = await res.json();
        setTasks((prev) => [task, ...prev]);
        setTitle("");
        setPriority("MEDIUM");
        setAssignee("");
        setDeadline("");
      } else {
        const text = await res.text();
        setError(`Erreur ${res.status}: ${text}`);
      }
    });
  };

  const toggleComplete = (task: TaskRow) => {
    const next = !task.completed;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, completed: next } : t)));
    startTransition(async () => {
      await fetch(`${api}/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: next }),
      });
    });
  };

  const deleteTask = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    startTransition(async () => {
      await fetch(`${api}/${id}`, { method: "DELETE" });
    });
  };

  const saveEdit = (id: string) => {
    if (!editTitle.trim()) return;
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, title: editTitle.trim() } : t)));
    setEditingId(null);
    startTransition(async () => {
      await fetch(`${api}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle.trim() }),
      });
    });
  };

  const sorted = sortTasks(tasks);
  const doneCount = tasks.filter((t) => t.completed).length;

  return (
    <div className="orga-task-board">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 16 }}>{t("orga_tasks_title")}</h3>
        {tasks.length > 0 && (
          <span className="meta" style={{ fontSize: 12 }}>
            {t("orga_tasks_completed_count", { done: doneCount, total: tasks.length })}
          </span>
        )}
      </div>

      {/* Add form */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("orga_tasks_add_placeholder")}
          onKeyDown={(e) => e.key === "Enter" && addTask()}
          style={{ flex: "1 1 200px", fontSize: 13 }}
        />
        <select value={priority} onChange={(e) => setPriority(e.target.value as TaskRow["priority"])} style={{ fontSize: 12, width: "auto" }}>
          <option value="LOW">{t("orga_priority_low")}</option>
          <option value="MEDIUM">{t("orga_priority_medium")}</option>
          <option value="HIGH">{t("orga_priority_high")}</option>
          <option value="URGENT">{t("orga_priority_urgent")}</option>
        </select>
        {coOrganizers.length > 0 && (
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)} style={{ fontSize: 12, width: "auto" }}>
            <option value="">{t("orga_tasks_unassigned")}</option>
            {coOrganizers.map((co) => (
              <option key={co.playerId} value={co.playerId}>{co.playerName}</option>
            ))}
          </select>
        )}
        <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} style={{ fontSize: 12, width: "auto" }} />
        <button className="primary" onClick={addTask} disabled={!title.trim() || isPending} style={{ fontSize: 12, padding: "6px 14px" }}>+</button>
      </div>
      {error && <p style={{ color: "var(--danger)", fontSize: 12, margin: "-8px 0 12px" }}>{error}</p>}

      {/* Task list */}
      {sorted.length === 0 ? (
        <p className="meta" style={{ textAlign: "center", padding: 20 }}>{t("orga_tasks_empty")}</p>
      ) : (
        <div>
          {sorted.map((task) => {
            const dl = deadlineStatus(task.deadline, task.completed);
            return (
              <div key={task.id} className={`orga-task-row${task.completed ? " orga-task-row--completed" : ""}`}>
                <input
                  type="checkbox"
                  checked={task.completed}
                  onChange={() => toggleComplete(task)}
                  style={{ width: 18, height: 18, cursor: "pointer", flexShrink: 0 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {editingId === task.id ? (
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveEdit(task.id); if (e.key === "Escape") setEditingId(null); }}
                      onBlur={() => saveEdit(task.id)}
                      autoFocus
                      style={{ width: "100%", fontSize: 13, padding: "2px 6px" }}
                    />
                  ) : (
                    <span
                      className="orga-task-title"
                      onClick={() => { setEditingId(task.id); setEditTitle(task.title); }}
                      style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}
                    >
                      {task.title}
                    </span>
                  )}
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 2, flexWrap: "wrap" }}>
                    {task.assignedTo && (
                      <span className="meta" style={{ fontSize: 11 }}>{task.assignedTo.name}</span>
                    )}
                    {task.deadline && (
                      <span className={`meta${dl === "overdue" ? " orga-deadline--overdue" : dl === "soon" ? " orga-deadline--warning" : ""}`} style={{ fontSize: 11 }}>
                        {dl === "overdue" && `${t("orga_tasks_overdue")} · `}
                        {dl === "soon" && `${t("orga_tasks_due_soon")} · `}
                        {formatDeadline(task.deadline)}
                      </span>
                    )}
                  </div>
                </div>
                <span className={`orga-priority-badge orga-priority-badge--${task.priority.toLowerCase()}`}>
                  {t(`orga_priority_${task.priority.toLowerCase()}`)}
                </span>
                <button
                  onClick={() => deleteTask(task.id)}
                  className="ghost"
                  style={{ fontSize: 11, padding: "3px 8px", color: "var(--danger)" }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
