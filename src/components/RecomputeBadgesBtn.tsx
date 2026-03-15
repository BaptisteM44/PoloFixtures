"use client";

import { useState } from "react";

type Mode = "recent" | "all";

export function RecomputeBadgesBtn() {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [mode, setMode] = useState<Mode>("recent");
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [updated, setUpdated] = useState(0);
  const [errors, setErrors] = useState(0);

  async function run() {
    setStatus("loading");
    setProgress(0);
    setUpdated(0);
    setErrors(0);

    try {
      const allParam = mode === "all" ? "?all=1" : "";

      // 1. Récupérer le total
      const countRes = await fetch(`/api/admin/recompute-badges${allParam}`);
      if (!countRes.ok) throw new Error();
      const { total: t } = await countRes.json();
      setTotal(t);

      // 2. Enchaîner les batches
      let offset = 0;
      let totalUpdated = 0;
      let totalErrors = 0;

      while (offset !== null) {
        const res = await fetch(`/api/admin/recompute-badges?offset=${offset}${mode === "all" ? "&all=1" : ""}`, {
          method: "POST",
        });
        if (!res.ok) throw new Error();
        const data = await res.json();

        totalUpdated += data.updated;
        totalErrors += data.errors;
        offset = data.nextOffset ?? null;

        setProgress((prev) => prev + data.processed);
        setUpdated(totalUpdated);
        setErrors(totalErrors);
      }

      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  const pct = total > 0 ? Math.round((progress / total) * 100) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, width: "100%" }}>
      {status === "idle" && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode)}
            style={{ fontSize: 11, padding: "4px 8px", borderRadius: "var(--radius-sm)", border: "1.5px solid var(--border)", background: "var(--surface)", color: "var(--text)", cursor: "pointer" }}
          >
            <option value="recent">Actifs récemment</option>
            <option value="all">Tous les joueurs</option>
          </select>
          <button className="primary" style={{ fontSize: 12 }} onClick={run}>
            Recalculer
          </button>
        </div>
      )}

      {status === "loading" && (
        <>
          <div style={{ width: "100%", height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: "var(--teal)", borderRadius: 3, transition: "width 0.3s ease" }} />
          </div>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {progress} / {total} joueurs ({pct}%)
          </span>
        </>
      )}

      {status === "done" && (
        <>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            ✓ {updated} mis à jour · {errors} erreur{errors !== 1 ? "s" : ""}
          </span>
          <button className="ghost" style={{ fontSize: 11 }} onClick={() => setStatus("idle")}>
            Relancer
          </button>
        </>
      )}

      {status === "error" && (
        <>
          <span style={{ fontSize: 11, color: "var(--danger)" }}>Erreur</span>
          <button className="ghost" style={{ fontSize: 11 }} onClick={() => setStatus("idle")}>
            Réessayer
          </button>
        </>
      )}
    </div>
  );
}
