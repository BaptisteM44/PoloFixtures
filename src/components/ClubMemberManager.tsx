"use client";

import { useState } from "react";

type Member = {
  id: string;
  playerId: string;
  status: "MEMBER" | "PENDING_BY_MANAGER" | "PENDING_BY_PLAYER";
  player: { id: string; name: string; slug?: string | null };
};

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
  const [searching, setSearching] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  const myMembership = currentPlayerId ? members.find((m) => m.playerId === currentPlayerId) : null;
  const isAlreadyMember = myMembership?.status === "MEMBER";
  const hasPendingRequest = myMembership?.status === "PENDING_BY_PLAYER";
  const hasPendingInvite = myMembership?.status === "PENDING_BY_MANAGER";

  async function invitePlayer() {
    if (!searchSlug.trim()) return;
    setSearching(true);
    setInviteError(null);
    try {
      // Chercher le joueur par slug ou nom
      const res = await fetch(`/api/players?search=${encodeURIComponent(searchSlug)}&limit=1`);
      const data = await res.json();
      if (!data?.length) { setInviteError("Joueur introuvable"); setSearching(false); return; }
      const player = data[0];

      const r = await fetch(`/api/clubs/${clubId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: player.id, action: "invite" }),
      });
      if (!r.ok) { const e = await r.json(); setInviteError(e.error ?? "Erreur"); setSearching(false); return; }
      const m = await r.json();
      setMembers((prev) => [...prev, { ...m, player: { id: player.id, name: player.name, slug: player.slug } }]);
      setSearchSlug("");
    } catch { setInviteError("Erreur réseau"); }
    setSearching(false);
  }

  async function requestJoin() {
    setLoading("request");
    const r = await fetch(`/api/clubs/${clubId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "request" }),
    });
    if (r.ok) {
      const m = await r.json();
      setMembers((prev) => [...prev, { ...m, player: { id: currentPlayerId!, name: "Vous", slug: null } }]);
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
          <button className="ghost" disabled={loading === "request"} onClick={requestJoin}>
            {loading === "request" ? "Envoi…" : "Demander à rejoindre le club"}
          </button>
        </div>
      )}
      {hasPendingRequest && (
        <div className="club-members__section">
          <p className="meta">⏳ Demande envoyée — en attente du manager</p>
        </div>
      )}

      {/* Inviter un joueur (manager) */}
      {isManager && (
        <div className="club-members__section">
          <h4>Inviter un joueur</h4>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              placeholder="Nom ou slug du joueur…"
              value={searchSlug}
              onChange={(e) => setSearchSlug(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && invitePlayer()}
              style={{ flex: 1, minWidth: 180 }}
            />
            <button className="primary" disabled={searching || !searchSlug.trim()} onClick={invitePlayer}>
              {searching ? "…" : "Inviter"}
            </button>
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
