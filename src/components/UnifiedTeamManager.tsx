"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";

type PlayerResult = {
  id: string;
  name: string;
  city: string | null;
  country: string;
  slug?: string;
};

type TeamPlayer = {
  id: string;
  player: {
    id: string;
    name: string;
    country: string;
    slug?: string;
    account?: { id: string } | null;
  };
};

type Team = {
  id: string;
  name: string;
  seed: number;
  city: string | null;
  country: string | null;
  selected?: boolean;
  waitlistPosition?: number | null;
  players: TeamPlayer[];
  feePaid?: boolean;
  registrationNote?: string | null;
  accommodationNote?: string | null;
};

type AddPlayerData =
  | { type: "existing"; playerId: string }
  | { type: "manual"; name: string; city?: string | null; country: string };

type Props = {
  teams: Team[];
  tournamentId: string;
  locked: boolean;
  format?: string;
  showPayment?: boolean;
  showRecap?: boolean;
  showActions?: boolean;
  viewMode?: "detailed" | "compact";
  feePerTeam?: number;
  feeCurrency?: string;
  maxTeams?: number;
  renameAction: (teamId: string, name: string, tournamentId: string) => Promise<{ ok?: boolean; error?: string }>;
  deleteTeamAction: (teamId: string, tournamentId: string) => Promise<{ ok?: boolean; error?: string }>;
  removePlayerAction: (teamPlayerId: string, tournamentId: string) => Promise<{ ok?: boolean; error?: string }>;
  addPlayerAction: (teamId: string, tournamentId: string, playerData: AddPlayerData) => Promise<{ ok?: boolean; error?: string }>;
  createTeamAction?: (tournamentId: string, name: string) => Promise<{ ok?: boolean; error?: string }>;
};

function maxPlayersFromFormat(format?: string): number {
  if (!format) return 3;
  const m = format.match(/^(\d+)v\d+$/i);
  return m ? parseInt(m[1], 10) : 3;
}

export function UnifiedTeamManager({
  teams,
  tournamentId,
  locked,
  format,
  showPayment = true,
  showRecap = false,
  showActions = true,
  viewMode = "detailed",
  feePerTeam = 0,
  feeCurrency = "EUR",
  maxTeams,
  renameAction,
  deleteTeamAction,
  removePlayerAction,
  addPlayerAction,
  createTeamAction,
}: Props) {
  const t = useTranslations("team_manager");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [expandedRecap, setExpandedRecap] = useState<string | null>(null);
  const router = useRouter();

  const maxPlayers = maxPlayersFromFormat(format);
  const selected = teams.filter((t) => t.selected !== false).sort((a, b) => a.seed - b.seed);
  const waitlist = teams.filter((t) => t.selected === false).sort((a, b) => (a.waitlistPosition ?? 999) - (b.waitlistPosition ?? 999));
  const paidCount = teams.filter((t) => t.feePaid).length;

  const handleCreateTeam = () => {
    if (!newTeamName.trim() || !createTeamAction) return;
    setGlobalError(null);
    startTransition(async () => {
      const result = await createTeamAction(tournamentId, newTeamName.trim());
      if (result.ok) {
        setNewTeamName("");
        setShowCreateForm(false);
        router.refresh();
      } else {
        setGlobalError(result.error ?? t("error_fallback"));
      }
    });
  };

  const handleDeleteTeam = (teamId: string, teamName: string) => {
    if (!window.confirm(t("confirm_delete_team", { name: teamName }))) return;
    startTransition(async () => {
      await deleteTeamAction(teamId, tournamentId);
      router.refresh();
    });
  };

  const handleRemovePlayer = (teamPlayerId: string, playerName: string) => {
    if (!window.confirm(t("confirm_remove_player", { name: playerName }))) return;
    startTransition(async () => {
      await removePlayerAction(teamPlayerId, tournamentId);
      router.refresh();
    });
  };

  const handleTogglePayment = async (teamId: string, currentFeeStatus: boolean) => {
    try {
      const res = await fetch(`/api/teams/${teamId}/fee-paid`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feePaid: !currentFeeStatus }),
      });
      if (res.ok) {
        router.refresh();
      }
    } catch (err) {
      console.error("Error toggling payment:", err);
    }
  };

  const renderTeamRow = (team: Team, isWaitlist: boolean = false) => (
    <div key={team.id} className="panel" style={{ padding: 16, marginBottom: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "start", marginBottom: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            {editingId === team.id ? (
              <input
                value={team.name}
                onChange={() => {}}
                placeholder="Team name"
                style={{ flex: 1 }}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    startTransition(async () => {
                      const result = await renameAction(team.id, (e.target as HTMLInputElement).value, tournamentId);
                      if (result.ok) {
                        setEditingId(null);
                        router.refresh();
                      }
                    });
                  }
                  if (e.key === "Escape") setEditingId(null);
                }}
              />
            ) : (
              <strong style={{ fontSize: 14 }}>{team.name}</strong>
            )}
            {isWaitlist && (
              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "var(--orange)", color: "#fff", fontWeight: 600 }}>
                #{team.waitlistPosition ?? "?"}
              </span>
            )}
            {!isWaitlist && (
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Seed {team.seed}</span>
            )}
          </div>
          {team.city && (
            <p className="meta" style={{ margin: 0 }}>
              {team.city}, {team.country}
            </p>
          )}
        </div>

        {showActions && !locked && (
          <div style={{ display: "flex", gap: 6 }}>
            {editingId === team.id ? (
              <>
                <button
                  className="primary"
                  onClick={() => setEditingId(null)}
                  style={{ fontSize: 12, padding: "6px 12px" }}
                  disabled={isPending}
                >
                  {t("save")}
                </button>
                <button
                  className="ghost"
                  onClick={() => setEditingId(null)}
                  style={{ fontSize: 12, padding: "6px 12px" }}
                >
                  {t("cancel")}
                </button>
              </>
            ) : (
              <>
                <button
                  className="ghost"
                  onClick={() => setEditingId(team.id)}
                  style={{ fontSize: 12, padding: "6px 12px" }}
                  title={t("edit_team")}
                >
                  ✎
                </button>
                <button
                  className="ghost"
                  onClick={() => handleDeleteTeam(team.id, team.name)}
                  style={{ fontSize: 12, padding: "6px 12px", color: "var(--pink)" }}
                  title={t("delete_team")}
                >
                  ✕
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Players */}
      <div style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid var(--border-light)" }}>
        <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--text-muted)" }}>
          {team.players.length}/{maxPlayers} {t("players")}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {team.players.map((tp) => {
            const player = tp.player;
            const slug = player.slug || player.id;
            return (
              <div key={tp.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", background: "var(--bg-secondary)", borderRadius: 6, fontSize: 12 }}>
                <Link href={`/player/${slug}`} style={{ color: "var(--teal)", textDecoration: "none", fontWeight: 500 }}>
                  {player.name}
                </Link>
                {showActions && !locked && (
                  <button
                    className="ghost"
                    onClick={() => handleRemovePlayer(tp.id, player.name)}
                    style={{ fontSize: 10, padding: "2px 6px", color: "var(--pink)", marginLeft: "auto" }}
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Payment Status */}
      {showPayment && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 12, borderTop: "1px solid var(--border-light)" }}>
          <button
            onClick={() => handleTogglePayment(team.id, team.feePaid ?? false)}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: team.feePaid ? "var(--green)" : "var(--bg-secondary)",
              color: team.feePaid ? "#fff" : "var(--text)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {team.feePaid ? "✓ " : ""}
            {feePerTeam} {feeCurrency}
          </button>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {team.feePaid ? t("fee_paid") : t("fee_unpaid")}
          </span>
        </div>
      )}

      {/* Recap Section */}
      {showRecap && (team.registrationNote || team.accommodationNote) && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border-light)" }}>
          <button
            onClick={() => setExpandedRecap(expandedRecap === team.id ? null : team.id)}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--teal)",
            }}
          >
            {expandedRecap === team.id ? "▼" : "▶"} {t("notes")}
          </button>
          {expandedRecap === team.id && (
            <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
              {team.registrationNote && (
                <div style={{ marginBottom: 8 }}>
                  <strong>{t("registration_note")}:</strong> {team.registrationNote}
                </div>
              )}
              {team.accommodationNote && (
                <div>
                  <strong>{t("accommodation")}:</strong> {team.accommodationNote}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Header with summary */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>
          {t("registered_teams", { count: teams.length })}
        </h3>
        {showPayment && (
          <p className="meta" style={{ margin: 0 }}>
            💳 {paidCount} / {teams.length} {t("paid")} • {(paidCount * feePerTeam)} {feeCurrency}
          </p>
        )}
      </div>

      {/* Teams */}
      <div>
        {selected.map((team) => renderTeamRow(team, false))}

        {/* Waitlist */}
        {waitlist.length > 0 && (
          <>
            <div
              style={{
                padding: "12px 0",
                marginBottom: 12,
                borderTop: "2px solid var(--border)",
                borderBottom: "1px solid var(--border-light)",
                fontSize: 11,
                fontWeight: 700,
                color: "var(--text-muted)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {t("waitlist", { count: waitlist.length })}
            </div>
            {waitlist.map((team) => renderTeamRow(team, true))}
          </>
        )}
      </div>

      {/* Create Team */}
      {!locked && createTeamAction && (
        <div style={{ marginTop: 16 }}>
          {showCreateForm ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                placeholder={t("team_name_placeholder")}
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateTeam();
                  if (e.key === "Escape") {
                    setShowCreateForm(false);
                    setNewTeamName("");
                  }
                }}
                autoFocus
                style={{ flex: 1 }}
              />
              <button
                className="primary"
                onClick={handleCreateTeam}
                disabled={isPending || !newTeamName.trim()}
                style={{ fontSize: 13 }}
              >
                {t("create")}
              </button>
              <button
                className="ghost"
                onClick={() => {
                  setShowCreateForm(false);
                  setNewTeamName("");
                }}
                style={{ fontSize: 13 }}
              >
                {t("cancel")}
              </button>
            </div>
          ) : (
            <button className="ghost" onClick={() => setShowCreateForm(true)} style={{ fontSize: 13 }}>
              + {t("add_team")}
            </button>
          )}
        </div>
      )}

      {globalError && (
        <p style={{ marginTop: 12, padding: 12, background: "var(--orange)", borderRadius: 6, fontSize: 12, color: "#fff" }}>
          {globalError}
        </p>
      )}

      {locked && (
        <p className="meta" style={{ marginTop: 10, fontSize: 12 }}>
          {t("locked_notice")}
        </p>
      )}
    </div>
  );
}
