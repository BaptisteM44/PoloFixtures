"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

export type MatchForEdit = {
  id: string;
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

type Props = {
  match: MatchForEdit | null;
  onClose: () => void;
  onSaved: (updated: { id: string; scoreA: number; scoreB: number; status: string }) => void;
};

export function MatchEditPanel({ match, onClose, onSaved }: Props) {
  const { data: session } = useSession();
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [status, setStatus] = useState("SCHEDULED");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync scores when selected match changes
  useEffect(() => {
    if (match) {
      setScoreA(match.scoreA);
      setScoreB(match.scoreB);
      setStatus(match.status);
      setError(null);
    }
  }, [match?.id]);

  if (!match) return null;

  const canEdit =
    session?.user?.role === "REF" ||
    session?.user?.role === "ADMIN" ||
    session?.user?.role === "ORGA";

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      // Auto-set status to FINISHED when scores have been entered
      const finalStatus = (scoreA > 0 || scoreB > 0) && status !== "FINISHED" ? "FINISHED" : status;
      const res = await fetch(`/api/matches/${match.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scoreA, scoreB, status: finalStatus }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? "Erreur lors de la sauvegarde");
        return;
      }
      const updated = await res.json();
      onSaved({ id: match.id, scoreA: updated.scoreA, scoreB: updated.scoreB, status: updated.status });
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
          <div className="match-score-editor">
            {/* Team A */}
            <div className="match-score-team">
              <span className="match-score-team-name">{match.teamAName}</span>
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
              <span className="match-score-team-name">{match.teamBName}</span>
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
