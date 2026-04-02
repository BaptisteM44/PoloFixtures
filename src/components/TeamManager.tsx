"use client";

import { useState, useTransition, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

type PlayerResult = {
  id: string;
  name: string;
  city: string | null;
  country: string;
};

type TeamPlayer = {
  id: string;
  player: { id: string; name: string; country: string; account?: { id: string } | null };
};

type Team = {
  id: string;
  name: string;
  seed: number;
  city: string | null;
  country: string | null;
  players: TeamPlayer[];
  selected?: boolean;
  waitlistPosition?: number | null;
};

type AddPlayerData =
  | { type: "existing"; playerId: string }
  | { type: "manual"; name: string; city?: string | null; country: string };

type Props = {
  teams: Team[];
  locked: boolean;
  format?: string;
  renameAction: (teamId: string, name: string, tournamentId: string) => Promise<{ ok?: boolean; error?: string }>;
  deleteTeamAction: (teamId: string, tournamentId: string) => Promise<{ ok?: boolean; error?: string }>;
  removePlayerAction: (teamPlayerId: string, tournamentId: string) => Promise<{ ok?: boolean; error?: string }>;
  addPlayerAction: (teamId: string, tournamentId: string, playerData: AddPlayerData) => Promise<{ ok?: boolean; error?: string }>;
  createTeamAction?: (tournamentId: string, name: string) => Promise<{ ok?: boolean; error?: string }>;
  tournamentId: string;
};

function maxPlayersFromFormat(format?: string): number {
  if (!format) return 3;
  const m = format.match(/^(\d+)v\d+$/i);
  return m ? parseInt(m[1], 10) : 3;
}

export function TeamManager({ teams, locked, format, renameAction, deleteTeamAction, removePlayerAction, addPlayerAction, createTeamAction, tournamentId }: Props) {
  const t = useTranslations("team_manager");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const maxPlayers = maxPlayersFromFormat(format);
  const router = useRouter();

  const handleCreateTeam = () => {
    if (!newTeamName.trim() || !createTeamAction) return;
    setGlobalError(null);
    startTransition(async () => {
      const result = await createTeamAction(tournamentId, newTeamName.trim());
      if (result.ok) { setNewTeamName(""); setShowCreateForm(false); router.refresh(); }
      else setGlobalError(result.error ?? t("error_fallback"));
    });
  };

  const handleDeleteTeam = (teamId: string, teamName: string) => {
    if (!confirm(t("confirm_delete_team", { name: teamName }))) return;
    startTransition(async () => {
      await deleteTeamAction(teamId, tournamentId);
      router.refresh();
    });
  };

  const handleRemovePlayer = (teamPlayerId: string, playerName: string) => {
    if (!confirm(t("confirm_remove_player", { name: playerName }))) return;
    startTransition(async () => {
      await removePlayerAction(teamPlayerId, tournamentId);
      router.refresh();
    });
  };

  const selected = [...teams].filter((tm) => tm.selected !== false).sort((a, b) => a.seed - b.seed);
  const waitlist = [...teams].filter((tm) => tm.selected === false).sort((a, b) => (a.waitlistPosition ?? 999) - (b.waitlistPosition ?? 999));

  const renderRow = (team: Team) => (
    <TeamRow
      key={team.id}
      team={team}
      locked={locked}
      maxPlayers={maxPlayers}
      tournamentId={tournamentId}
      isEditing={editingId === team.id}
      onStartEdit={() => { setEditingId(team.id); setGlobalError(null); }}
      onCancelEdit={() => setEditingId(null)}
      onDelete={() => handleDeleteTeam(team.id, team.name)}
      onRemovePlayer={handleRemovePlayer}
      isPending={isPending}
      renameAction={renameAction}
      addPlayerAction={addPlayerAction}
      startTransition={startTransition}
      setEditingId={setEditingId}
      onPlayerChanged={() => router.refresh()}
    />
  );

  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ marginBottom: 16 }}>{t("registered_teams", { count: teams.length })}</h3>
      <div style={{ display: "grid", gap: 12 }}>
        {selected.map(renderRow)}
        {waitlist.length > 0 && (
          <>
            <div style={{ padding: "6px 0", borderTop: "2px solid var(--border)", borderBottom: "1px solid var(--border-light)", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {t("waitlist", { count: waitlist.length })}
            </div>
            {waitlist.map(renderRow)}
          </>
        )}
      </div>
      {/* Create team */}
      {!locked && createTeamAction && (
        <div style={{ marginTop: 16 }}>
          {showCreateForm ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                placeholder={t("team_name_placeholder")}
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreateTeam(); if (e.key === "Escape") { setShowCreateForm(false); setNewTeamName(""); } }}
                autoFocus
                style={{ flex: 1 }}
              />
              <button className="primary" onClick={handleCreateTeam} disabled={isPending || !newTeamName.trim()} style={{ fontSize: 13 }}>{t("create")}</button>
              <button className="ghost" onClick={() => { setShowCreateForm(false); setNewTeamName(""); }} style={{ fontSize: 13 }}>{t("cancel")}</button>
            </div>
          ) : (
            <button className="ghost" onClick={() => setShowCreateForm(true)} style={{ fontSize: 13 }}>{t("add_team")}</button>
          )}
        </div>
      )}
      {globalError && <p className="error" style={{ marginTop: 8 }}>{globalError}</p>}
      {locked && (
        <p className="meta" style={{ marginTop: 10, fontSize: 12 }}>
          {t("locked_notice")}
        </p>
      )}
    </div>
  );
}

function PlayerChip({ tp, isEditing, isPending, onRemove, onMerged }: {
  tp: TeamPlayer;
  isEditing: boolean;
  isPending: boolean;
  onRemove: () => void;
  onMerged: () => void;
}) {
  const t = useTranslations("team_manager");
  const hasAccount = !!tp.player.account;
  const [merging, setMerging] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlayerResult[]>([]);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [mergePending, setMergePending] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchTarget = (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      const res = await fetch(`/api/players?search=${encodeURIComponent(q)}&hasAccount=true`);
      const data = await res.json();
      // Exclude self (API already filters to real accounts only)
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
        <span style={{ fontWeight: 600 }}>{tp.player.name}</span>
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
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleMerge(p.id, p.name)}
                  disabled={mergePending}
                  style={{ width: "100%", textAlign: "left", padding: "7px 12px", background: "none", border: "none", borderBottom: "1px solid var(--border-light)", cursor: "pointer", fontSize: 12 }}
                >
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

function TeamRow({
  team, locked, maxPlayers, tournamentId,
  isEditing, onStartEdit, onCancelEdit, onDelete, onRemovePlayer,
  isPending, renameAction, addPlayerAction, startTransition, setEditingId, onPlayerChanged,
}: {
  team: Team;
  locked: boolean;
  maxPlayers: number;
  tournamentId: string;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onRemovePlayer: (tpId: string, name: string) => void;
  isPending: boolean;
  renameAction: Props["renameAction"];
  addPlayerAction: Props["addPlayerAction"];
  startTransition: (fn: () => Promise<void>) => void;
  setEditingId: (id: string | null) => void;
  onPlayerChanged: () => void;
}) {
  const t = useTranslations("team_manager");
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
      const res = await fetch(`/api/players?search=${encodeURIComponent(q)}&excludeTournamentId=${tournamentId}`);
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

  const canAddPlayer = team.players.length < maxPlayers;

  return (
    <div className="panel" style={{ padding: "14px 18px" }}>
      {/* Team header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, background: team.selected === false ? "var(--surface-3)" : "var(--border)", padding: "3px 8px", borderRadius: 4, flexShrink: 0, color: team.selected === false ? "var(--text-muted)" : undefined }}>
          {team.selected === false ? `WL${team.waitlistPosition ?? "?"}` : `#${team.seed}`}
        </span>

        {isEditing ? (
          <div style={{ display: "flex", gap: 8, flex: 1, alignItems: "center" }}>
            {locked ? (
              <strong style={{ fontFamily: "var(--font-display)", fontSize: 16, flex: 1 }}>{team.name}</strong>
            ) : (
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") onCancelEdit(); }}
                autoFocus
                style={{ flex: 1, padding: "6px 10px", fontSize: 15, fontFamily: "var(--font-display)", fontWeight: 700 }}
              />
            )}
            {!locked && <button className="primary" onClick={handleRename} disabled={isPending} style={{ padding: "6px 14px", fontSize: 13 }}>{t("save")}</button>}
            <button className="ghost" onClick={onCancelEdit} disabled={isPending} style={{ padding: "6px 14px", fontSize: 13 }}>{t("close")}</button>
          </div>
        ) : (
          <>
            <strong style={{ fontFamily: "var(--font-display)", fontSize: 16, flex: 1 }}>{team.name}</strong>
            {(team.city || team.country) && (
              <span className="meta" style={{ fontSize: 12 }}>{team.city ? `${team.city}, ` : ""}{team.country}</span>
            )}
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button className="ghost" onClick={onStartEdit} style={{ padding: "4px 10px", fontSize: 12 }}>{t("edit")}</button>
              {!locked && (
                <button onClick={onDelete} disabled={isPending} style={{ background: "none", border: "1.5px solid var(--border)", borderRadius: 6, cursor: "pointer", color: "var(--danger, #e53e3e)", padding: "4px 10px", fontSize: 12 }}>{t("delete")}</button>
              )}
            </div>
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
            />
          ))}
        </div>
      )}

      {/* Add player section — only in edit mode (allowed even when locked) */}
      {isEditing && (
        <div style={{ borderTop: "1px solid var(--border-light)", paddingTop: 12 }}>
          {canAddPlayer ? (
            <>
              <p style={{ fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 8 }}>
                AJOUTER UN JOUEUR · {team.players.length}/{maxPlayers}
              </p>
              {addMode === null && (
                <div style={{ display: "flex", gap: 8 }}>
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
                        <button key={p.id} type="button" style={{ width: "100%", textAlign: "left", padding: "8px 12px", background: "none", border: "none", cursor: "pointer", borderBottom: "1px solid var(--border-light)" }} onMouseDown={() => handleAddExisting(p)}>
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
    </div>
  );
}
