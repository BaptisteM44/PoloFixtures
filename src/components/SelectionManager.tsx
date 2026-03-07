"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

type TeamRow = {
  id: string;
  name: string;
  seed: number;
  city: string | null;
  country: string | null;
  selected: boolean;
  guaranteed: boolean;
  waitlistPosition: number | null;
};

type Props = {
  teams: TeamRow[];
  maxTeams: number;
  tournamentId: string;
  toggleAction: (teamId: string, tournamentId: string, selected: boolean) => Promise<{ ok?: boolean; error?: string }>;
  drawAction: (tournamentId: string, count: number, preDrawnIds?: string[]) => Promise<{ ok?: boolean; error?: string }>;
  guaranteeAction: (teamId: string, tournamentId: string, guaranteed: boolean) => Promise<{ ok?: boolean; error?: string }>;
  drawOneAction: (tournamentId: string, candidateIds: string[]) => Promise<{ ok?: boolean; winnerId?: string; error?: string }>;
  drawOneWaitlistAction: (tournamentId: string, candidateIds: string[]) => Promise<{ ok?: boolean; winnerId?: string; waitlistPosition?: number; error?: string }>;
  removeFromWaitlistAction: (tournamentId: string, teamId: string) => Promise<{ ok?: boolean; error?: string }>;
};

export function SelectionManager({
  teams: initial,
  maxTeams,
  tournamentId,
  toggleAction,
  drawAction,
  guaranteeAction,
  drawOneAction,
  drawOneWaitlistAction,
  removeFromWaitlistAction,
}: Props) {
  const t = useTranslations("selection");
  const [teams, setTeams] = useState(initial);
  const [drawPool, setDrawPool] = useState<Set<string>>(new Set());
  const [wlDrawPool, setWlDrawPool] = useState<Set<string>>(new Set());
  const [lastWinnerId, setLastWinnerId] = useState<string | null>(null);
  const [lastWlWinnerId, setLastWlWinnerId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const guaranteed = teams.filter((t) => t.guaranteed);
  // Pool = pas guaranteed, pas encore en WL
  const pool = teams.filter((t) => !t.guaranteed && t.waitlistPosition === null);
  // WL déjà classés
  const waitlisted = teams.filter((t) => !t.guaranteed && t.waitlistPosition !== null)
    .sort((a, b) => (a.waitlistPosition ?? 0) - (b.waitlistPosition ?? 0));
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

  function toggleWlDrawPool(id: string) {
    setWlDrawPool((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAllWlPool() {
    setWlDrawPool(new Set(pool.map((t) => t.id)));
  }

  function clearWlDrawPool() {
    setWlDrawPool(new Set());
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

  function handleRemoveFromWaitlist(teamId: string, removedRank: number) {
    setTeams((prev) =>
      prev.map((t) => {
        if (t.id === teamId) return { ...t, waitlistPosition: null };
        if (t.waitlistPosition !== null && t.waitlistPosition > removedRank) return { ...t, waitlistPosition: t.waitlistPosition - 1 };
        return t;
      })
    );
    startTransition(async () => {
      const res = await removeFromWaitlistAction(tournamentId, teamId);
      if (res.error) setError(res.error);
    });
  }

  /** Tirage waiting list : 1 équipe tirée au sort parmi le wlDrawPool → rang WL suivant */
  function handleDrawOneWaitlist() {
    setError(null);
    setLastWlWinnerId(null);
    const candidates = Array.from(wlDrawPool).filter((id) => pool.some((t) => t.id === id));
    if (candidates.length === 0) return;

    const winnerId = candidates[Math.floor(Math.random() * candidates.length)];
    const nextRank = (Math.max(0, ...waitlisted.map((t) => t.waitlistPosition ?? 0))) + 1;
    setLastWlWinnerId(winnerId);
    setTeams((prev) =>
      prev.map((t) => (t.id === winnerId ? { ...t, waitlistPosition: nextRank, selected: false } : t))
    );
    setWlDrawPool((prev) => { const n = new Set(prev); n.delete(winnerId); return n; });

    startTransition(async () => {
      const res = await drawOneWaitlistAction(tournamentId, candidates);
      if (res.error) {
        setError(res.error);
        setTeams((prev) => prev.map((t) => (t.id === winnerId ? { ...t, waitlistPosition: null } : t)));
        setLastWlWinnerId(null);
      }
    });
  }

  /** Tirage global : remplit tous les slots restants d'un coup */
  function handleDrawAll() {
    setError(null);
    setLastWinnerId(null);
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const drawn = shuffled.slice(0, slotsLeft);
    const drawnIds = new Set(drawn.map((t) => t.id));
    setTeams((prev) =>
      prev.map((t) => t.guaranteed ? t : { ...t, selected: drawnIds.has(t.id), guaranteed: drawnIds.has(t.id) })
    );
    startTransition(async () => {
      const res = await drawAction(tournamentId, maxTeams, Array.from(drawnIds));
      if (res.error) setError(res.error);
    });
  }

  /** Valider toutes (quand total ≤ maxTeams) */
  function handleSelectAll() {
    setError(null);
    setTeams((prev) => prev.map((t) => ({ ...t, selected: true, guaranteed: true })));
    startTransition(async () => {
      await Promise.all(pool.map((t) => guaranteeAction(t.id, tournamentId, true)));
    });
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const drawPoolTeams = pool.filter((t) => drawPool.has(t.id));
  const wlDrawPoolTeams = pool.filter((t) => wlDrawPool.has(t.id));

  return (
    <div className="selection-manager">

      {/* ── Header bilan ──────────────────────────────────────────────── */}
      <div className="selection-manager__header">
        <div>
          <h4 style={{ margin: 0, fontFamily: "var(--font-display)" }}>{t("header_title")}</h4>
          <p className="meta" style={{ margin: "4px 0 0", display: "flex", flexWrap: "wrap", gap: 8 }}>
            <span style={{ color: "#16a34a", fontWeight: 700 }}>{t("header_in", { count: guaranteed.length })}</span>
            <span style={{ color: "var(--text-muted)" }}>·</span>
            <span style={{ color: "var(--text-muted)" }}>{t("header_pool", { count: pool.length })}</span>
            <span style={{ color: "var(--text-muted)" }}>·</span>
            <span style={{ fontWeight: 700, color: slotsLeft === 0 ? "#16a34a" : "inherit" }}>
              {slotsLeft === 1 ? t("slots_left_one", { count: slotsLeft }) : t("slots_left_other", { count: slotsLeft })}
            </span>
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {allFit ? (
            <button className="primary" onClick={handleSelectAll} disabled={isPending} style={{ fontSize: 13 }}>
              {t("validate_all_btn", { count: teams.length })}
            </button>
          ) : (
            <button
              className="ghost"
              onClick={handleDrawAll}
              disabled={isPending || pool.length === 0 || slotsLeft === 0}
              style={{ fontSize: 12 }}
            >
              {t("draw_all_btn", { count: slotsLeft })}
            </button>
          )}
        </div>
      </div>

      {error && <p style={{ color: "var(--danger)", marginBottom: 8, fontSize: 13 }}>{error}</p>}

      {/* ── Section IN garantis ───────────────────────────────────────── */}
      {guaranteed.length > 0 && (
        <section style={{ marginBottom: 20 }}>
          <p className="meta" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 11, marginBottom: 6, color: "#16a34a" }}>
            {t("section_in_header", { count: guaranteed.length })}
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
                    {t("drawn_label")}
                  </span>
                )}
                <button
                  onClick={() => handleGuarantee(team.id, true)}
                  disabled={isPending}
                  className="ghost"
                  style={{ marginLeft: "auto", fontSize: 11, padding: "2px 8px", color: "var(--text-muted)" }}
                >
                  {t("btn_remove")}
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
              {t("pool_header", { count: pool.length, inDraw: drawPoolTeams.length })}
            </p>
            <div style={{ display: "flex", gap: 6, marginLeft: "auto", flexWrap: "wrap", alignItems: "center" }}>
              <button className="ghost" onClick={selectAllPool} disabled={isPending || pool.length === 0} style={{ fontSize: 11, padding: "3px 10px" }}>
                {t("btn_select_all_pool")}
              </button>
              <button className="ghost" onClick={clearDrawPool} disabled={isPending || drawPool.size === 0} style={{ fontSize: 11, padding: "3px 10px" }}>
                {t("btn_clear_pool")}
              </button>
              <button
                className="primary"
                onClick={handleDrawOne}
                disabled={isPending || drawPoolTeams.length === 0}
                style={{ fontSize: 13, padding: "5px 18px" }}
              >
                {t("btn_draw_one", { count: drawPoolTeams.length })}
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
                        {t("in_draw_label")}
                      </span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleGuarantee(team.id, false); }}
                      disabled={isPending}
                      className="ghost"
                      style={{ fontSize: 11, padding: "2px 8px", color: "var(--teal)", fontWeight: 700 }}
                    >
                      {t("btn_guarantee")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="meta" style={{ fontSize: 11, marginTop: 6, color: "var(--text-muted)" }}>
            {t("pool_hint")}
          </p>
        </section>
      )}

      {/* ── Liste d'attente : section complète (slots remplis) ───────── */}
      {slotsLeft === 0 && (waitlisted.length > 0 || pool.length > 0) && (
        <section>
          <p className="meta" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 11, marginBottom: 10, color: "var(--text-muted)" }}>
            {t("wl_header", { count: waitlisted.length + pool.length })}
          </p>

          {/* Équipes déjà classées dans la WL */}
          {waitlisted.length > 0 && (
            <div className="selection-manager__list" style={{ marginBottom: pool.length > 0 ? 12 : 0 }}>
              {waitlisted.map((team) => (
                <div
                  key={team.id}
                  className={`selection-team-row selection-team-row--waitlist${lastWlWinnerId === team.id ? " selection-team-row--winner" : ""}`}
                >
                  <span style={{ fontSize: 11, fontWeight: 800, fontFamily: "var(--font-display)", color: "var(--text-muted)", minWidth: 36 }}>
                    WL #{team.waitlistPosition}
                  </span>
                  {lastWlWinnerId === team.id && <span style={{ fontSize: 16 }}>🎉</span>}
                  <span style={{ fontWeight: 600 }}>{team.name}</span>
                  {(team.city || team.country) && (
                    <span className="meta" style={{ marginLeft: 6, fontSize: 12 }}>
                      {team.city ? `${team.city}, ` : ""}{team.country}
                    </span>
                  )}
                  <button
                    onClick={() => handleRemoveFromWaitlist(team.id, team.waitlistPosition!)}
                    disabled={isPending}
                    className="ghost"
                    style={{ marginLeft: "auto", fontSize: 11, padding: "2px 8px", color: "var(--text-muted)" }}
                  >
                    {t("btn_remove")}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Équipes restantes non encore classées → tirage WL */}
          {pool.length > 0 && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                <p className="meta" style={{ fontWeight: 700, fontSize: 11, margin: 0, color: "#6366f1" }}>
                  {t("wl_draw_header", { count: pool.length, inDraw: wlDrawPoolTeams.length })}
                </p>
                <div style={{ display: "flex", gap: 6, marginLeft: "auto", flexWrap: "wrap", alignItems: "center" }}>
                  <button className="ghost" onClick={selectAllWlPool} disabled={isPending || pool.length === 0} style={{ fontSize: 11, padding: "3px 10px" }}>
                    {t("btn_select_all_wl")}
                  </button>
                  <button className="ghost" onClick={clearWlDrawPool} disabled={isPending || wlDrawPool.size === 0} style={{ fontSize: 11, padding: "3px 10px" }}>
                    {t("btn_clear_wl")}
                  </button>
                  <button
                    className="primary"
                    onClick={handleDrawOneWaitlist}
                    disabled={isPending || wlDrawPoolTeams.length === 0}
                    style={{ fontSize: 13, padding: "5px 18px", background: "#6366f1" }}
                  >
                    {t("wl_draw_btn", { rank: waitlisted.length + 1 })}
                  </button>
                </div>
              </div>

              <div className="selection-manager__list">
                {[...pool].sort((a, b) => a.seed - b.seed).map((team) => {
                  const inWl = wlDrawPool.has(team.id);
                  return (
                    <div
                      key={team.id}
                      className={`selection-team-row selection-team-row--waitlist-pool${inWl ? " selection-team-row--in-wl-draw" : ""}`}
                      onClick={() => toggleWlDrawPool(team.id)}
                      style={{ cursor: "pointer", opacity: 0.75 }}
                    >
                      <input
                        type="checkbox"
                        checked={inWl}
                        onChange={() => toggleWlDrawPool(team.id)}
                        disabled={isPending}
                        onClick={(e) => e.stopPropagation()}
                        style={{ cursor: "pointer", accentColor: "#6366f1" }}
                      />
                      <span style={{ fontWeight: 600 }}>#{team.seed} {team.name}</span>
                      {(team.city || team.country) && (
                        <span className="meta" style={{ marginLeft: 6, fontSize: 12 }}>
                          {team.city ? `${team.city}, ` : ""}{team.country}
                        </span>
                      )}
                      <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
                        {inWl && (
                          <span style={{ fontSize: 10, color: "#6366f1", fontFamily: "var(--font-display)", fontWeight: 700 }}>
                            {t("in_draw_label")}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="meta" style={{ fontSize: 11, marginTop: 6, color: "var(--text-muted)" }}>
                {t("wl_hint")}
              </p>
            </>
          )}
        </section>
      )}

      {isPending && (
        <p className="meta" style={{ marginTop: 8, fontSize: 12 }}>{t("saving")}</p>
      )}
    </div>
  );
}

