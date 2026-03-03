"use client";

import { useState, useTransition } from "react";

type TeamRow = {
  id: string;
  name: string;
  seed: number;
  city: string | null;
  country: string | null;
  selected: boolean;
};

type Props = {
  teams: TeamRow[];
  maxTeams: number;
  tournamentId: string;
  toggleAction: (teamId: string, tournamentId: string, selected: boolean) => Promise<{ ok?: boolean; error?: string }>;
  drawAction: (tournamentId: string, count: number) => Promise<{ ok?: boolean; error?: string }>;
};

export function SelectionManager({ teams: initialTeams, maxTeams, tournamentId, toggleAction, drawAction }: Props) {
  const [teams, setTeams] = useState(initialTeams);
  const [isPending, startTransition] = useTransition();
  const [drawError, setDrawError] = useState<string | null>(null);

  const selectedCount = teams.filter((t) => t.selected).length;
  const overLimit = selectedCount > maxTeams;

  function handleToggle(teamId: string, current: boolean) {
    const next = !current;
    setTeams((prev) => prev.map((t) => (t.id === teamId ? { ...t, selected: next } : t)));
    startTransition(async () => {
      await toggleAction(teamId, tournamentId, next);
    });
  }

  function handleDraw() {
    setDrawError(null);
    startTransition(async () => {
      const shuffled = [...teams].sort(() => Math.random() - 0.5);
      const selectedIds = new Set(shuffled.slice(0, maxTeams).map((t) => t.id));
      setTeams((prev) => prev.map((t) => ({ ...t, selected: selectedIds.has(t.id) })));
      const res = await drawAction(tournamentId, maxTeams);
      if (res.error) setDrawError(res.error);
    });
  }

  return (
    <div className="selection-manager">
      <div className="selection-manager__header">
        <div>
          <h4 style={{ margin: 0, fontFamily: "var(--font-display)" }}>Sélection des équipes</h4>
          <p className="meta" style={{ margin: "4px 0 0" }}>
            <span style={{ fontWeight: 700, color: overLimit ? "var(--danger)" : "var(--teal)" }}>
              {selectedCount} / {maxTeams}
            </span>{" "}
            équipes sélectionnées
            {overLimit && <span style={{ color: "var(--danger)", marginLeft: 8 }}>⚠ Trop d&apos;équipes sélectionnées</span>}
          </p>
        </div>
        <button
          className="primary"
          onClick={handleDraw}
          disabled={isPending || teams.length === 0}
          style={{ fontSize: 13 }}
        >
          🎲 Tirage au sort ({maxTeams})
        </button>
      </div>

      {drawError && <p style={{ color: "var(--danger)", marginBottom: 8 }}>{drawError}</p>}

      <div className="selection-manager__list">
        {[...teams].sort((a, b) => a.seed - b.seed).map((team) => (
          <label
            key={team.id}
            className={`selection-team-row ${team.selected ? "selection-team-row--selected" : ""}`}
          >
            <input
              type="checkbox"
              checked={team.selected}
              onChange={() => handleToggle(team.id, team.selected)}
              disabled={isPending}
            />
            <span style={{ fontWeight: 600 }}>#{team.seed} {team.name}</span>
            {(team.city || team.country) && (
              <span className="meta" style={{ marginLeft: 8, fontSize: 12 }}>
                {team.city ? `${team.city}, ` : ""}{team.country}
              </span>
            )}
            {!team.selected && (
              <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-display)", fontWeight: 700 }}>
                LISTE D&apos;ATTENTE
              </span>
            )}
          </label>
        ))}
      </div>

      {isPending && <p className="meta" style={{ marginTop: 8 }}>Enregistrement…</p>}
    </div>
  );
}
