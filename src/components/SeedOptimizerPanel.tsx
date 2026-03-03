"use client";

import { useState } from "react";

export function SeedOptimizerPanel({ tournamentId }: { tournamentId: string }) {
  const [preview, setPreview] = useState<Array<{ id: string; name: string; seed: number }>>([]);
  const [score, setScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const runPreview = async () => {
    setLoading(true);
    const res = await fetch("/api/optimizer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tournamentId, avoidSameCity: true, avoidSameCountry: true })
    });
    const data = await res.json();
    setPreview(data.order ?? []);
    setScore(data.score ?? null);
    setLoading(false);
  };

  const apply = async () => {
    setLoading(true);
    await fetch("/api/optimizer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tournamentId, apply: true, avoidSameCity: true, avoidSameCountry: true })
    });
    setLoading(false);
  };

  return (
    <div className="panel">
      <h3>Optimize Seeds (ML)</h3>
      <p>Heuristic optimization to minimize rematches and balance ELO for round 1.</p>
      <div className="button-row">
        <button onClick={runPreview} disabled={loading}>Preview</button>
        <button onClick={apply} className="ghost" disabled={loading}>Apply</button>
      </div>
      {score !== null && <p className="meta">Score: {score.toFixed(2)}</p>}
      {preview.length > 0 && (
        <ol className="seed-preview">
          {preview.map((team) => (
            <li key={team.id}>#{team.seed} {team.name}</li>
          ))}
        </ol>
      )}
    </div>
  );
}
