"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";

export type MatchForEdit = {
  id: string;
  teamAId: string | null;
  teamBId: string | null;
  teamAName: string;
  teamBName: string;
  scoreA: number;
  scoreB: number;
  status: string;
  phase: string;
  roundIndex: number;
  courtName: string;
  nextMatchWinId?: string | null;
  nextSlotWin?: string | null;
  refereePlayerId?: string | null;
  coRefereePlayerId?: string | null;
};

type SavePayload = {
  id: string;
  scoreA: number;
  scoreB: number;
  status: string;
  teamAId?: string | null;
  teamBId?: string | null;
  advance?: {
    nextMatchId: string;
    slot: "A" | "B";
    winnerTeamId: string;
  };
};

const PHASE_LABEL: Record<string, string> = {
  POOL: "Poule", SWISS: "Swiss", BRACKET: "Tableau",
};

type TeamOption = { id: string; name: string };

type Props = {
  match: MatchForEdit | null;
  onClose: () => void;
  onSaved: (updated: SavePayload) => void;
  onReset?: (matchId: string) => void;
  onSwapped?: (matchAId: string, matchBId: string, courtA: string, startAtA: string, courtB: string, startAtB: string) => void;
  isOrganizer?: boolean;
  teams?: TeamOption[];
  /** Tous les matchs du tournoi pour le swap */
  allMatches?: { id: string; courtName: string; roundIndex: number; phase: string; teamAName: string; teamBName: string; startAt: string }[];
  courtNames?: string[];
};

export function MatchEditPanel({ match, onClose, onSaved, onReset, onSwapped, isOrganizer, teams, allMatches, courtNames }: Props) {
  const { data: session } = useSession();
  const t = useTranslations("match");
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [status, setStatus] = useState("SCHEDULED");
  const [teamAId, setTeamAId] = useState<string | null>(null);
  const [teamBId, setTeamBId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Reset
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // Swap
  const [swapMatchId, setSwapMatchId] = useState("");
  const [swapping, setSwapping] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);
  const [swapSuccess, setSwapSuccess] = useState<string | null>(null);

  // Court change
  const [courtName, setCourtName] = useState("");
  const [savingCourt, setSavingCourt] = useState(false);

  useEffect(() => {
    if (match) {
      setScoreA(match.scoreA);
      setScoreB(match.scoreB);
      setStatus(match.status);
      setTeamAId(match.teamAId);
      setTeamBId(match.teamBId);
      setCourtName(match.courtName);
      setError(null);
      setSuccess(null);
      setResetError(null);
      setSwapError(null);
      setSwapSuccess(null);
      setSwapMatchId("");
    }
  }, [match?.id]);

  if (!match) return null;

  const isAssignedReferee = session?.user?.playerId != null &&
    (match.refereePlayerId === session.user.playerId || match.coRefereePlayerId === session.user.playerId);
  const canEdit =
    isOrganizer ||
    isAssignedReferee ||
    session?.user?.role === "REF" ||
    session?.user?.role === "ADMIN" ||
    session?.user?.role === "ORGA";

  // Un match a une suite si son vainqueur a été propagé dans le match suivant
  const hasPropagatedSuite = !!(match.nextMatchWinId && match.status === "FINISHED");

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const finalStatus = (scoreA > 0 || scoreB > 0) && status !== "FINISHED" ? "FINISHED" : status;
      const teamChanged = teamAId !== match.teamAId || teamBId !== match.teamBId;
      const body: Record<string, unknown> = { scoreA, scoreB, status: finalStatus };
      if (teamChanged) {
        body.teamAId = teamAId || null;
        body.teamBId = teamBId || null;
      }
      const res = await fetch(`/api/matches/${match.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? t("error_save"));
        return;
      }
      const updated = await res.json();
      const winnerTeamId =
        finalStatus === "FINISHED" && scoreA !== scoreB
          ? (scoreA > scoreB ? teamAId : teamBId)
          : null;

      const savePayload: SavePayload = {
        id: match.id, scoreA: updated.scoreA, scoreB: updated.scoreB, status: updated.status,
        ...(teamChanged ? { teamAId: updated.teamAId, teamBId: updated.teamBId } : {}),
        ...(winnerTeamId && match.phase === "BRACKET" && match.nextMatchWinId && (match.nextSlotWin === "A" || match.nextSlotWin === "B")
          ? { advance: { nextMatchId: match.nextMatchWinId, slot: match.nextSlotWin, winnerTeamId } }
          : {}),
      };

      onSaved(savePayload);
      setSuccess(t("saved"));
    } catch {
      setError(t("error_network"));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm("Réinitialiser ce match ? Les scores seront effacés.")) return;
    setResetting(true);
    setResetError(null);
    try {
      const res = await fetch(`/api/matches/${match.id}/reset`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResetError(data?.error ?? "Erreur lors de la réinitialisation.");
        return;
      }
      onReset?.(match.id);
      setScoreA(0);
      setScoreB(0);
      setStatus("SCHEDULED");
    } catch {
      setResetError("Erreur réseau.");
    } finally {
      setResetting(false);
    }
  };

  const handleCourtChange = async (newCourt: string) => {
    setCourtName(newCourt);
    setSavingCourt(true);
    try {
      await fetch(`/api/matches/${match.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courtName: newCourt }),
      });
    } finally {
      setSavingCourt(false);
    }
  };

  const handleSwap = async () => {
    if (!swapMatchId) return;
    setSwapping(true);
    setSwapError(null);
    setSwapSuccess(null);
    try {
      const res = await fetch("/api/matches/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchAId: match.id, matchBId: swapMatchId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSwapError(data?.error ?? "Erreur lors du swap.");
        return;
      }
      onSwapped?.(
        data.matchA.id, data.matchB.id,
        data.matchA.courtName, data.matchA.startAt,
        data.matchB.courtName, data.matchB.startAt
      );
      setSwapSuccess("Swap effectué !");
      setSwapMatchId("");
    } catch {
      setSwapError("Erreur réseau.");
    } finally {
      setSwapping(false);
    }
  };

  const swappableMatches = (allMatches ?? []).filter(
    (m) => m.id !== match.id && m.phase === match.phase
  );

  return (
    <div className="match-edit-panel">
      <div className="match-edit-panel__inner">
        {/* Header */}
        <div className="match-edit-panel__header">
          <span className="pill" style={{ fontSize: 11 }}>
            {PHASE_LABEL[match.phase] ?? match.phase} · R{match.roundIndex} · {match.courtName}
          </span>
          <button className="ghost" onClick={onClose} type="button" style={{ padding: "4px 12px", marginLeft: "auto", fontSize: 13 }}>
            {t("btn_close")}
          </button>
        </div>

        <div className="match-edit-panel__body">
          {/* Team assignment */}
          {canEdit && teams && teams.length > 0 && (
            <div className="match-team-selectors">
              <div className="match-team-select-row">
                <label>{t("label_team_a")}</label>
                <select value={teamAId ?? ""} onChange={(e) => setTeamAId(e.target.value || null)}>
                  <option value="">— TBD —</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id} disabled={t.id === teamBId}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div className="match-team-select-row">
                <label>{t("label_team_b")}</label>
                <select value={teamBId ?? ""} onChange={(e) => setTeamBId(e.target.value || null)}>
                  <option value="">— TBD —</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id} disabled={t.id === teamAId}>{t.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Score editor */}
          <div className="match-score-editor">
            <div className="match-score-team">
              <span className="match-score-team-name">{teams?.find((t) => t.id === teamAId)?.name ?? match.teamAName}</span>
              {canEdit ? (
                <div className="score-input-group">
                  <button className="score-btn" type="button" onClick={() => setScoreA((s) => Math.max(0, s - 1))}>−</button>
                  <span className="score-value">{scoreA}</span>
                  <button className="score-btn" type="button" onClick={() => setScoreA((s) => s + 1)}>+</button>
                </div>
              ) : (
                <span className="score-value">{scoreA}</span>
              )}
            </div>
            <span className="match-score-vs">VS</span>
            <div className="match-score-team">
              <span className="match-score-team-name">{teams?.find((t) => t.id === teamBId)?.name ?? match.teamBName}</span>
              {canEdit ? (
                <div className="score-input-group">
                  <button className="score-btn" type="button" onClick={() => setScoreB((s) => Math.max(0, s - 1))}>−</button>
                  <span className="score-value">{scoreB}</span>
                  <button className="score-btn" type="button" onClick={() => setScoreB((s) => s + 1)}>+</button>
                </div>
              ) : (
                <span className="score-value">{scoreB}</span>
              )}
            </div>
          </div>

          {/* Actions scores */}
          <div className="match-edit-panel__actions">
            {canEdit ? (
              <>
                <div className="status-select-row">
                  <label>{t("label_status")}</label>
                  <select value={status} onChange={(e) => setStatus(e.target.value)}>
                    <option value="SCHEDULED">{t("status_scheduled")}</option>
                    <option value="LIVE">{t("status_live")}</option>
                    <option value="FINISHED">{t("status_finished")}</option>
                  </select>
                </div>
                {error && <p className="error" style={{ margin: 0 }}>{error}</p>}
                {success && <p style={{ margin: 0, color: "var(--teal)", fontSize: 13, fontWeight: 700 }}>{success}</p>}
                <button className="primary" onClick={handleSave} disabled={saving}>
                  {saving ? t("btn_saving") : t("btn_save")}
                </button>
              </>
            ) : (
              <span className="meta" style={{ fontSize: 12 }}>{t("readonly_hint")}</span>
            )}
          </div>

          {/* Actions orga : reset + terrain + swap */}
          {isOrganizer && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 12 }}>

              {/* Reset */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="ghost"
                  onClick={handleReset}
                  disabled={resetting || hasPropagatedSuite}
                  title={hasPropagatedSuite ? "Ce match a une suite — modifiez les scores plutôt." : "Remet le match à zéro (SCHEDULED, scores effacés)"}
                  style={{ fontSize: 12, padding: "5px 12px", color: hasPropagatedSuite ? "var(--text-muted)" : "var(--danger)", opacity: hasPropagatedSuite ? 0.5 : 1 }}
                >
                  {resetting ? "Réinitialisation..." : "Réinitialiser le match"}
                </button>
                {hasPropagatedSuite && (
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Suite déjà propagée — modifier les scores</span>
                )}
                {resetError && <span style={{ fontSize: 12, color: "var(--danger)" }}>{resetError}</span>}
              </div>

              {/* Changer de terrain */}
              {courtNames && courtNames.length > 1 && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <label style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>Changer de terrain :</label>
                  <select
                    value={courtName}
                    onChange={(e) => handleCourtChange(e.target.value)}
                    disabled={savingCourt}
                    style={{ fontSize: 12 }}
                  >
                    {courtNames.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  {savingCourt && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Sauvegarde...</span>}
                </div>
              )}

              {/* Swap avec un autre match */}
              {swappableMatches.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>Swapper terrain + heure avec :</label>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <select
                      value={swapMatchId}
                      onChange={(e) => setSwapMatchId(e.target.value)}
                      style={{ fontSize: 12, flex: 1, minWidth: 160 }}
                    >
                      <option value="">— Choisir un match —</option>
                      {swappableMatches.map((m) => (
                        <option key={m.id} value={m.id}>
                          R{m.roundIndex} · {m.courtName} · {m.teamAName} vs {m.teamBName}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="ghost"
                      onClick={handleSwap}
                      disabled={!swapMatchId || swapping}
                      style={{ fontSize: 12, padding: "5px 12px" }}
                    >
                      {swapping ? "Swap..." : "Swap"}
                    </button>
                  </div>
                  {swapError && <span style={{ fontSize: 12, color: "var(--danger)" }}>{swapError}</span>}
                  {swapSuccess && <span style={{ fontSize: 12, color: "var(--teal)", fontWeight: 700 }}>{swapSuccess}</span>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
