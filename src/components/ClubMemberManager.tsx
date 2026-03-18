"use client";

import { useState, useEffect, useRef } from "react";

type Member = {
  id: string;
  playerId: string;
  status: "MEMBER" | "PENDING_BY_MANAGER" | "PENDING_BY_PLAYER";
  player: { id: string; name: string; slug?: string | null };
};

type PlayerSuggestion = { id: string; name: string; slug?: string | null };

type Props = {
  clubId: string;
  managerId: string;
  members: Member[];
  currentPlayerId: string | null;
  isManager: boolean;
};

export function ClubMemberManager({ clubId, managerId, members: initialMembers, currentPlayerId, isManager }: Props) {
  const [members, setMembers] = useState(initialMembers);
  const [searchSlug, setSearchSlug] = useState("");
  const [suggestions, setSuggestions] = useState<PlayerSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searching, setSearching] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  // Fermer le dropdown si clic dehors
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Autocomplete en live
  useEffect(() => {
    if (searchSlug.trim().length < 2) { setSuggestions([]); setShowSuggestions(false); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/players?search=${encodeURIComponent(searchSlug)}&status=ACTIVE`);
        const data: PlayerSuggestion[] = await res.json();
        // Exclure ceux déjà membres ou avec invitation en cours
        const memberIds = new Set(members.map((m) => m.playerId));
        setSuggestions(data.filter((p) => !memberIds.has(p.id)).slice(0, 8));
        setShowSuggestions(true);
      } catch { setSuggestions([]); }
      setSearching(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchSlug, members]);

  const myMembership = currentPlayerId ? members.find((m) => m.playerId === currentPlayerId) : null;
  const isAlreadyMember = myMembership?.status === "MEMBER";
  const hasPendingRequest = myMembership?.status === "PENDING_BY_PLAYER";
  const hasPendingInvite = myMembership?.status === "PENDING_BY_MANAGER";

  async function invitePlayer(player: PlayerSuggestion) {
    setInviteError(null);
    setShowSuggestions(false);
    setSearchSlug(player.name);
    setLoading("invite-" + player.id);
    try {
      const r = await fetch(`/api/clubs/${clubId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: player.id, action: "invite" }),
      });
      if (!r.ok) { const e = await r.json(); setInviteError(e.error ?? "Erreur"); setLoading(null); return; }
      const m = await r.json();
      setMembers((prev) => [...prev, { ...m, player: { id: player.id, name: player.name, slug: player.slug ?? null } }]);
      setSearchSlug("");
    } catch { setInviteError("Erreur réseau"); }
    setLoading(null);
  }

  async function joinDirectly() {
    setLoading("request");
    const r = await fetch(`/api/clubs/${clubId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "join" }),
    });
    if (r.ok) {
      const m = await r.json();
      setMembers((prev) => [...prev, { ...m, status: "MEMBER", player: { id: currentPlayerId!, name: "Vous", slug: null } }]);
    }
    setLoading(null);
  }

  async function acceptOrReject(playerId: string, action: "accept" | "reject") {
    setLoading(playerId + action);
    const r = await fetch(`/api/clubs/${clubId}/members`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId, action }),
    });
    if (r.ok) {
      if (action === "accept") {
        setMembers((prev) => prev.map((m) => m.playerId === playerId ? { ...m, status: "MEMBER" } : m));
      } else {
        setMembers((prev) => prev.filter((m) => m.playerId !== playerId));
      }
    }
    setLoading(null);
  }

  async function removeMember(playerId: string) {
    if (!confirm("Retirer ce membre ?")) return;
    setLoading("remove" + playerId);
    await fetch(`/api/clubs/${clubId}/members?playerId=${playerId}`, { method: "DELETE" });
    setMembers((prev) => prev.filter((m) => m.playerId !== playerId));
    setLoading(null);
  }

  const activeMembers = members.filter((m) => m.status === "MEMBER");
  const pendingByPlayer = members.filter((m) => m.status === "PENDING_BY_PLAYER");
  const pendingByManager = members.filter((m) => m.status === "PENDING_BY_MANAGER");

  return (
    <div className="club-members">
      {/* Demandes reçues (manager) */}
      {isManager && pendingByPlayer.length > 0 && (
        <div className="club-members__section">
          <h4>Demandes à approuver ({pendingByPlayer.length})</h4>
          {pendingByPlayer.map((m) => (
            <div key={m.id} className="club-member-row club-member-row--pending">
              <span>{m.player.name}</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="primary"
                  style={{ fontSize: 12, padding: "4px 12px" }}
                  disabled={loading === m.playerId + "accept"}
                  onClick={() => acceptOrReject(m.playerId, "accept")}
                >
                  Accepter
                </button>
                <button
                  className="ghost"
                  style={{ fontSize: 12, padding: "4px 12px" }}
                  disabled={loading === m.playerId + "reject"}
                  onClick={() => acceptOrReject(m.playerId, "reject")}
                >
                  Refuser
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Invitation en attente côté joueur connecté */}
      {hasPendingInvite && (
        <div className="club-members__section">
          <p>Vous avez été invité(e) à rejoindre ce club !</p>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="primary" disabled={!!loading} onClick={() => acceptOrReject(currentPlayerId!, "accept")}>
              Accepter l&apos;invitation
            </button>
            <button className="ghost" disabled={!!loading} onClick={() => acceptOrReject(currentPlayerId!, "reject")}>
              Refuser
            </button>
          </div>
        </div>
      )}

      {/* Bouton rejoindre (joueur non-membre) */}
      {currentPlayerId && !isManager && !isAlreadyMember && !hasPendingInvite && !hasPendingRequest && (
        <div className="club-members__section">
          <button className="primary" disabled={loading === "request"} onClick={joinDirectly}>
            {loading === "request" ? "Envoi…" : "Rejoindre ce club"}
          </button>
        </div>
      )}

      {/* Inviter un joueur (manager) */}
      {isManager && (
        <div className="club-members__section" style={{ marginBottom: 16 }}>
          <h4>Inviter un joueur</h4>
          <div ref={searchRef} style={{ position: "relative" }}>
            <input
              placeholder="Commence à taper un nom…"
              value={searchSlug}
              onChange={(e) => { setSearchSlug(e.target.value); setInviteError(null); }}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              style={{ width: "100%" }}
            />
            {searching && <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "var(--text-muted)" }}>…</span>}
            {showSuggestions && suggestions.length > 0 && (
              <div className="player-autocomplete">
                {suggestions.map((p) => (
                  <button
                    key={p.id}
                    className="player-autocomplete__item"
                    onMouseDown={(e) => { e.preventDefault(); invitePlayer(p); }}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
            {showSuggestions && suggestions.length === 0 && searchSlug.trim().length >= 2 && !searching && (
              <div className="player-autocomplete">
                <span className="player-autocomplete__empty">Aucun joueur trouvé</span>
              </div>
            )}
          </div>
          {inviteError && <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 6 }}>{inviteError}</p>}
          {pendingByManager.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <p className="meta">Invitations en attente :</p>
              {pendingByManager.map((m) => (
                <div key={m.id} className="club-member-row">
                  <span>{m.player.name} <span className="meta">(invitation envoyée)</span></span>
                  <button className="ghost" style={{ fontSize: 11 }} onClick={() => removeMember(m.playerId)}>Annuler</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Liste des membres */}
      <div className="club-members__section">
        <h4>Membres ({activeMembers.length})</h4>
        {activeMembers.length === 0 ? (
          <p className="meta">Aucun membre pour l&apos;instant.</p>
        ) : (
          <div className="club-member-list">
            {activeMembers.map((m) => (
              <div key={m.id} className="club-member-row">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <a href={`/player/${m.player.slug ?? m.player.id}`} style={{ fontWeight: 600 }}>
                    {m.player.name}
                  </a>
                  {m.playerId === managerId && (
                    <span className="club-manager-badge">Manager</span>
                  )}
                </div>
                {isManager && m.playerId !== managerId && (
                  <button
                    className="ghost"
                    style={{ fontSize: 11, padding: "2px 8px" }}
                    disabled={loading === "remove" + m.playerId}
                    onClick={() => removeMember(m.playerId)}
                  >
                    Retirer
                  </button>
                )}
                {!isManager && m.playerId === currentPlayerId && (
                  <button
                    className="ghost"
                    style={{ fontSize: 11, padding: "2px 8px" }}
                    disabled={loading === "remove" + m.playerId}
                    onClick={() => removeMember(m.playerId)}
                  >
                    Quitter
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
