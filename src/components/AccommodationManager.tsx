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
  teamPlayer: { id: string; player: PlayerInfo; team: TeamInfo };
};

type HostRow = {
  id: string;
  playerId: string | null;
  name: string;
  contact: string | null;
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
  const [newHostNotes, setNewHostNotes] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  // Edit host state
  const [editingHostId, setEditingHostId] = useState<string | null>(null);
  const [editHostData, setEditHostData] = useState({ name: "", contact: "", notes: "" });

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
          notes: newHostNotes.trim() || null,
        }),
      });
      if (res.ok) {
        const host = await res.json();
        setHosts((prev) => [...prev, host]);
        setNewHostName("");
        setNewHostContact("");
        setNewHostNotes("");
        setShowAddForm(false);
      } else {
        setError(t("accommodation_error_create"));
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
    setEditHostData({ name: host.name, contact: host.contact ?? "", notes: host.notes ?? "" });
  };

  const saveEditHost = (hostId: string) => {
    setHosts((prev) => prev.map((h) => h.id === hostId ? { ...h, name: editHostData.name, contact: editHostData.contact || null, notes: editHostData.notes || null } : h));
    setEditingHostId(null);
    startTransition(async () => {
      await fetch(`${api}/${hostId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editHostData.name, contact: editHostData.contact || null, notes: editHostData.notes || null }),
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
        <button className="primary" onClick={() => setShowAddForm((v) => !v)} style={{ fontSize: 13 }}>
          {t("accommodation_add_host")}
        </button>
      </div>

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
                  <input type="text" value={editHostData.notes} onChange={(e) => setEditHostData((d) => ({ ...d, notes: e.target.value }))} placeholder={t("accommodation_host_notes_placeholder")} style={{ fontSize: 13 }} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="primary" onClick={() => saveEditHost(host.id)} style={{ fontSize: 12 }}>{t("accommodation_save")}</button>
                    <button className="ghost" onClick={() => setEditingHostId(null)} style={{ fontSize: 12 }}>{t("accommodation_cancel")}</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <strong style={{ fontSize: 14 }}>{host.name}</strong>
                    {host.contact && <p className="meta" style={{ margin: "2px 0 0", fontSize: 12 }}>{host.contact}</p>}
                    {host.notes && <p className="meta" style={{ margin: "2px 0 0", fontSize: 11, fontStyle: "italic" }}>🔒 {host.notes}</p>}
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
              <span key={tp.id} style={{ fontSize: 12, padding: "3px 10px", background: "var(--warning-muted, #fff3cd)", border: "1px solid var(--warning, #ffc107)", borderRadius: 12 }}>
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
