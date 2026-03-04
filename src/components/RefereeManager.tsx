"use client";

import { useState, useCallback, useRef, useEffect } from "react";

type RefPlayer = {
  id: string;
  name: string;
  country: string;
  city: string | null;
  photoPath: string | null;
};

type SearchResult = {
  id: string;
  name: string;
  city: string | null;
  country: string;
};

export function RefereeManager({
  tournamentId,
  referees: initial,
  canManage,
}: {
  tournamentId: string;
  referees: RefPlayer[];
  canManage: boolean;
}) {
  const [referees, setReferees] = useState<RefPlayer[]>(initial);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const search = useCallback((q: string) => {
    if (q.length < 2) { setResults([]); setShowResults(false); return; }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      const res = await fetch(`/api/players?search=${encodeURIComponent(q)}&status=ACTIVE`);
      if (res.ok) { setResults(await res.json()); setShowResults(true); }
    }, 250);
  }, []);

  const addReferee = async (player: SearchResult) => {
    setAdding(true);
    setError(null);
    setShowResults(false);
    setQuery("");
    const res = await fetch(`/api/tournaments/${tournamentId}/organizers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId: player.id, role: "REF" }),
    });
    if (res.ok) {
      const data = await res.json();
      setReferees((prev) => [...prev, data.player]);
    } else {
      const data = await res.json();
      setError(data.error ?? "Erreur");
    }
    setAdding(false);
  };

  const removeReferee = async (playerId: string) => {
    const res = await fetch(`/api/tournaments/${tournamentId}/organizers`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId }),
    });
    if (res.ok) setReferees((prev) => prev.filter((r) => r.id !== playerId));
  };

  return (
    <div className="panel">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <h3 style={{ marginBottom: 2 }}>⚖️ Arbitres assignés</h3>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
            Ces joueurs auront accès au bouton <strong>Arbitrer</strong> sur la page du tournoi.
          </p>
        </div>
      </div>

      {/* Liste des arbitres */}
      {referees.length === 0 ? (
        <p className="meta" style={{ marginBottom: 12 }}>Aucun arbitre assigné pour l&apos;instant.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
          {referees.map((ref) => (
            <div
              key={ref.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 12px",
                background: "var(--surface-2)",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-light)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {ref.photoPath ? (
                  <img src={ref.photoPath} alt={ref.name} style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }} />
                ) : (
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--teal)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 }}>
                    {ref.name[0]}
                  </div>
                )}
                <div>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>{ref.name}</p>
                  <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)" }}>{ref.city ? `${ref.city}, ` : ""}{ref.country}</p>
                </div>
              </div>
              {canManage && (
                <button
                  className="ghost"
                  style={{ padding: "4px 10px", fontSize: 12, color: "var(--danger)" }}
                  onClick={() => removeReferee(ref.id)}
                >
                  Retirer
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Recherche + ajout */}
      {canManage && (
        <div ref={containerRef} style={{ position: "relative" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text"
              placeholder="Rechercher un joueur par nom…"
              value={query}
              onChange={(e) => { setQuery(e.target.value); search(e.target.value); }}
              style={{ flex: 1, padding: "8px 12px", fontSize: 14, border: "2px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg)" }}
            />
          </div>

          {showResults && results.length > 0 && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50,
              background: "var(--surface)", border: "2px solid var(--border)",
              borderRadius: "var(--radius-sm)", boxShadow: "var(--shadow)",
              marginTop: 4, maxHeight: 200, overflowY: "auto",
            }}>
              {results.filter((r) => !referees.some((ref) => ref.id === r.id)).map((player) => (
                <button
                  key={player.id}
                  onClick={() => addReferee(player)}
                  disabled={adding}
                  style={{
                    width: "100%", textAlign: "left", padding: "10px 14px",
                    fontSize: 14, background: "none", border: "none",
                    borderBottom: "1px solid var(--border-light)", cursor: "pointer",
                  }}
                >
                  <strong>{player.name}</strong>
                  <span style={{ color: "var(--text-muted)", fontSize: 12, marginLeft: 8 }}>
                    {player.city ? `${player.city}, ` : ""}{player.country}
                  </span>
                </button>
              ))}
            </div>
          )}

          {error && <p style={{ color: "var(--danger)", fontSize: 12, marginTop: 6 }}>{error}</p>}
        </div>
      )}
    </div>
  );
}
