"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";

type Voter = { isGuest: boolean; guestInfo: Record<string, string> | null; createdAt: string };
type ResultsData = {
  poll: { id: string; question: string; description: string | null; options: string[]; status: string };
  visible: boolean;
  counts?: Record<string, number>;
  totalBallots?: number;
  voterCount?: number;
  voters?: Voter[];
};

/**
 * Résultats détaillés pour l'admin : le décompte par option (visible EN TOUT
 * TEMPS pour l'admin, quel que soit le réglage showResults) + la liste des
 * participants (émargement — qui a voté), SANS jamais montrer ce qu'ils ont
 * voté (l'API ne renvoie de toute façon aucun lien votant↔choix).
 */
export function AdminPollResults({ pollId }: { pollId: string }) {
  const [data, setData] = useState<ResultsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/polls/${pollId}/results`)
      .then((res) => res.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [pollId]);

  if (loading) return <p className="meta" style={{ marginTop: 16 }}>Chargement…</p>;
  if (!data) return <p className="meta" style={{ marginTop: 16 }}>Sondage introuvable.</p>;

  const { poll, counts = {}, totalBallots = 0, voterCount = 0, voters = [] } = data;
  const maxCount = Math.max(1, ...Object.values(counts));

  // Toutes les clés de champs guest rencontrées (pour les colonnes du tableau/export).
  const guestKeys = Array.from(
    new Set(voters.flatMap((v) => (v.guestInfo ? Object.keys(v.guestInfo) : [])))
  );

  const exportCsv = () => {
    const headers = ["type", "date", ...guestKeys];
    const rows = voters.map((v) => [
      v.isGuest ? "invité" : "inscrit",
      new Date(v.createdAt).toLocaleString("fr-FR"),
      ...guestKeys.map((k) => v.guestInfo?.[k] ?? ""),
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sondage-${poll.id}-votants.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ maxWidth: 720, marginTop: 16, display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <Link href="/admin/polls" className="ghost" style={{ fontSize: 13 }}>← Retour aux sondages</Link>
        <h1 style={{ fontFamily: "var(--font-display)", margin: "8px 0 4px" }}>{poll.question}</h1>
        {poll.description && <p style={{ color: "var(--text-muted)", margin: 0 }}>{poll.description}</p>}
      </div>

      {/* Résultats — toujours visibles ici pour l'admin, indépendamment de showResults */}
      <div className="panel" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        <h3 style={{ margin: 0 }}>Résultats ({totalBallots} bulletin{totalBallots !== 1 ? "s" : ""})</h3>
        {poll.options.map((opt) => {
          const c = counts[opt] ?? 0;
          const pct = totalBallots > 0 ? Math.round((c / totalBallots) * 100) : 0;
          return (
            <div key={opt}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 2 }}>
                <span>{opt}</span><span style={{ fontWeight: 700 }}>{c} · {pct}%</span>
              </div>
              <div style={{ height: 12, background: "var(--surface-2)", borderRadius: 999, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(c / maxCount) * 100}%`, background: "var(--teal)", transition: "width .3s" }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Participants (émargement) — qui a voté, JAMAIS quoi */}
      <div className="panel" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <h3 style={{ margin: 0 }}>Participants ({voterCount})</h3>
          {voters.length > 0 && (
            <button className="ghost" style={{ fontSize: 12 }} onClick={exportCsv}>⬇ Export CSV</button>
          )}
        </div>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
          🔒 Cette liste montre QUI a voté, jamais CE QU'ils ont voté (le système ne stocke aucun lien entre les deux).
        </p>
        {voters.length === 0 ? (
          <p className="meta">Aucun votant pour l'instant.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border-light)" }}>
                  <th style={{ padding: "6px 8px" }}>Type</th>
                  <th style={{ padding: "6px 8px" }}>Date</th>
                  {guestKeys.map((k) => <th key={k} style={{ padding: "6px 8px" }}>{k}</th>)}
                </tr>
              </thead>
              <tbody>
                {voters.map((v, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border-light)" }}>
                    <td style={{ padding: "6px 8px" }}>{v.isGuest ? "Invité" : "Inscrit"}</td>
                    <td style={{ padding: "6px 8px", color: "var(--text-muted)" }}>{new Date(v.createdAt).toLocaleString("fr-FR")}</td>
                    {guestKeys.map((k) => <td key={k} style={{ padding: "6px 8px" }}>{v.guestInfo?.[k] ?? "—"}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
