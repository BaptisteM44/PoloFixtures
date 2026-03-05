"use client";

import { useState, useTransition } from "react";

type TeamRow = {
  id: string;
  name: string;
  seed: number;
  city: string | null;
  country: string | null;
  selected: boolean;
  guaranteed: boolean;
};

type Props = {
  teams: TeamRow[];
  maxTeams: number;
  tournamentId: string;
  toggleAction: (teamId: string, tournamentId: string, selected: boolean) => Promise<{ ok?: boolean; error?: string }>;
  drawAction: (tournamentId: string, count: number) => Promise<{ ok?: boolean; error?: string }>;
  guaranteeAction: (teamId: string, tournamentId: string, guaranteed: boolean) => Promise<{ ok?: boolean; error?: string }>;
};

export function SelectionManager({ teams: initial, maxTeams, tournamentId, toggleAction, drawAction, guaranteeAction }: Props) {
  const [teams, setTeams] = useState(initial);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const guaranteed = teams.filter((t) => t.guaranteed);
  const pool = teams.filter((t) => !t.guaranteed);
  const selectedInPool = pool.filter((t) => t.selected);
  const slotsLeft = Math.max(0, maxTeams - guaranteed.length);
  const totalSelected = guaranteed.length + selectedInPool.length;
  const overLimit = totalSelected > maxTeams;
  const allFit = teams.length <= maxTeams;

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleToggle(teamId: string, current: boolean) {
    setTeams((prev) => prev.map((t) => (t.id === teamId ? { ...t, selected: !current } : t)));
    startTransition(async () => {
      const res = await toggleAction(teamId, tournamentId, !current);
      if (res.error) setError(res.error);
    });
  }

  function handleGuarantee(teamId: string, current: boolean) {
    setTeams((prev) =>
      prev.map((t) =>
        t.id === teamId
          ? { ...t, guaranteed: !current, selected: !current ? true : t.selected }
          : t
      )
    );
    startTransition(async () => {
      const res = await guaranteeAction(teamId, tournamentId, !current);
      if (res.error) setError(res.error);
    });
  }

  function handleDraw() {
    setError(null);
    // Preview côté client : shuffle le pool et sélectionne slotsLeft
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const drawnIds = new Set(shuffled.slice(0, slotsLeft).map((t) => t.id));
    setTeams((prev) =>
      prev.map((t) =>
        t.guaranteed ? t : { ...t, selected: drawnIds.has(t.id) }
      )
    );
    startTransition(async () => {
      const res = await drawAction(tournamentId, maxTeams);
      if (res.error) setError(res.error);
    });
  }

  function handleSelectAll() {
    setError(null);
    setTeams((prev) => prev.map((t) => ({ ...t, selected: true })));
    startTransition(async () => {
      for (const t of teams) {
        if (!t.selected) await toggleAction(t.id, tournamentId, true);
      }
    });
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="selection-manager">
      {/* Header */}
      <div className="selection-manager__header">
        <div>
          <h4 style={{ margin: 0, fontFamily: "var(--font-display)" }}>Sélection des équipes</h4>
          <p className="meta" style={{ margin: "4px 0 0" }}>
            {guaranteed.length > 0 && (
              <span style={{ color: "var(--teal)", fontWeight: 700 }}>
                {guaranteed.length} garantie{guaranteed.length > 1 ? "s" : ""}
              </span>
            )}
            {guaranteed.length > 0 && selectedInPool.length > 0 && <span> + </span>}
            {selectedInPool.length > 0 && (
              <span style={{ fontWeight: 700, color: overLimit ? "var(--danger)" : "inherit" }}>
                {selectedInPool.length} tirée{selectedInPool.length > 1 ? "s" : ""}
              </span>
            )}
            {(guaranteed.length > 0 || selectedInPool.length > 0) && (
              <span style={{ color: overLimit ? "var(--danger)" : "var(--text-muted)" }}>
                {" "}= {totalSelected} / {maxTeams}
              </span>
            )}
            {totalSelected === 0 && (
              <span style={{ color: "var(--text-muted)" }}>{teams.length} équipes inscrites</span>
            )}
            {overLimit && (
              <span style={{ color: "var(--danger)", marginLeft: 8 }}>⚠ Trop d&apos;équipes</span>
            )}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {allFit ? (
            <button
              className="primary"
              onClick={handleSelectAll}
              disabled={isPending}
              style={{ fontSize: 13 }}
            >
              ✅ Valider toutes ({teams.length})
            </button>
          ) : (
            <button
              className="primary"
              onClick={handleDraw}
              disabled={isPending || pool.length === 0 || slotsLeft === 0}
              style={{ fontSize: 13 }}
            >
              🎲 Tirage au sort ({slotsLeft} place{slotsLeft > 1 ? "s" : ""})
            </button>
          )}
        </div>
      </div>

      {error && <p style={{ color: "var(--danger)", marginBottom: 8, fontSize: 13 }}>{error}</p>}

      {/* Section garanties */}
      {guaranteed.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <p className="meta" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 11, marginBottom: 6 }}>
            ✅ Équipes validées IN ({guaranteed.length})
          </p>
          <div className="selection-manager__list">
            {[...guaranteed].sort((a, b) => a.seed - b.seed).map((team) => (
              <div key={team.id} className="selection-team-row selection-team-row--guaranteed">
                <span style={{ fontWeight: 600 }}>#{team.seed} {team.name}</span>
                {(team.city || team.country) && (
                  <span className="meta" style={{ marginLeft: 8, fontSize: 12 }}>
                    {team.city ? `${team.city}, ` : ""}{team.country}
                  </span>
                )}
                <button
                  onClick={() => handleGuarantee(team.id, true)}
                  disabled={isPending}
                  className="ghost"
                  style={{ marginLeft: "auto", fontSize: 11, padding: "2px 8px", color: "var(--text-muted)" }}
                  title="Retirer de la liste garantie"
                >
                  × Retirer
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section pool */}
      {pool.length > 0 && (
        <div>
          <p className="meta" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 11, marginBottom: 6 }}>
            {guaranteed.length > 0
              ? `🎲 Pool tirage (${pool.length} équipes, ${slotsLeft} place${slotsLeft > 1 ? "s" : ""} restante${slotsLeft > 1 ? "s" : ""})`
              : `Équipes inscrites (${pool.length})`}
          </p>
          <div className="selection-manager__list">
            {[...pool].sort((a, b) => a.seed - b.seed).map((team) => (
              <div
                key={team.id}
                className={`selection-team-row ${team.selected ? "selection-team-row--selected" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={team.selected}
                  onChange={() => handleToggle(team.id, team.selected)}
                  disabled={isPending}
                  style={{ cursor: "pointer" }}
                />
                <span style={{ fontWeight: 600 }}>#{team.seed} {team.name}</span>
                {(team.city || team.country) && (
                  <span className="meta" style={{ marginLeft: 8, fontSize: 12 }}>
                    {team.city ? `${team.city}, ` : ""}{team.country}
                  </span>
                )}
                {!team.selected && (
                  <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-display)", fontWeight: 700 }}>
                    LISTE D&apos;ATTENTE
                  </span>
                )}
                <button
                  onClick={() => handleGuarantee(team.id, false)}
                  disabled={isPending}
                  className="ghost"
                  style={{ marginLeft: team.selected ? "auto" : 0, fontSize: 11, padding: "2px 8px", color: "var(--teal)", fontWeight: 700 }}
                  title="Valider définitivement cette équipe IN"
                >
                  ✓ Valider IN
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {isPending && (
        <p className="meta" style={{ marginTop: 8, fontSize: 12 }}>Enregistrement…</p>
      )}
    </div>
  );
}
