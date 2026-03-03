"use client";

import { useState, useCallback, useRef, useEffect } from "react";

type OrgaPlayer = {
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

export function CoOrganizerManager({
  tournamentId,
  coOrganizers: initial,
  canManage,
}: {
  tournamentId: string;
  coOrganizers: OrgaPlayer[];
  canManage: boolean;
}) {
  const [organizers, setOrganizers] = useState<OrgaPlayer[]>(initial);
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

  const addOrganizer = async (player: SearchResult) => {
    setAdding(true);
    setError(null);
    setShowResults(false);
    setQuery("");
    const res = await fetch(`/api/tournaments/${tournamentId}/organizers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId: player.id }),
    });
    if (res.ok) {
      const data = await res.json();
      setOrganizers((prev) => [...prev, data.player]);
    } else {
      const data = await res.json();
      setError(data.error ?? "Erreur");
    }
    setAdding(false);
  };

  const removeOrganizer = async (playerId: string) => {
    const res = await fetch(`/api/tournaments/${tournamentId}/organizers`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId }),
    });
    if (res.ok) {
      setOrganizers((prev) => prev.filter((o) => o.id !== playerId));
    }
  };

  return (
    <div className="panel" style={{ marginBottom: 24 }}>
      <h3 style={{ marginBottom: 12 }}>Co-organisateurs</h3>
      <p className="meta" style={{ marginBottom: 16 }}>
        Les co-organisateurs ont accès aux mêmes fonctions que toi pour gérer ce tournoi et cumulent les badges d&apos;organisation.
      </p>

      {organizers.length === 0 ? (
        <p className="meta" style={{ marginBottom: 16 }}>Aucun co-organisateur pour l&apos;instant.</p>
      ) : (
        <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
          {organizers.map((o) => (
            <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "var(--surface-2)", border: "1.5px solid var(--border)", borderRadius: 8 }}>
              {o.photoPath && (
                <img src={o.photoPath} alt="" style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }} />
              )}
              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: 14 }}>{o.name}</strong>
                <span className="meta" style={{ marginLeft: 8, fontSize: 12 }}>{o.city ? `${o.city}, ` : ""}{o.country}</span>
              </div>
              {canManage && (
                <button
                  type="button"
                  className="ghost"
                  style={{ fontSize: 12, color: "var(--danger)", padding: "3px 10px" }}
                  onClick={() => removeOrganizer(o.id)}
                >
                  Retirer
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {canManage && (
        <div ref={containerRef} style={{ position: "relative" }}>
          <input
            placeholder="Rechercher un joueur à ajouter…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); search(e.target.value); }}
            onFocus={() => results.length > 0 && setShowResults(true)}
            disabled={adding}
            style={{ width: "100%" }}
          />
          {showResults && results.length > 0 && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--surface)", border: "2px solid var(--border)", borderRadius: 8, zIndex: 50, maxHeight: 200, overflowY: "auto", boxShadow: "var(--shadow-lg)" }}>
              {results
                .filter((r) => !organizers.some((o) => o.id === r.id))
                .map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    style={{ width: "100%", textAlign: "left", padding: "8px 12px", background: "none", border: "none", cursor: "pointer", borderBottom: "1px solid var(--border-light)" }}
                    onMouseDown={() => addOrganizer(p)}
                  >
                    <strong style={{ fontSize: 13 }}>{p.name}</strong>
                    <span className="meta" style={{ marginLeft: 8, fontSize: 12 }}>{p.city ? `${p.city}, ` : ""}{p.country}</span>
                  </button>
                ))}
            </div>
          )}
          {error && <p className="error" style={{ marginTop: 6 }}>{error}</p>}
        </div>
      )}
    </div>
  );
}
