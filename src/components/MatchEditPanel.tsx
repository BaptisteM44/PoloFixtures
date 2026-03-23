"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

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
};

const PHASE_LABEL: Record<string, string> = {
  POOL: "Poule", SWISS: "Swiss", BRACKET: "Tableau",
};

type TeamOption = { id: string; name: string };

type Props = {
  match: MatchForEdit | null;
  onClose: () => void;
  onSaved: (updated: { id: string; scoreA: number; scoreB: number; status: string; teamAId?: string | null; teamBId?: string | null }) => void;
  isOrganizer?: boolean;
  teams?: TeamOption[];
};

export function MatchEditPanel({ match, onClose, onSaved, isOrganizer, teams }: Props) {
  const { data: session } = useSession();
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [status, setStatus] = useState("SCHEDULED");
  const [teamAId, setTeamAId] = useState<string | null>(null);
  const [teamBId, setTeamBId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync scores when selected match changes
  useEffect(() => {
    if (match) {
      setScoreA(match.scoreA);
      setScoreB(match.scoreB);
      setStatus(match.status);
      setTeamAId(match.teamAId);
      setTeamBId(match.teamBId);
      setError(null);
    }
  }, [match?.id]);

  if (!match) return null;

  const canEdit =
    isOrganizer ||
    session?.user?.role === "REF" ||
    session?.user?.role === "ADMIN" ||
    session?.user?.role === "ORGA";

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      // Auto-set status to FINISHED when scores have been entered
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
        setError(data?.error ?? "Erreur lors de la sauvegarde");
        return;
      }
      const updated = await res.json();
      onSaved({
        id: match.id, scoreA: updated.scoreA, scoreB: updated.scoreB, status: updated.status,
        ...(teamChanged ? { teamAId: updated.teamAId, teamBId: updated.teamBId } : {}),
      });
    } catch {
      setError("Erreur réseau");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="match-edit-panel">
      <div className="match-edit-panel__inner">
        {/* Header row */}
        <div className="match-edit-panel__header">
          <span className="pill" style={{ fontSize: 11 }}>
            {PHASE_LABEL[match.phase] ?? match.phase} · R{match.roundIndex} · {match.courtName}
          </span>
          <button
            className="ghost"
            onClick={onClose}
            type="button"
            style={{ padding: "4px 12px", marginLeft: "auto", fontSize: 13 }}
          >
            ✕ Fermer
          </button>
        </div>

        {/* Score editor */}
        <div className="match-edit-panel__body">
          {/* Team assignment (for bracket matches, always available to organizers) */}
          {canEdit && teams && teams.length > 0 && (
            <div className="match-team-selectors">
              <div className="match-team-select-row">
                <label>Équipe A</label>
                <select value={teamAId ?? ""} onChange={(e) => setTeamAId(e.target.value || null)}>
                  <option value="">— TBD —</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id} disabled={t.id === teamBId}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div className="match-team-select-row">
                <label>Équipe B</label>
                <select value={teamBId ?? ""} onChange={(e) => setTeamBId(e.target.value || null)}>
                  <option value="">— TBD —</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id} disabled={t.id === teamAId}>{t.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="match-score-editor">
            {/* Team A */}
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

            {/* Team B */}
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

          {/* Actions */}
          <div className="match-edit-panel__actions">
            {canEdit ? (
              <>
                <div className="status-select-row">
                  <label>Statut</label>
                  <select value={status} onChange={(e) => setStatus(e.target.value)}>
                    <option value="SCHEDULED">Planifié</option>
                    <option value="LIVE">En cours 🔴</option>
                    <option value="FINISHED">Terminé ✓</option>
                  </select>
                </div>
                {error && <p className="error" style={{ margin: 0 }}>{error}</p>}
                <button className="primary" onClick={handleSave} disabled={saving}>
                  {saving ? "Sauvegarde…" : "Sauvegarder"}
                </button>
              </>
            ) : (
              <span className="meta" style={{ fontSize: 12 }}>Lecture seule — connectez-vous en tant que REF / ORGA</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
