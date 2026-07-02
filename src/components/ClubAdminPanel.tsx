"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { addClubAdminAction, removeClubAdminAction, transferManagerAction } from "@/app/[locale]/club/[id]/actions";

type Admin = {
  id: string;
  playerId: string;
  player: { id: string; name: string };
};

type Member = {
  playerId: string;
  player: { id: string; name: string };
};

export function ClubAdminPanel({
  clubId,
  managerId,
  admins: initialAdmins,
  members,
  isManager,
}: {
  clubId: string;
  managerId: string;
  admins: Admin[];
  members: Member[];
  isManager: boolean;
}) {
  const t = useTranslations("club");
  const [admins, setAdmins] = useState(initialAdmins);
  const [isPending, startTransition] = useTransition();
  const [addPlayerId, setAddPlayerId] = useState("");
  const [transferPlayerId, setTransferPlayerId] = useState("");

  const adminIds = new Set([managerId, ...admins.map((a) => a.playerId)]);
  const eligibleMembers = members.filter((m) => !adminIds.has(m.playerId));

  function handleAdd() {
    if (!addPlayerId) return;
    startTransition(async () => {
      const res = await addClubAdminAction(clubId, addPlayerId);
      if ("ok" in res) {
        const member = members.find((m) => m.playerId === addPlayerId);
        if (member) {
          setAdmins((prev) => [...prev, { id: "", playerId: addPlayerId, player: member.player }]);
        }
        setAddPlayerId("");
      }
    });
  }

  function handleRemove(playerId: string) {
    if (!confirm(t("admin_panel_confirm_remove"))) return;
    startTransition(async () => {
      await removeClubAdminAction(clubId, playerId);
      setAdmins((prev) => prev.filter((a) => a.playerId !== playerId));
    });
  }

  function handleTransfer() {
    if (!transferPlayerId) return;
    const name = members.find((m) => m.playerId === transferPlayerId)?.player.name ?? "ce joueur";
    if (!confirm(`Transférer la gestion du club à ${name} ? Cette action est irréversible.`)) return;
    startTransition(async () => {
      const res = await transferManagerAction(clubId, transferPlayerId);
      if ("ok" in res) window.location.reload();
      else alert(res.error);
    });
  }

  return (
    <div className="club-admin-panel">
      <h3 style={{ marginBottom: 16 }}>{t("admin_panel_title")}</h3>

      <div className="club-admin-panel__list">
        {/* Manager is always admin */}
        {members.filter((m) => m.playerId === managerId).map((m) => (
          <div key={m.playerId} className="club-admin-panel__row">
            <span>{m.player.name}</span>
            <span className="club-admin-panel__badge club-admin-panel__badge--manager">{t("admin_panel_manager")}</span>
          </div>
        ))}

        {admins.map((a) => (
          <div key={a.playerId} className="club-admin-panel__row">
            <span>{a.player.name}</span>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span className="club-admin-panel__badge">{t("admin_panel_admin")}</span>
              {isManager && (
                <button
                  className="ghost"
                  style={{ fontSize: 11, padding: "2px 6px" }}
                  onClick={() => handleRemove(a.playerId)}
                  disabled={isPending}
                >✕</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {isManager && eligibleMembers.length > 0 && (
        <div className="club-admin-panel__add" style={{ marginTop: 16 }}>
          <select
            className="form-select"
            value={addPlayerId}
            onChange={(e) => setAddPlayerId(e.target.value)}
            style={{ flex: 1, fontSize: 13 }}
          >
            <option value="">{t("admin_panel_add_placeholder")}</option>
            {eligibleMembers.map((m) => (
              <option key={m.playerId} value={m.playerId}>{m.player.name}</option>
            ))}
          </select>
          <button className="primary" onClick={handleAdd} disabled={isPending || !addPlayerId} style={{ fontSize: 13 }}>
            {t("admin_panel_add_btn")}
          </button>
        </div>
      )}

      {isManager && members.filter((m) => m.playerId !== managerId).length > 0 && (
        <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
            Transférer la gestion du club
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <select
              className="form-select"
              value={transferPlayerId}
              onChange={(e) => setTransferPlayerId(e.target.value)}
              style={{ flex: 1, fontSize: 13 }}
            >
              <option value="">Choisir un membre…</option>
              {members.filter((m) => m.playerId !== managerId).map((m) => (
                <option key={m.playerId} value={m.playerId}>{m.player.name}</option>
              ))}
            </select>
            <button
              className="danger"
              onClick={handleTransfer}
              disabled={isPending || !transferPlayerId}
              style={{ fontSize: 13 }}
            >
              Transférer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
