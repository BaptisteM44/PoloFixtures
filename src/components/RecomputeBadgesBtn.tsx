"use client";

import { useState } from "react";

export function RecomputeBadgesBtn() {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<{ updated: number; errors: number } | null>(null);

  async function run() {
    setStatus("loading");
    try {
      const res = await fetch("/api/admin/recompute-badges", { method: "POST" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      setResult(data);
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
      {status === "done" && result && (
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {result.updated} mis à jour · {result.errors} erreur{result.errors !== 1 ? "s" : ""}
        </span>
      )}
      {status === "error" && (
        <span style={{ fontSize: 11, color: "var(--danger)" }}>Erreur</span>
      )}
    </div>
  );
}
