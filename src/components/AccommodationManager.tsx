"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

type PlayerInfo = { id: string; name: string; photoPath: string | null; petAllergies?: string | null; foodAllergies?: string | null };
type TeamInfo = { id: string; name: string };

type TeamPlayerRow = {
  id: string;
  needsAccommodation: boolean;
  player: PlayerInfo;
  team: TeamInfo;
};

type GuestRow = {
  id: string;
  notes: string | null;
  notifiedAt?: string | Date | null; // date de notification (null = pas encore prévenu)
  teamPlayer: { id: string; player: PlayerInfo; team: TeamInfo };
};

type HostRow = {
  id: string;
  playerId: string | null;
  name: string;
  contact: string | null;
  capacity?: number | null; // places offertes
  notes: string | null;
  player: PlayerInfo | null;
  guests: GuestRow[];
};

export function AccommodationManager({
  tournamentId,
  teamPlayers,
  initialHosts,
}: {
  tournamentId: string;
  teamPlayers: TeamPlayerRow[];
  initialHosts: HostRow[];
}) {
  const t = useTranslations("tournament");
  const [hosts, setHosts] = useState<HostRow[]>(initialHosts);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Add host form
  const [newHostName, setNewHostName] = useState("");
  const [newHostContact, setNewHostContact] = useState("");
  const [newHostCapacity, setNewHostCapacity] = useState("");
  const [newHostNotes, setNewHostNotes] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  // Edit host state
  const [editingHostId, setEditingHostId] = useState<string | null>(null);
  const [editHostData, setEditHostData] = useState({ name: "", contact: "", capacity: "", notes: "" });

  // Lien logeur → compte joueur (recherche par nom)
  const [linkingHostId, setLinkingHostId] = useState<string | null>(null);
  const [linkSearch, setLinkSearch] = useState("");
  const [linkResults, setLinkResults] = useState<PlayerInfo[]>([]);
  const [linkSearching, setLinkSearching] = useState(false);

  // Bouton « Notifier » : envoie notif+mail à tous les logés/logeurs pas encore prévenus
  const [notifyResult, setNotifyResult] = useState<string | null>(null);
  const pendingNotifyCount = hosts.flatMap((h) => h.guests).filter((g) => !g.notifiedAt).length;

  const api = `/api/tournaments/${tournamentId}/accommodation/hosts`;

  const assignedTeamPlayerIds = new Set(hosts.flatMap((h) => h.guests.map((g) => g.teamPlayer.id)));
  const unassigned = teamPlayers.filter((tp) => !assignedTeamPlayerIds.has(tp.id));

  const addHost = () => {
    if (!newHostName.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newHostName.trim(),
          contact: newHostContact.trim() || null,
          capacity: newHostCapacity ? Number(newHostCapacity) : null,
          notes: newHostNotes.trim() || null,
        }),
      });
      if (res.ok) {
        const host = await res.json();
        setHosts((prev) => [...prev, host]);
        setNewHostName("");
        setNewHostContact("");
        setNewHostCapacity("");
        setNewHostNotes("");
        setShowAddForm(false);
      } else {
        setError(t("accommodation_error_create"));
      }
    });
  };

  const notifyAll = () => {
    if (!window.confirm(t("accommodation_notify_confirm", { count: pendingNotifyCount }))) return;
    setNotifyResult(null);
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/tournaments/${tournamentId}/accommodation/notify`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        const now = new Date().toISOString();
        setHosts((prev) => prev.map((h) => ({ ...h, guests: h.guests.map((g) => ({ ...g, notifiedAt: g.notifiedAt ?? now })) })));
        setNotifyResult(t("accommodation_notify_done", { guests: data.notifiedGuests, hosts: data.notifiedHosts }));
      } else {
        setError(t("accommodation_notify_error"));
      }
    });
  };

  const deleteHost = (hostId: string) => {
    if (!window.confirm(t("accommodation_delete_confirm"))) return;
    setHosts((prev) => prev.filter((h) => h.id !== hostId));
    startTransition(async () => {
      await fetch(`${api}/${hostId}`, { method: "DELETE" });
    });
  };

  const startEditHost = (host: HostRow) => {
    setEditingHostId(host.id);
    setEditHostData({ name: host.name, contact: host.contact ?? "", capacity: host.capacity != null ? String(host.capacity) : "", notes: host.notes ?? "" });
  };

  const saveEditHost = (hostId: string) => {
    const capacity = editHostData.capacity ? Number(editHostData.capacity) : null;
    setHosts((prev) => prev.map((h) => h.id === hostId ? { ...h, name: editHostData.name, contact: editHostData.contact || null, capacity, notes: editHostData.notes || null } : h));
    setEditingHostId(null);
    startTransition(async () => {
      await fetch(`${api}/${hostId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editHostData.name, contact: editHostData.contact || null, capacity, notes: editHostData.notes || null }),
      });
    });
  };

  const searchLinkPlayers = (query: string) => {
    setLinkSearch(query);
    if (query.trim().length < 2) { setLinkResults([]); return; }
    setLinkSearching(true);
    fetch(`/api/players?search=${encodeURIComponent(query.trim())}&hasAccount=true`)
      .then((r) => r.json())
      .then((data) => setLinkResults(Array.isArray(data) ? data : []))
      .finally(() => setLinkSearching(false));
  };

  const linkHostToPlayer = (hostId: string, player: PlayerInfo) => {
    setHosts((prev) => prev.map((h) => h.id === hostId ? { ...h, playerId: player.id, player } : h));
    setLinkingHostId(null);
    setLinkSearch("");
    setLinkResults([]);
    startTransition(async () => {
      await fetch(`${api}/${hostId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: player.id }),
      });
    });
  };

  const unlinkHost = (hostId: string) => {
    setHosts((prev) => prev.map((h) => h.id === hostId ? { ...h, playerId: null, player: null } : h));
    startTransition(async () => {
      await fetch(`${api}/${hostId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: null }),
      });
    });
  };

  const addGuest = (hostId: string, teamPlayerId: string) => {
    startTransition(async () => {
      const res = await fetch(`${api}/${hostId}/guests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamPlayerId }),
      });
      if (res.ok) {
        const guest = await res.json();
        setHosts((prev) => prev.map((h) => h.id === hostId ? { ...h, guests: [...h.guests, guest] } : h));
      }
    });
  };

  const removeGuest = (hostId: string, guestId: string) => {
    setHosts((prev) => prev.map((h) => h.id === hostId ? { ...h, guests: h.guests.filter((g) => g.id !== guestId) } : h));
    startTransition(async () => {
      await fetch(`${api}/${hostId}/guests/${guestId}`, { method: "DELETE" });
    });
  };

  const needsAccoCount = teamPlayers.filter((tp) => tp.needsAccommodation).length;
  const assignedCount = assignedTeamPlayerIds.size;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 16 }}>{t("accommodation_title")}</h3>
          <p className="meta" style={{ margin: "4px 0 0" }}>
            {t("accommodation_assigned", { count: assignedCount, plural: assignedCount !== 1 ? "s" : "" })}
            {" · "}
            {t("accommodation_requests", { count: needsAccoCount, plural: needsAccoCount !== 1 ? "s" : "" })}
            {" · "}
            {t("accommodation_total", { count: teamPlayers.length, plural: teamPlayers.length !== 1 ? "s" : "" })}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {pendingNotifyCount > 0 && (
            <button className="ghost" onClick={notifyAll} disabled={isPending} style={{ fontSize: 13 }}>
              📣 {t("accommodation_notify_btn", { count: pendingNotifyCount })}
            </button>
          )}
          <button className="primary" onClick={() => setShowAddForm((v) => !v)} style={{ fontSize: 13 }}>
            {t("accommodation_add_host")}
          </button>
        </div>
      </div>
      {notifyResult && <p style={{ color: "var(--teal)", fontSize: 13, fontWeight: 600, marginTop: -8, marginBottom: 12 }}>✓ {notifyResult}</p>}

      {showAddForm && (
        <div className="panel" style={{ marginBottom: 20, padding: 16 }}>
          <h4 style={{ margin: "0 0 12px", fontSize: 14 }}>{t("accommodation_new_host")}</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input
              type="text"
              value={newHostName}
              onChange={(e) => setNewHostName(e.target.value)}
              placeholder={t("accommodation_host_name_placeholder")}
              style={{ fontSize: 13 }}
            />
            <input
              type="text"
              value={newHostContact}
              onChange={(e) => setNewHostContact(e.target.value)}
              placeholder={t("accommodation_host_contact_placeholder")}
              style={{ fontSize: 13 }}
            />
            <input
              type="number"
              min={1}
              max={50}
              value={newHostCapacity}
              onChange={(e) => setNewHostCapacity(e.target.value)}
              placeholder={t("accommodation_host_capacity_placeholder")}
              style={{ fontSize: 13 }}
            />
            <input
              type="text"
              value={newHostNotes}
              onChange={(e) => setNewHostNotes(e.target.value)}
              placeholder={t("accommodation_host_notes_placeholder")}
              style={{ fontSize: 13 }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button className="primary" onClick={addHost} disabled={!newHostName.trim() || isPending} style={{ fontSize: 13 }}>{t("accommodation_create")}</button>
              <button className="ghost" onClick={() => setShowAddForm(false)} style={{ fontSize: 13 }}>{t("accommodation_cancel")}</button>
            </div>
          </div>
        </div>
      )}

      {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}

      {hosts.length === 0 ? (
        <p className="meta" style={{ textAlign: "center", padding: 24 }}>{t("accommodation_no_hosts")}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {hosts.map((host) => (
            <div key={host.id} className="panel" style={{ padding: 16 }}>
              {editingHostId === host.id ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                  <input type="text" value={editHostData.name} onChange={(e) => setEditHostData((d) => ({ ...d, name: e.target.value }))} placeholder={t("accommodation_host_name_placeholder")} style={{ fontSize: 13 }} />
                  <input type="text" value={editHostData.contact} onChange={(e) => setEditHostData((d) => ({ ...d, contact: e.target.value }))} placeholder={t("accommodation_host_contact_placeholder")} style={{ fontSize: 13 }} />
                  <input type="number" min={1} max={50} value={editHostData.capacity} onChange={(e) => setEditHostData((d) => ({ ...d, capacity: e.target.value }))} placeholder={t("accommodation_host_capacity_placeholder")} style={{ fontSize: 13 }} />
                  <input type="text" value={editHostData.notes} onChange={(e) => setEditHostData((d) => ({ ...d, notes: e.target.value }))} placeholder={t("accommodation_host_notes_placeholder")} style={{ fontSize: 13 }} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="primary" onClick={() => saveEditHost(host.id)} style={{ fontSize: 12 }}>{t("accommodation_save")}</button>
                    <button className="ghost" onClick={() => setEditingHostId(null)} style={{ fontSize: 12 }}>{t("accommodation_cancel")}</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <strong style={{ fontSize: 14 }}>
                      {host.name}
                      {host.capacity != null && (
                        <span style={{
                          marginLeft: 8, fontSize: 11, fontWeight: 700, padding: "1px 8px", borderRadius: 10,
                          background: host.guests.length > host.capacity ? "var(--danger)" : "var(--bg-muted)",
                          color: host.guests.length > host.capacity ? "#fff" : "var(--text-muted)",
                        }} title={host.guests.length > host.capacity ? t("accommodation_over_capacity") : undefined}>
                          🛏 {host.guests.length}/{host.capacity}
                        </span>
                      )}
                    </strong>
                    {host.contact && <p className="meta" style={{ margin: "2px 0 0", fontSize: 12 }}>{host.contact}</p>}
                    {host.notes && <p className="meta" style={{ margin: "2px 0 0", fontSize: 11, fontStyle: "italic" }}>🔒 {host.notes}</p>}
                    <p className="meta" style={{ margin: "4px 0 0", fontSize: 11 }}>
                      {host.player
                        ? <>🔗 {t("accommodation_linked_to")} <strong>{host.player.name}</strong> · <button className="ghost" onClick={() => unlinkHost(host.id)} style={{ fontSize: 10, padding: "0 4px" }}>{t("accommodation_unlink")}</button></>
                        : <button className="ghost" onClick={() => { setLinkingHostId(host.id); setLinkSearch(""); setLinkResults([]); }} style={{ fontSize: 11, padding: "2px 6px" }}>{t("accommodation_link_account")}</button>}
                    </p>
                    {linkingHostId === host.id && (
                      <div style={{ marginTop: 6, position: "relative", maxWidth: 260 }}>
                        <input
                          type="text"
                          autoFocus
                          value={linkSearch}
                          onChange={(e) => searchLinkPlayers(e.target.value)}
                          placeholder={t("accommodation_link_search_placeholder")}
                          style={{ fontSize: 12, width: "100%" }}
                        />
                        {linkSearching && <p className="meta" style={{ fontSize: 10, margin: "4px 0 0" }}>…</p>}
                        {linkResults.length > 0 && (
                          <div className="panel" style={{ position: "absolute", zIndex: 5, marginTop: 2, width: "100%", maxHeight: 180, overflowY: "auto", padding: 4 }}>
                            {linkResults.map((p) => (
                              <div key={p.id} onClick={() => linkHostToPlayer(host.id, p)} style={{ padding: "6px 8px", fontSize: 12, cursor: "pointer", borderRadius: 4 }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-muted)")}
                                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                                {p.name}
                              </div>
                            ))}
                          </div>
                        )}
                        <button className="ghost" onClick={() => setLinkingHostId(null)} style={{ fontSize: 10, padding: "2px 6px", marginTop: 4 }}>{t("accommodation_cancel")}</button>
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="ghost" onClick={() => startEditHost(host)} style={{ fontSize: 11, padding: "3px 8px" }}>✎</button>
                    <button className="ghost" onClick={() => deleteHost(host.id)} style={{ fontSize: 11, padding: "3px 8px", color: "var(--danger)" }}>×</button>
                  </div>
                </div>
              )}

              {/* Guests list */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {host.guests.map((guest) => (
                  <div key={guest.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: "var(--bg-muted)", borderRadius: 6 }}>
                    <span style={{ fontSize: 13, flex: 1 }}>{guest.teamPlayer.player.name} <span className="meta">· {guest.teamPlayer.team.name}</span></span>
                    {guest.notifiedAt
                      ? <span title={t("accommodation_notified")} style={{ fontSize: 11, color: "var(--teal)" }}>✉✓</span>
                      : <span title={t("accommodation_not_notified")} style={{ fontSize: 11, color: "var(--text-muted)" }}>✉…</span>}
                    <button className="ghost" onClick={() => removeGuest(host.id, guest.id)} style={{ fontSize: 11, padding: "2px 6px", color: "var(--danger)" }}>×</button>
                  </div>
                ))}
              </div>

              {/* Add guest dropdown */}
              {unassigned.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <select
                    defaultValue=""
                    onChange={(e) => { if (e.target.value) { addGuest(host.id, e.target.value); e.target.value = ""; } }}
                    style={{ fontSize: 12, width: "100%" }}
                    disabled={isPending}
                  >
                    <option value="">{t("accommodation_assign_participant")}</option>
                    {unassigned.map((tp) => (
                      <option key={tp.id} value={tp.id}>
                        {tp.player.name} ({tp.team.name}){tp.needsAccommodation ? " ★" : ""}{tp.player.petAllergies ? ` 🐾${tp.player.petAllergies}` : ""}{tp.player.foodAllergies ? ` 🍽${tp.player.foodAllergies}` : ""}
                      </option>
                    ))}
                  </select>
                  <p style={{ fontSize: 10, color: "var(--text-muted)", margin: "4px 0 0" }}>{t("accommodation_needs_acco_legend")}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Unassigned participants needing accommodation */}
      {unassigned.filter((tp) => tp.needsAccommodation).length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h4 style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 8 }}>{t("accommodation_unassigned_title")}</h4>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {unassigned.filter((tp) => tp.needsAccommodation).map((tp) => (
              <span key={tp.id} style={{ fontSize: 12, padding: "3px 10px", background: "var(--warning-muted, #fff3cd)", border: "1px solid var(--warning, #ffc107)", borderRadius: 12, color: "#1a1a1a" }}>
                {tp.player.name} · {tp.team.name}
                {tp.player.petAllergies && <span title={`🐾 ${tp.player.petAllergies}`}> 🐾</span>}
                {tp.player.foodAllergies && <span title={`🍽 ${tp.player.foodAllergies}`}> 🍽</span>}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
