"use client";

import { useState, useTransition, useCallback, useRef, useEffect } from "react";

type PlayerResult = {
  id: string;
  name: string;
  city: string | null;
  country: string;
};

type TeamPlayer = {
  id: string;
  player: { id: string; name: string; country: string };
};

type Team = {
  id: string;
  name: string;
  seed: number;
  city: string | null;
  country: string | null;
  players: TeamPlayer[];
};

type AddPlayerData =
  | { type: "existing"; playerId: string }
  | { type: "manual"; name: string; city?: string | null; country: string };

type Props = {
  teams: Team[];
  locked: boolean;
  format?: string;
  renameAction: (teamId: string, name: string, tournamentId: string) => Promise<{ ok?: boolean; error?: string }>;
  deleteTeamAction: (teamId: string, tournamentId: string) => Promise<{ ok?: boolean; error?: string }>;
  removePlayerAction: (teamPlayerId: string, tournamentId: string) => Promise<{ ok?: boolean; error?: string }>;
  addPlayerAction: (teamId: string, tournamentId: string, playerData: AddPlayerData) => Promise<{ ok?: boolean; error?: string }>;
  tournamentId: string;
};

function maxPlayersFromFormat(format?: string): number {
  if (!format) return 3;
  const m = format.match(/^(\d+)v\d+$/i);
  return m ? parseInt(m[1], 10) : 3;
}

export function TeamManager({ teams, locked, format, renameAction, deleteTeamAction, removePlayerAction, addPlayerAction, tournamentId }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const maxPlayers = maxPlayersFromFormat(format);

  const handleDeleteTeam = (teamId: string, teamName: string) => {
    if (!confirm(`Supprimer l'équipe "${teamName}" ? Cette action est irréversible.`)) return;
    startTransition(async () => {
      await deleteTeamAction(teamId, tournamentId);
    });
  };

  const handleRemovePlayer = (teamPlayerId: string, playerName: string) => {
    if (!confirm(`Retirer ${playerName} de l'équipe ?`)) return;
    startTransition(async () => {
      await removePlayerAction(teamPlayerId, tournamentId);
    });
  };

  if (teams.length === 0) return null;

  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ marginBottom: 16 }}>Équipes inscrites ({teams.length})</h3>
      <div style={{ display: "grid", gap: 12 }}>
        {[...teams].sort((a, b) => a.seed - b.seed).map((team) => (
          <TeamRow
            key={team.id}
            team={team}
            locked={locked}
            maxPlayers={maxPlayers}
            tournamentId={tournamentId}
            isEditing={editingId === team.id}
            onStartEdit={() => { setEditingId(team.id); setGlobalError(null); }}
            onCancelEdit={() => setEditingId(null)}
            onDelete={() => handleDeleteTeam(team.id, team.name)}
            onRemovePlayer={handleRemovePlayer}
            isPending={isPending}
            renameAction={renameAction}
            addPlayerAction={addPlayerAction}
            startTransition={startTransition}
            setEditingId={setEditingId}
          />
        ))}
      </div>
      {globalError && <p className="error" style={{ marginTop: 8 }}>{globalError}</p>}
      {locked && (
        <p className="meta" style={{ marginTop: 10, fontSize: 12 }}>
          Le tournoi est verrouillé — déverrouillez-le pour modifier les équipes.
        </p>
      )}
    </div>
  );
}

function TeamRow({
  team, locked, maxPlayers, tournamentId,
  isEditing, onStartEdit, onCancelEdit, onDelete, onRemovePlayer,
  isPending, renameAction, addPlayerAction, startTransition, setEditingId,
}: {
  team: Team;
  locked: boolean;
  maxPlayers: number;
  tournamentId: string;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onRemovePlayer: (tpId: string, name: string) => void;
  isPending: boolean;
  renameAction: Props["renameAction"];
  addPlayerAction: Props["addPlayerAction"];
  startTransition: (fn: () => Promise<void>) => void;
  setEditingId: (id: string | null) => void;
}) {
  const [editName, setEditName] = useState(team.name);
  const [rowError, setRowError] = useState<string | null>(null);
  const [addMode, setAddMode] = useState<"search" | "manual" | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlayerResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualCity, setManualCity] = useState("");
  const [manualCountry, setManualCountry] = useState("");
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isEditing) { setEditName(team.name); setRowError(null); setAddMode(null); }
  }, [isEditing, team.name]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setShowResults(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const searchPlayers = useCallback((q: string) => {
    if (q.length < 2) { setResults([]); setShowResults(false); return; }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      const res = await fetch(`/api/players?search=${encodeURIComponent(q)}&excludeTournamentId=${tournamentId}`);
      const data = await res.json();
      setResults(data); setShowResults(true);
    }, 250);
  }, [tournamentId]);

  const handleRename = () => {
    setRowError(null);
    startTransition(async () => {
      const result = await renameAction(team.id, editName, tournamentId);
      if (result.ok) setEditingId(null);
      else setRowError(result.error ?? "Erreur");
    });
  };

  const handleAddExisting = (player: PlayerResult) => {
    setShowResults(false); setQuery(""); setRowError(null);
    startTransition(async () => {
      const result = await addPlayerAction(team.id, tournamentId, { type: "existing", playerId: player.id });
      if (result.ok) setAddMode(null);
      else setRowError(result.error ?? "Erreur");
    });
  };

  const handleAddManual = () => {
    if (!manualName.trim() || !manualCountry.trim()) { setRowError("Nom et pays requis."); return; }
    setRowError(null);
    startTransition(async () => {
      const result = await addPlayerAction(team.id, tournamentId, { type: "manual", name: manualName.trim(), city: manualCity || null, country: manualCountry.trim() });
      if (result.ok) { setAddMode(null); setManualName(""); setManualCity(""); setManualCountry(""); }
      else setRowError(result.error ?? "Erreur");
    });
  };

  const canAddPlayer = team.players.length < maxPlayers;

  return (
    <div className="panel" style={{ padding: "14px 18px" }}>
      {/* Team header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, background: "var(--border)", padding: "3px 8px", borderRadius: 4, flexShrink: 0 }}>
          #{team.seed}
        </span>

        {isEditing ? (
          <div style={{ display: "flex", gap: 8, flex: 1, alignItems: "center" }}>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") onCancelEdit(); }}
              autoFocus
              style={{ flex: 1, padding: "6px 10px", fontSize: 15, fontFamily: "var(--font-display)", fontWeight: 700 }}
            />
            <button className="primary" onClick={handleRename} disabled={isPending} style={{ padding: "6px 14px", fontSize: 13 }}>✓ Sauver</button>
            <button className="ghost" onClick={onCancelEdit} disabled={isPending} style={{ padding: "6px 14px", fontSize: 13 }}>Fermer</button>
          </div>
        ) : (
          <>
            <strong style={{ fontFamily: "var(--font-display)", fontSize: 16, flex: 1 }}>{team.name}</strong>
            {(team.city || team.country) && (
              <span className="meta" style={{ fontSize: 12 }}>{team.city ? `${team.city}, ` : ""}{team.country}</span>
            )}
            {!locked && (
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button className="ghost" onClick={onStartEdit} style={{ padding: "4px 10px", fontSize: 12 }}>✏️ Modifier</button>
                <button onClick={onDelete} disabled={isPending} style={{ background: "none", border: "1.5px solid var(--border)", borderRadius: 6, cursor: "pointer", color: "var(--danger, #e53e3e)", padding: "4px 10px", fontSize: 12 }}>🗑 Supprimer</button>
              </div>
            )}
          </>
        )}
      </div>

      {rowError && <p className="error" style={{ margin: "0 0 8px", fontSize: 13 }}>{rowError}</p>}

      {/* Players chips */}
      {team.players.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: isEditing ? 12 : 0 }}>
          {team.players.map((tp) => (
            <div key={tp.id} style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--surface-2)", border: "1.5px solid var(--border-light)", borderRadius: 20, padding: "4px 12px 4px 10px", fontSize: 13 }}>
              <span>👤</span>
              <span style={{ fontWeight: 600 }}>{tp.player.name}</span>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{tp.player.country}</span>
              {isEditing && !locked && (
                <button onClick={() => onRemovePlayer(tp.id, tp.player.name)} disabled={isPending} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger, #e53e3e)", fontSize: 14, padding: "0 2px", marginLeft: 2, lineHeight: 1 }}>✕</button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add player section — only in edit mode */}
      {isEditing && !locked && (
        <div style={{ borderTop: "1px solid var(--border-light)", paddingTop: 12 }}>
          {canAddPlayer ? (
            <>
              <p style={{ fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 8 }}>
                AJOUTER UN JOUEUR · {team.players.length}/{maxPlayers}
              </p>
              {addMode === null && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="ghost" style={{ fontSize: 12 }} onClick={() => setAddMode("search")}>🔍 Rechercher un joueur</button>
                  <button className="ghost" style={{ fontSize: 12 }} onClick={() => setAddMode("manual")}>✍️ Saisie manuelle</button>
                </div>
              )}

              {addMode === "search" && (
                <div ref={containerRef} style={{ position: "relative" }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      placeholder="Chercher un joueur..."
                      value={query}
                      onChange={(e) => { setQuery(e.target.value); searchPlayers(e.target.value); }}
                      onFocus={() => results.length > 0 && setShowResults(true)}
                      style={{ flex: 1 }}
                      autoFocus
                    />
                    <button className="ghost" style={{ fontSize: 12 }} onClick={() => { setAddMode(null); setQuery(""); setResults([]); }}>Annuler</button>
                  </div>
                  {showResults && results.length > 0 && (
                    <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--surface)", border: "2px solid var(--border)", borderRadius: 8, zIndex: 50, maxHeight: 180, overflowY: "auto", boxShadow: "var(--shadow-lg)" }}>
                      {results.map((p) => (
                        <button key={p.id} type="button" style={{ width: "100%", textAlign: "left", padding: "8px 12px", background: "none", border: "none", cursor: "pointer", borderBottom: "1px solid var(--border-light)" }} onMouseDown={() => handleAddExisting(p)}>
                          <strong style={{ fontSize: 13 }}>{p.name}</strong>
                          <span className="meta" style={{ marginLeft: 8, fontSize: 12 }}>{p.city ? `${p.city}, ` : ""}{p.country}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {showResults && results.length === 0 && query.length >= 2 && (
                    <p className="meta" style={{ marginTop: 4, fontSize: 12 }}>Aucun résultat — essayez la saisie manuelle</p>
                  )}
                </div>
              )}

              {addMode === "manual" && (
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                    <input placeholder="Prénom Nom *" value={manualName} onChange={(e) => setManualName(e.target.value)} autoFocus />
                    <input placeholder="Ville" value={manualCity} onChange={(e) => setManualCity(e.target.value)} />
                    <input placeholder="Pays *" value={manualCountry} onChange={(e) => setManualCountry(e.target.value)} />
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="primary" style={{ fontSize: 12 }} onClick={handleAddManual} disabled={isPending}>Ajouter</button>
                    <button className="ghost" style={{ fontSize: 12 }} onClick={() => { setAddMode(null); setManualName(""); setManualCity(""); setManualCountry(""); }}>Annuler</button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="meta" style={{ fontSize: 12 }}>Équipe complète ({maxPlayers}/{maxPlayers} joueurs · format {maxPlayers}v{maxPlayers})</p>
          )}
        </div>
      )}
    </div>
  );
}
