"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

type SoloEntry = {
  id: string;
  player: { id: string; name: string };
  level: string;
  teamId: string | null;
  waitlisted: boolean;
};

type DrawnTeam = {
  id: string;
  name: string;
};

function getLevelTier(level: string): "A" | "B" | "C" {
  const score: Record<string, number> = { "C": 1, "C+": 2, "B-": 3, "B": 4, "B+": 5, "A-": 6, "A": 7, "A+": 8 };
  const s = score[level] ?? 4;
  if (s >= 6) return "A";
  if (s >= 3) return "B";
  return "C";
}

export function DrawPanel({
  tournamentId,
  soloEntries: initialEntries,
  teams: initialTeams,
}: {
  tournamentId: string;
  soloEntries: SoloEntry[];
  teams: DrawnTeam[];
}) {
  const t = useTranslations("draw");
  const [entries, setEntries] = useState<SoloEntry[]>(initialEntries);
  const [teams, setTeams] = useState<DrawnTeam[]>(initialTeams);
  const [loading, setLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Changements d'assignation (entryId → teamId)
  const [pendingChanges, setPendingChanges] = useState<Record<string, string>>({});

  const activeEntries = entries.filter((e) => !e.waitlisted);
  const waitlistEntries = entries.filter((e) => e.waitlisted);

  const getTeamName = (teamId: string | null) => {
    if (!teamId) return "—";
    return teams.find((t) => t.id === teamId)?.name ?? teamId;
  };

  const handleDraw = async () => {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/draw`, { method: "POST" });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? t("error_draw"));
      return;
    }
    const data = await res.json();
    // Mettre à jour les teams et les entries
    const newTeams: DrawnTeam[] = data.teams.map((t: { id: string; name: string }) => ({ id: t.id, name: t.name }));
    setTeams((prev) => [...prev, ...newTeams]);
    // Mettre à jour teamId sur les entries locales
    const updatedMap: Record<string, string> = {};
    for (const t of data.teams as { id: string; players: { playerId: string }[] }[]) {
      for (const p of t.players) {
        updatedMap[p.playerId] = t.id;
      }
    }
    setEntries((prev) =>
      prev.map((e) => (updatedMap[e.player.id] ? { ...e, teamId: updatedMap[e.player.id] } : e))
    );
  };

  const handleTeamChange = (entryId: string, teamId: string) => {
    setPendingChanges((prev) => ({ ...prev, [entryId]: teamId }));
    setEntries((prev) =>
      prev.map((e) => (e.id === entryId ? { ...e, teamId: teamId || null } : e))
    );
  };

  const handleSaveAdjustments = async () => {
    const changesToSend = Object.entries(pendingChanges).map(([entryId, teamId]) => ({ entryId, teamId }));
    if (changesToSend.length === 0) return;
    setSaveLoading(true);
    setError(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/draw/adjust`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries: changesToSend }),
    });
    setSaveLoading(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? t("error_save"));
      return;
    }
    setPendingChanges({});
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const drawnTeamsCount = teams.length;
  const hasDraw = drawnTeamsCount > 0 && activeEntries.some((e) => e.teamId);

  return (
    <div style={{ display: "grid", gap: 20, marginTop: 16 }}>
      <div className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          <h3 style={{ margin: 0 }}>
            {t("title")}
            <span className="meta" style={{ marginLeft: 10, fontWeight: 400, fontSize: 13 }}>
              {t("registered_count", { count: activeEntries.length })}
              {waitlistEntries.length > 0 && ` · ${t("waitlist_count", { count: waitlistEntries.length })}`}
            </span>
          </h3>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {saved && (
              <span style={{ fontSize: 12, color: "var(--success)", fontFamily: "var(--font-display)", fontWeight: 700 }}>
                {t("saved")}
              </span>
            )}
            {Object.keys(pendingChanges).length > 0 && (
              <button
                className="primary"
                style={{ fontSize: 12, padding: "6px 14px" }}
                onClick={handleSaveAdjustments}
                disabled={saveLoading}
              >
                {saveLoading ? "…" : t("btn_save_changes")}
              </button>
            )}
            <button
              className={hasDraw ? "ghost" : "primary"}
              style={{ fontSize: 13, padding: "6px 16px" }}
              onClick={handleDraw}
              disabled={loading || activeEntries.length < 3}
            >
              {loading ? t("btn_drawing") : hasDraw ? t("btn_redraw") : t("btn_draw")}
            </button>
          </div>
        </div>

        {error && <p className="error" style={{ marginBottom: 12 }}>{error}</p>}

        {/* Liste des inscrits actifs */}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--border)" }}>
                <th style={{ textAlign: "left", padding: "6px 10px", fontFamily: "var(--font-display)", fontSize: 11, color: "var(--text-muted)" }}>{t("col_player")}</th>
                <th style={{ textAlign: "left", padding: "6px 10px", fontFamily: "var(--font-display)", fontSize: 11, color: "var(--text-muted)" }}>{t("col_level")}</th>
                <th style={{ textAlign: "left", padding: "6px 10px", fontFamily: "var(--font-display)", fontSize: 11, color: "var(--text-muted)" }}>{t("col_team")}</th>
              </tr>
            </thead>
            <tbody>
              {activeEntries.map((entry) => (
                <tr key={entry.id} style={{ borderBottom: "1px solid var(--border-light)" }}>
                  <td style={{ padding: "8px 10px", fontWeight: 600 }}>{entry.player.name}</td>
                  <td style={{ padding: "8px 10px" }}>
                    <span className="level-badge" data-level={getLevelTier(entry.level)}>{entry.level}</span>
                  </td>
                  <td style={{ padding: "8px 10px" }}>
                    {hasDraw && teams.length > 0 ? (
                      <select
                        value={entry.teamId ?? ""}
                        onChange={(e) => handleTeamChange(entry.id, e.target.value)}
                        style={{ fontSize: 12, padding: "3px 6px" }}
                      >
                        <option value="">{t("no_team")}</option>
                        {teams.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    ) : (
                      <span style={{ color: "var(--text-muted)" }}>{getTeamName(entry.teamId)}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Liste d'attente */}
        {waitlistEntries.length > 0 && (
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border-light)" }}>
            <p style={{ fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase" }}>
              {t("waitlist_title", { count: waitlistEntries.length })}
            </p>
            <div style={{ display: "grid", gap: 6 }}>
              {waitlistEntries.map((entry) => (
                <div key={entry.id} style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 13, color: "var(--text-muted)" }}>
                  <span style={{ fontWeight: 600 }}>{entry.player.name}</span>
                  <span className="level-badge" data-level={getLevelTier(entry.level)} style={{ opacity: 0.7 }}>{entry.level}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Récap des équipes formées */}
        {hasDraw && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border-light)" }}>
            <p style={{ fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 10, textTransform: "uppercase" }}>
              {t("formed_teams_title", { count: teams.length })}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
              {teams.map((team) => {
                const teamEntries = activeEntries.filter((e) => e.teamId === team.id);
                return (
                  <div key={team.id} style={{ padding: "10px 14px", border: "2px solid var(--border)", borderRadius: 8, background: "var(--surface)" }}>
                    <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13, margin: "0 0 6px" }}>{team.name}</p>
                    {teamEntries.map((e) => (
                      <div key={e.id} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, marginBottom: 3 }}>
                        <span className="level-badge" data-level={getLevelTier(e.level)} style={{ fontSize: 10 }}>{e.level}</span>
                        <span>{e.player.name}</span>
                      </div>
                    ))}
                    {teamEntries.length === 0 && <span className="meta" style={{ fontSize: 12 }}>{t("no_player")}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
