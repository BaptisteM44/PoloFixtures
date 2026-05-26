"use client";

import { useState, useTransition, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { OrgaNoteEditor } from "@/components/OrgaNoteEditor";

type PlayerResult = {
  id: string;
  name: string;
  city: string | null;
  country: string;
  slug?: string;
};

type TeamPlayer = {
  id: string;
  needsAccommodation?: boolean;
  player: {
    id: string;
    name: string;
    country: string;
    slug?: string;
    account?: { id: string } | null;
    diets?: string[];
  };
};

type RegistrationAnswer = {
  id: string;
  fieldId: string;
  value: string;
  teamPlayerId: string | null;
  teamId: string | null;
  field: { label: string; target: "PLAYER" | "TEAM" | "CAPTAIN" };
  teamPlayer?: { player: { name: string } } | null;
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
  orgaNote?: string | null;
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

// — PlayerChip: exact copy of TeamManager's PlayerChip with merge support —
function PlayerChip({
  tp,
  isEditing,
  isPending,
  onRemove,
  onMerged,
  tournamentId,
}: {
  tp: TeamPlayer;
  isEditing: boolean;
  isPending: boolean;
  onRemove: () => void;
  onMerged: () => void;
  tournamentId: string;
}) {
  const t = useTranslations("team_manager");
  const hasAccount = !!tp.player.account;
  const slug = tp.player.slug || tp.player.id;
  const [merging, setMerging] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlayerResult[]>([]);
  const [mergePending, setMergePending] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchTarget = (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      const res = await fetch(`/api/players?search=${encodeURIComponent(q)}&hasAccount=true`);
      const data = await res.json();
      setResults((data as PlayerResult[]).filter((p: PlayerResult) => p.id !== tp.player.id));
    }, 250);
  };

  const handleMerge = async (targetId: string, targetName: string) => {
    if (!confirm(t("confirm_merge", { source: tp.player.name, target: targetName }))) return;
    setMergeError(null); setMergePending(true);
    const res = await fetch(`/api/players/${tp.player.id}/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetPlayerId: targetId }),
    });
    const data = await res.json();
    setMergePending(false);
    if (res.ok) { setMerging(false); onMerged(); }
    else setMergeError(data.error ?? t("error_fallback"));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--surface-2)", border: `1.5px solid ${hasAccount ? "var(--teal)" : "var(--border-light)"}`, borderRadius: 20, padding: "4px 12px 4px 10px", fontSize: 13 }}>
        <span>{hasAccount ? "🔗" : "👤"}</span>
        {isEditing ? (
          <span style={{ fontWeight: 600 }}>{tp.player.name}</span>
        ) : (
          <Link href={`/player/${slug}`} style={{ fontWeight: 600, color: "inherit", textDecoration: "none" }}>{tp.player.name}</Link>
        )}
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{tp.player.country}</span>
        {isEditing && !hasAccount && (
          <button
            onClick={() => { setMerging((m) => !m); setMergeError(null); setQuery(""); setResults([]); }}
            disabled={isPending || mergePending}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "var(--text-muted)", padding: "0 2px", marginLeft: 2, lineHeight: 1, textDecoration: "underline" }}
          >
            {merging ? t("merge_cancel") : t("merge")}
          </button>
        )}
        {isEditing && (
          <button onClick={onRemove} disabled={isPending} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger, #e53e3e)", fontSize: 14, padding: "0 2px", marginLeft: 2, lineHeight: 1 }}>✕</button>
        )}
      </div>
      {merging && (
        <div style={{ paddingLeft: 4, display: "flex", flexDirection: "column", gap: 4 }}>
          <input
            placeholder={t("merge_search_placeholder")}
            value={query}
            onChange={(e) => { setQuery(e.target.value); searchTarget(e.target.value); }}
            autoFocus
            style={{ fontSize: 12, padding: "4px 8px", borderRadius: 6, border: "1.5px solid var(--border)" }}
          />
          {results.length > 0 && (
            <div style={{ background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
              {results.map((p) => (
                <button key={p.id} type="button" onClick={() => handleMerge(p.id, p.name)} disabled={mergePending}
                  style={{ width: "100%", textAlign: "left", padding: "7px 12px", background: "none", border: "none", borderBottom: "1px solid var(--border-light)", cursor: "pointer", fontSize: 12 }}>
                  <strong>{p.name}</strong>
                  <span style={{ marginLeft: 8, color: "var(--text-muted)", fontSize: 11 }}>{p.city ? `${p.city}, ` : ""}{p.country}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {mergeError && <span style={{ fontSize: 11, color: "var(--danger)", paddingLeft: 12 }}>{mergeError}</span>}
    </div>
  );
}

// — TeamRow: TeamManager panel style + PaymentTracker checkbox —
function TeamRow({
  team, locked, maxPlayers, tournamentId, showPayment, showRecap, showActions,
  feePerTeam, feeCurrency,
  isEditing, onStartEdit, onCancelEdit, onDelete, onRemovePlayer,
  renameAction, addPlayerAction, setEditingId, onPlayerChanged,
}: {
  team: Team;
  locked: boolean;
  maxPlayers: number;
  tournamentId: string;
  showPayment: boolean;
  showRecap: boolean;
  showActions: boolean;
  feePerTeam: number;
  feeCurrency: string;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onRemovePlayer: (tpId: string, name: string) => void;
  renameAction: Props["renameAction"];
  addPlayerAction: Props["addPlayerAction"];
  setEditingId: (id: string | null) => void;
  onPlayerChanged: () => void;
}) {
  const t = useTranslations("team_manager");
  const tTeam = useTranslations("team");
  const tTournament = useTranslations("tournament");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
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
  const [regAnswers, setRegAnswers] = useState<RegistrationAnswer[] | null>(null);

  useEffect(() => {
    if (!showRecap) return;
    fetch(`/api/teams/${team.id}/answers`)
      .then((r) => r.ok ? r.json() : [])
      .then((data: RegistrationAnswer[]) => setRegAnswers(data))
      .catch(() => {});
  }, [team.id, showRecap]);

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
      const res = await fetch(`/api/players?search=${encodeURIComponent(q)}&excludeTournamentId=${tournamentId}&hasAccount=true`);
      const data = await res.json();
      setResults(data); setShowResults(true);
    }, 250);
  }, [tournamentId]);

  const handleRename = () => {
    setRowError(null);
    startTransition(async () => {
      const result = await renameAction(team.id, editName, tournamentId);
      if (result.ok) setEditingId(null);
      else setRowError(result.error ?? t("error_fallback"));
    });
  };

  const handleAddExisting = (player: PlayerResult) => {
    setShowResults(false); setQuery(""); setRowError(null);
    startTransition(async () => {
      const result = await addPlayerAction(team.id, tournamentId, { type: "existing", playerId: player.id });
      if (result.ok) { setAddMode(null); onPlayerChanged(); }
      else setRowError(result.error ?? t("error_fallback"));
    });
  };

  const handleAddManual = () => {
    if (!manualName.trim() || !manualCountry.trim()) { setRowError(t("manual_name_country_required")); return; }
    setRowError(null);
    startTransition(async () => {
      const result = await addPlayerAction(team.id, tournamentId, { type: "manual", name: manualName.trim(), city: manualCity || null, country: manualCountry.trim() });
      if (result.ok) { setAddMode(null); setManualName(""); setManualCity(""); setManualCountry(""); onPlayerChanged(); }
      else setRowError(result.error ?? t("error_fallback"));
    });
  };

  const handleTogglePayment = async () => {
    try {
      await fetch(`/api/teams/${team.id}/fee-paid`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feePaid: !team.feePaid }),
      });
      router.refresh();
    } catch (err) {
      console.error("Error toggling payment:", err);
    }
  };

  const canAddPlayer = team.players.length < maxPlayers;
  const isWaitlist = team.selected === false;

  return (
    <div
      className="panel"
      style={{
        padding: "14px 18px",
        background: showPayment && team.feePaid
          ? "color-mix(in srgb, var(--teal) 6%, var(--bg-panel))"
          : undefined,
        border: showPayment
          ? `1.5px solid ${team.feePaid ? "color-mix(in srgb, var(--teal) 30%, var(--border))" : "var(--border)"}`
          : undefined,
      }}
    >
      {/* Team header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: team.players.length > 0 || isEditing ? 12 : 0 }}>
        {/* Seed / Waitlist badge */}
        <span style={{
          fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700,
          background: isWaitlist ? "var(--surface-3)" : "var(--border)",
          padding: "3px 8px", borderRadius: 4, flexShrink: 0,
          color: isWaitlist ? "var(--text-muted)" : undefined,
        }}>
          {isWaitlist ? `WL${team.waitlistPosition ?? "?"}` : `#${team.seed}`}
        </span>

        {isEditing ? (
          <div style={{ display: "flex", gap: 8, flex: 1, alignItems: "center", flexWrap: "wrap" }}>
            <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") onCancelEdit(); }}
                autoFocus
                style={{ flex: 1, minWidth: 120, padding: "6px 10px", fontSize: 15, fontFamily: "var(--font-display)", fontWeight: 700 }}
              />
            <button className="primary" onClick={handleRename} disabled={isPending} style={{ padding: "6px 14px", fontSize: 13 }}>{t("save")}</button>
            <button className="ghost" onClick={onCancelEdit} disabled={isPending} style={{ padding: "6px 14px", fontSize: 13 }}>{t("close")}</button>
          </div>
        ) : (
          <>
            <strong style={{ fontFamily: "var(--font-display)", fontSize: 16, flex: 1 }}>{team.name}</strong>
            {(team.city || team.country) && (
              <span className="meta" style={{ fontSize: 12 }}>{team.city ? `${team.city}, ` : ""}{team.country}</span>
            )}

            {/* Payment checkbox (PaymentTracker style) */}
            {showPayment && (
              <button
                onClick={handleTogglePayment}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: "none", border: "none", cursor: "pointer", padding: 0, flexShrink: 0,
                }}
              >
                <span style={{
                  width: 20, height: 20, borderRadius: 4, flexShrink: 0,
                  border: `2px solid ${team.feePaid ? "var(--teal)" : "var(--border)"}`,
                  background: team.feePaid ? "var(--teal)" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13, color: "#fff",
                }}>
                  {team.feePaid ? "✓" : ""}
                </span>
                <span style={{ fontSize: 12, color: team.feePaid ? "var(--teal)" : "var(--text-muted)" }}>
                  {t("paid")}
                </span>
              </button>
            )}

            {showActions && (
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button className="ghost" onClick={onStartEdit} style={{ padding: "4px 10px", fontSize: 12 }}>{t("edit")}</button>
                {!locked && (
                  <button onClick={onDelete} disabled={isPending} style={{ background: "none", border: "1.5px solid var(--border)", borderRadius: 6, cursor: "pointer", color: "var(--danger, #e53e3e)", padding: "4px 10px", fontSize: 12 }}>{t("delete")}</button>
                )}
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
            <PlayerChip
              key={tp.id}
              tp={tp}
              isEditing={isEditing}
              isPending={isPending}
              onRemove={() => onRemovePlayer(tp.id, tp.player.name)}
              onMerged={onPlayerChanged}
              tournamentId={tournamentId}
            />
          ))}
        </div>
      )}

      {/* Add player section — only in edit mode */}
      {isEditing && (
        <div style={{ borderTop: "1px solid var(--border-light)", paddingTop: 12 }}>
          {canAddPlayer ? (
            <>
              <p style={{ fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 8 }}>
                {t("add_player").toUpperCase()} · {team.players.length}/{maxPlayers}
              </p>
              {addMode === null && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="ghost" style={{ fontSize: 12 }} onClick={() => setAddMode("search")}>{t("search_player")}</button>
                  <button className="ghost" style={{ fontSize: 12 }} onClick={() => setAddMode("manual")}>{t("manual_entry")}</button>
                </div>
              )}

              {addMode === "search" && (
                <div ref={containerRef} style={{ position: "relative" }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      placeholder={t("search_player_placeholder")}
                      value={query}
                      onChange={(e) => { setQuery(e.target.value); searchPlayers(e.target.value); }}
                      onFocus={() => results.length > 0 && setShowResults(true)}
                      style={{ flex: 1 }}
                      autoFocus
                    />
                    <button className="ghost" style={{ fontSize: 12 }} onClick={() => { setAddMode(null); setQuery(""); setResults([]); }}>{t("cancel")}</button>
                  </div>
                  {showResults && results.length > 0 && (
                    <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--surface)", border: "2px solid var(--border)", borderRadius: 8, zIndex: 200, maxHeight: 180, overflowY: "auto", boxShadow: "var(--shadow-lg)" }}>
                      {results.map((p) => (
                        <button key={p.id} type="button"
                          style={{ width: "100%", textAlign: "left", padding: "8px 12px", background: "none", border: "none", cursor: "pointer", borderBottom: "1px solid var(--border-light)" }}
                          onMouseDown={() => handleAddExisting(p)}>
                          <strong style={{ fontSize: 13 }}>{p.name}</strong>
                          <span className="meta" style={{ marginLeft: 8, fontSize: 12 }}>{p.city ? `${p.city}, ` : ""}{p.country}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {showResults && results.length === 0 && query.length >= 2 && (
                    <p className="meta" style={{ marginTop: 4, fontSize: 12 }}>{t("no_results")}</p>
                  )}
                </div>
              )}

              {addMode === "manual" && (
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                    <input placeholder={t("manual_name_placeholder")} value={manualName} onChange={(e) => setManualName(e.target.value)} autoFocus />
                    <input placeholder={t("manual_city_placeholder")} value={manualCity} onChange={(e) => setManualCity(e.target.value)} />
                    <input placeholder={t("manual_country_placeholder")} value={manualCountry} onChange={(e) => setManualCountry(e.target.value)} />
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="primary" style={{ fontSize: 12 }} onClick={handleAddManual} disabled={isPending}>{t("add_player")}</button>
                    <button className="ghost" style={{ fontSize: 12 }} onClick={() => { setAddMode(null); setManualName(""); setManualCity(""); setManualCountry(""); }}>{t("cancel")}</button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="meta" style={{ fontSize: 12 }}>{t("team_full", { current: maxPlayers, max: maxPlayers, format: maxPlayers })}</p>
          )}
        </div>
      )}

      {/* Recap : régimes, logement, notes inscription, note orga — toujours visible */}
      {showRecap && (() => {
        const dietLabels: Record<string, string> = {
          OMNIVORE: tTeam("diet_omnivore"),
          VEGETARIAN: tTeam("diet_vegetarian"),
          VEGAN: tTeam("diet_vegan"),
          GLUTEN_FREE: tTeam("diet_gluten_free"),
        };
        const playersWithDiet = team.players.filter((tp) => (tp.player.diets?.length ?? 0) > 0 || tp.needsAccommodation);
        return (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border-light)", display: "grid", gap: 8 }}>
            {/* Régimes alimentaires & logement par joueur */}
            {playersWithDiet.map((tp) => {
              const diets = tp.player.diets ?? [];
              return (
                <div key={tp.player.id} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: 12 }}>
                  <span style={{ fontWeight: 600, minWidth: 100 }}>{tp.player.name}</span>
                  {diets.map((d) => (
                    <span key={d} style={{ fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 4, background: "var(--yellow)", color: "#1a1a1a", border: "1.5px solid var(--border)" }}>
                      {dietLabels[d] ?? d}
                    </span>
                  ))}
                  {tp.needsAccommodation && (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 4, background: "color-mix(in srgb, var(--teal) 20%, var(--surface))", border: "1.5px solid var(--teal)" }}>
                      {tTournament("orga_needs_accommodation")}
                    </span>
                  )}
                </div>
              );
            })}
            {/* Message inscription */}
            {team.registrationNote && (
              <div style={{ padding: "6px 10px", background: "color-mix(in srgb, var(--yellow) 12%, var(--surface))", borderRadius: 6, borderLeft: "3px solid var(--yellow)", fontSize: 12 }}>
                <span style={{ fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginRight: 6, fontSize: 11 }}>{tTournament("orga_registration_note")}</span>
                {team.registrationNote}
              </div>
            )}
            {/* Custom registration field answers */}
            {regAnswers && regAnswers.length > 0 && (
              <div style={{ display: "grid", gap: 4 }}>
                {regAnswers.map((a) => (
                  <div key={a.id} style={{ display: "flex", gap: 8, fontSize: 12, flexWrap: "wrap", alignItems: "baseline" }}>
                    <span style={{ fontWeight: 700, color: "var(--text-muted)", minWidth: 120 }}>
                      {a.field.label}{a.teamPlayer ? ` (${a.teamPlayer.player.name})` : ""}
                    </span>
                    <span>{a.value}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Note orga */}
            <OrgaNoteEditor
              teamId={team.id}
              initialNote={team.orgaNote ?? ""}
              label={tTournament("orga_note_label")}
              placeholder={tTournament("orga_note_placeholder")}
            />
          </div>
        );
      })()}
    </div>
  );
}

export function UnifiedTeamManager({
  teams,
  tournamentId,
  locked,
  format,
  showPayment = true,
  showRecap = false,
  showActions = true,
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

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ margin: 0, fontFamily: "var(--font-display)" }}>
          {t("registered_teams", { count: selected.length })}
          {maxTeams ? ` / ${maxTeams}` : ""}
        </h3>
        {showPayment && teams.length > 0 && (
          <span className="meta" style={{ fontSize: 12 }}>
            💳 {paidCount} / {teams.length} {t("paid")} · {paidCount * feePerTeam} {feeCurrency}
          </span>
        )}
      </div>

      {/* Selected teams */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {selected.map((team) => (
          <TeamRow
            key={team.id}
            team={team}
            locked={locked}
            maxPlayers={maxPlayers}
            tournamentId={tournamentId}
            showPayment={showPayment}
            showRecap={showRecap}
            showActions={showActions}
            feePerTeam={feePerTeam}
            feeCurrency={feeCurrency}
            isEditing={editingId === team.id}
            onStartEdit={() => setEditingId(team.id)}
            onCancelEdit={() => setEditingId(null)}
            onDelete={() => handleDeleteTeam(team.id, team.name)}
            onRemovePlayer={handleRemovePlayer}
            renameAction={renameAction}
            addPlayerAction={addPlayerAction}
            setEditingId={setEditingId}
            onPlayerChanged={() => router.refresh()}
          />
        ))}
      </div>

      {/* Waitlist */}
      {waitlist.length > 0 && (
        <>
          <div style={{
            margin: "18px 0 10px",
            paddingBottom: 8,
            borderBottom: "1px solid var(--border-light)",
            fontSize: 11, fontWeight: 700,
            fontFamily: "var(--font-display)",
            color: "var(--text-muted)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}>
            {t("waitlist", { count: waitlist.length })}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {waitlist.map((team) => (
              <TeamRow
                key={team.id}
                team={team}
                locked={locked}
                maxPlayers={maxPlayers}
                tournamentId={tournamentId}
                showPayment={showPayment}
                showRecap={showRecap}
                showActions={showActions}
                feePerTeam={feePerTeam}
                feeCurrency={feeCurrency}
                isEditing={editingId === team.id}
                onStartEdit={() => setEditingId(team.id)}
                onCancelEdit={() => setEditingId(null)}
                onDelete={() => handleDeleteTeam(team.id, team.name)}
                onRemovePlayer={handleRemovePlayer}
                renameAction={renameAction}
                addPlayerAction={addPlayerAction}
                setEditingId={setEditingId}
                onPlayerChanged={() => router.refresh()}
              />
            ))}
          </div>
        </>
      )}

      {/* Create team */}
      {createTeamAction && (
        <div style={{ marginTop: 16, paddingBottom: 16 }}>
          {showCreateForm ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input
                placeholder={t("team_name_placeholder")}
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateTeam();
                  if (e.key === "Escape") { setShowCreateForm(false); setNewTeamName(""); }
                }}
                autoFocus
                style={{ flex: 1, minWidth: 160 }}
              />
              <button className="primary" onClick={handleCreateTeam} disabled={isPending || !newTeamName.trim()} style={{ fontSize: 13 }}>{t("create")}</button>
              <button className="ghost" onClick={() => { setShowCreateForm(false); setNewTeamName(""); }} style={{ fontSize: 13 }}>{t("cancel")}</button>
            </div>
          ) : (
            <button className="ghost" onClick={() => setShowCreateForm(true)} style={{ fontSize: 13 }}>{t("add_team")}</button>
          )}
        </div>
      )}

      {globalError && (
        <p style={{ marginTop: 12, padding: 12, background: "color-mix(in srgb, var(--orange) 15%, var(--bg-panel))", border: "1px solid var(--orange)", borderRadius: 8, fontSize: 12 }}>
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
