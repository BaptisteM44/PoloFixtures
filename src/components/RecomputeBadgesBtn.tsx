"use client";

import { useState } from "react";

export function RecomputeBadgesBtn() {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [progress, setProgress] = useState<{ updated: number; errors: number; progress: number; total: number } | null>(null);

  async function run() {
    setStatus("loading");
    setProgress(null);
    try {
      const res = await fetch("/api/admin/recompute-badges", { method: "POST" });
      if (!res.ok) throw new Error("HTTP " + res.status);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.done) {
              setStatus("done");
            } else {
              setProgress(data);
            }
          } catch { /* ignore */ }
        }
      }
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <button
        className="primary"
        style={{ fontSize: 12 }}
        disabled={status === "loading"}
        onClick={run}
      >
        {status === "loading" ? "Calcul en cours…" : "Recalculer"}
      </button>
      {status === "loading" && progress && (
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {progress.progress} / {progress.total} joueurs…
        </span>
      )}
      {status === "done" && progress && (
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {progress.updated} mis à jour · {progress.errors} erreur{progress.errors !== 1 ? "s" : ""}
        </span>
      )}
      {status === "error" && (
        <span style={{ fontSize: 11, color: "var(--danger)" }}>Erreur</span>
      )}
    </div>
  );
}
