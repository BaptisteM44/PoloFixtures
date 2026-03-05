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
  drawOneAction: (tournamentId: string, candidateIds: string[]) => Promise<{ ok?: boolean; winnerId?: string; error?: string }>;
};

export function SelectionManager({
  teams: initial,
  maxTeams,
  tournamentId,
  toggleAction,
  drawAction,
  guaranteeAction,
  drawOneAction,
}: Props) {
  const [teams, setTeams] = useState(initial);
  // drawPool = IDs des équipes cochées pour le prochain tirage unitaire
  const [drawPool, setDrawPool] = useState<Set<string>>(new Set());
  const [lastWinnerId, setLastWinnerId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const guaranteed = teams.filter((t) => t.guaranteed);
  const pool = teams.filter((t) => !t.guaranteed);
  const slotsLeft = Math.max(0, maxTeams - guaranteed.length);
  const allFit = teams.length <= maxTeams;

  // ── Handlers ──────────────────────────────────────────────────────────────

  function toggleDrawPool(id: string) {
    setDrawPool((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAllPool() {
    setDrawPool(new Set(pool.map((t) => t.id)));
  }

  function clearDrawPool() {
    setDrawPool(new Set());
  }

  function handleGuarantee(teamId: string, current: boolean) {
    setTeams((prev) =>
      prev.map((t) =>
        t.id === teamId
          ? { ...t, guaranteed: !current, selected: !current ? true : t.selected }
          : t
      )
    );
    if (current) setDrawPool((prev) => { const n = new Set(prev); n.delete(teamId); return n; });
    startTransition(async () => {
      const res = await guaranteeAction(teamId, tournamentId, !current);
      if (res.error) setError(res.error);
    });
  }

  /** Tirage unitaire : 1 équipe tirée au sort parmi le drawPool */
  function handleDrawOne() {
    setError(null);
    setLastWinnerId(null);
    const candidates = Array.from(drawPool).filter((id) => pool.some((t) => t.id === id));
    if (candidates.length === 0) return;

    const winnerId = candidates[Math.floor(Math.random() * candidates.length)];
    setLastWinnerId(winnerId);
    setTeams((prev) =>
      prev.map((t) => (t.id === winnerId ? { ...t, guaranteed: true, selected: true } : t))
    );
    setDrawPool((prev) => { const n = new Set(prev); n.delete(winnerId); return n; });

    startTransition(async () => {
      const res = await drawOneAction(tournamentId, candidates);
      if (res.error) {
        setError(res.error);
        setTeams((prev) => prev.map((t) => (t.id === winnerId ? { ...t, guaranteed: false } : t)));
        setLastWinnerId(null);
      }
    });
  }

  /** Tirage global : remplit tous les slots restants d'un coup */
  function handleDrawAll() {
    setError(null);
    setLastWinnerId(null);
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const drawnIds = new Set(shuffled.slice(0, slotsLeft).map((t) => t.id));
    setTeams((prev) =>
      prev.map((t) => t.guaranteed ? t : { ...t, selected: drawnIds.has(t.id) })
    );
    startTransition(async () => {
      const res = await drawAction(tournamentId, maxTeams);
      if (res.error) setError(res.error);
    });
  }

  /** Valider toutes (quand total ≤ maxTeams) */
  function handleSelectAll() {
    setError(null);
    setTeams((prev) => prev.map((t) => ({ ...t, selected: true, guaranteed: true })));
    startTransition(async () => {
      for (const t of pool) {
        await guaranteeAction(t.id, tournamentId, true);
      }
    });
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const drawPoolTeams = pool.filter((t) => drawPool.has(t.id));

  return (
    <div className="selection-manager">

      {/* ── Header bilan ──────────────────────────────────────────────── */}
      <div className="selection-manager__header">
        <div>
          <h4 style={{ margin: 0, fontFamily: "var(--font-display)" }}>Sélection des équipes</h4>
          <p className="meta" style={{ margin: "4px 0 0", display: "flex", flexWrap: "wrap", gap: 8 }}>
            <span style={{ color: "#16a34a", fontWeight: 700 }}>✅ {guaranteed.length} IN</span>
            <span style={{ color: "var(--text-muted)" }}>·</span>
            <span style={{ color: "var(--text-muted)" }}>{pool.length} en attente</span>
            <span style={{ color: "var(--text-muted)" }}>·</span>
            <span style={{ fontWeight: 700, color: slotsLeft === 0 ? "#16a34a" : "inherit" }}>
              {slotsLeft} place{slotsLeft > 1 ? "s" : ""} restante{slotsLeft > 1 ? "s" : ""}
            </span>
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {allFit ? (
            <button className="primary" onClick={handleSelectAll} disabled={isPending} style={{ fontSize: 13 }}>
              ✅ Valider toutes ({teams.length})
            </button>
          ) : (
            <button
              className="ghost"
              onClick={handleDrawAll}
              disabled={isPending || pool.length === 0 || slotsLeft === 0}
              style={{ fontSize: 12 }}
              title="Tire tous les slots restants en une seule fois"
            >
              ⚡ Tirage rapide ({slotsLeft} d&apos;un coup)
            </button>
          )}
        </div>
      </div>

      {error && <p style={{ color: "var(--danger)", marginBottom: 8, fontSize: 13 }}>{error}</p>}

      {/* ── Section IN garantis ───────────────────────────────────────── */}
      {guaranteed.length > 0 && (
        <section style={{ marginBottom: 20 }}>
          <p className="meta" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 11, marginBottom: 6, color: "#16a34a" }}>
            ✅ Équipes IN ({guaranteed.length})
          </p>
          <div className="selection-manager__list">
            {[...guaranteed].sort((a, b) => a.seed - b.seed).map((team) => (
              <div
                key={team.id}
                className={`selection-team-row selection-team-row--guaranteed${lastWinnerId === team.id ? " selection-team-row--winner" : ""}`}
              >
                {lastWinnerId === team.id && <span style={{ fontSize: 18 }}>🎉</span>}
                <span style={{ fontWeight: 600 }}>#{team.seed} {team.name}</span>
                {(team.city || team.country) && (
                  <span className="meta" style={{ marginLeft: 6, fontSize: 12 }}>
                    {team.city ? `${team.city}, ` : ""}{team.country}
                  </span>
                )}
                {lastWinnerId === team.id && (
                  <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 700, fontFamily: "var(--font-display)" }}>
                    TIRÉ AU SORT
                  </span>
                )}
                <button
                  onClick={() => handleGuarantee(team.id, true)}
                  disabled={isPending}
                  className="ghost"
                  style={{ marginLeft: "auto", fontSize: 11, padding: "2px 8px", color: "var(--text-muted)" }}
                  title="Remettre dans le pool"
                >
                  × Retirer
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Pool + tirage unitaire ────────────────────────────────────── */}
      {pool.length > 0 && slotsLeft > 0 && (
        <section style={{ marginBottom: 20 }}>
          {/* Toolbar tirage */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
            <p className="meta" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 11, margin: 0, color: "#f97316" }}>
              🎲 Pool ({pool.length} équipes · {drawPoolTeams.length} dans ce tirage)
            </p>
            <div style={{ display: "flex", gap: 6, marginLeft: "auto", flexWrap: "wrap", alignItems: "center" }}>
              <button className="ghost" onClick={selectAllPool} disabled={isPending || pool.length === 0} style={{ fontSize: 11, padding: "3px 10px" }}>
                Tout cocher
              </button>
              <button className="ghost" onClick={clearDrawPool} disabled={isPending || drawPool.size === 0} style={{ fontSize: 11, padding: "3px 10px" }}>
                Tout décocher
              </button>
              <button
                className="primary"
                onClick={handleDrawOne}
                disabled={isPending || drawPoolTeams.length === 0}
                style={{ fontSize: 13, padding: "5px 18px" }}
              >
                🎲 Tirer 1 équipe{drawPoolTeams.length > 0 ? ` (parmi ${drawPoolTeams.length})` : ""}
              </button>
            </div>
          </div>

          <div className="selection-manager__list">
            {[...pool].sort((a, b) => a.seed - b.seed).map((team) => {
              const inDraw = drawPool.has(team.id);
              return (
                <div
                  key={team.id}
                  className={`selection-team-row${inDraw ? " selection-team-row--in-draw" : ""}`}
                  onClick={() => toggleDrawPool(team.id)}
                  style={{ cursor: "pointer" }}
                >
                  <input
                    type="checkbox"
                    checked={inDraw}
                    onChange={() => toggleDrawPool(team.id)}
                    disabled={isPending}
                    onClick={(e) => e.stopPropagation()}
                    style={{ cursor: "pointer", accentColor: "#f97316" }}
                  />
                  <span style={{ fontWeight: 600 }}>#{team.seed} {team.name}</span>
                  {(team.city || team.country) && (
                    <span className="meta" style={{ marginLeft: 6, fontSize: 12 }}>
                      {team.city ? `${team.city}, ` : ""}{team.country}
                    </span>
                  )}
                  <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
                    {inDraw && (
                      <span style={{ fontSize: 10, color: "#f97316", fontFamily: "var(--font-display)", fontWeight: 700 }}>
                        DANS LE TIRAGE
                      </span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleGuarantee(team.id, false); }}
                      disabled={isPending}
                      className="ghost"
                      style={{ fontSize: 11, padding: "2px 8px", color: "var(--teal)", fontWeight: 700 }}
                      title="Valider directement IN sans tirage"
                    >
                      ✓ Valider IN
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="meta" style={{ fontSize: 11, marginTop: 6, color: "var(--text-muted)" }}>
            Coche les équipes à inclure dans le prochain tirage — clique sur une ligne pour la (dé)cocher
          </p>
        </section>
      )}

      {/* ── Liste d'attente (slots remplis) ──────────────────────────── */}
      {slotsLeft === 0 && pool.length > 0 && (
        <section>
          <p className="meta" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 11, marginBottom: 6, color: "var(--text-muted)" }}>
            ⏳ Liste d&apos;attente ({pool.length})
          </p>
          <div className="selection-manager__list">
            {[...pool].sort((a, b) => a.seed - b.seed).map((team) => (
              <div key={team.id} className="selection-team-row" style={{ opacity: 0.55 }}>
                <span style={{ fontWeight: 600 }}>#{team.seed} {team.name}</span>
                {(team.city || team.country) && (
                  <span className="meta" style={{ marginLeft: 6, fontSize: 12 }}>
                    {team.city ? `${team.city}, ` : ""}{team.country}
                  </span>
                )}
                <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-display)", fontWeight: 700 }}>
                  LISTE D&apos;ATTENTE
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {isPending && (
        <p className="meta" style={{ marginTop: 8, fontSize: 12 }}>Enregistrement…</p>
      )}
    </div>
  );
}

