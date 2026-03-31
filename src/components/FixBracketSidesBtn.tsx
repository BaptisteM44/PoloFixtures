"use client";

import { useState } from "react";

export function FixBracketSidesBtn() {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<{ fixed: number; skipped: number; total: number } | null>(null);

  async function run() {
    setStatus("loading");
    try {
      const res = await fetch("/api/admin/fix-bracket-sides", { method: "POST" });
      if (!res.ok) throw new Error();
      setResult(await res.json());
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, width: "100%" }}>
      {status === "idle" && (
        <button className="ghost" style={{ fontSize: 12 }} onClick={run}>
          Corriger les finales
        </button>
      )}
      {status === "loading" && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>…</span>}
      {status === "done" && result && (
        <>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            ✓ {result.fixed} corrigés · {result.skipped} déjà OK
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
