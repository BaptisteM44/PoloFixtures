"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AdminNav } from "@/components/AdminNav";
import { Pagination, paginate } from "@/components/Pagination";
import { BADGE_CATALOG } from "@/lib/badge-catalog";

const PER_PAGE = 20;

type Player = {
  id: string;
  name: string;
  country: string;
  city?: string | null;
  status: string;
  gender: string | null;
  createdAt: string;
  suspendedReason?: string | null;
  account?: { email: string } | null;
  badges?: string[];
};

type BadgeModal = { playerId: string; name: string; badges: string[] };

export default function AdminPlayersPage() {
  const t = useTranslations("admin");
  const [players, setPlayers] = useState<Player[]>([]);
  const [filter, setFilter] = useState<"PENDING" | "ACTIVE" | "REJECTED">("PENDING");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [suspendModal, setSuspendModal] = useState<{ playerId: string; name: string } | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [badgeModal, setBadgeModal] = useState<BadgeModal | null>(null);
  const [badgeToAdd, setBadgeToAdd] = useState("");
  const [badgeSaving, setBadgeSaving] = useState(false);

  const load = (q = search) => {
    const params = new URLSearchParams({ status: filter, hasAccount: "true" });
    if (q.trim()) params.set("search", q.trim());
    fetch(`/api/players?${params}`)
      .then((res) => res.json())
      .then((data) => setPlayers(data));
  };

  useEffect(() => {
    setPage(1);
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); load(search); }, 280);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const { items: paged, totalPages, page: safePage } = paginate(players, page, PER_PAGE);

  const moderate = async (id: string, status: "ACTIVE" | "REJECTED", reason?: string) => {
    await fetch(`/api/players/${id}/moderate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, suspendedReason: reason ?? null })
    });
    load();
  };

  const handleSuspendConfirm = async () => {
    if (!suspendModal) return;
    await moderate(suspendModal.playerId, "REJECTED", suspendReason.trim() || undefined);
    setSuspendModal(null);
    setSuspendReason("");
  };

  const handleBadgeRemove = async (badge: string) => {
    if (!badgeModal) return;
    setBadgeSaving(true);
    const res = await fetch(`/api/admin/players/${badgeModal.playerId}/badges`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ remove: [badge] }),
    });
    const data = await res.json();
    setBadgeModal((m) => m ? { ...m, badges: data.badges as string[] } : null);
    setPlayers((prev) => prev.map((p) => p.id === badgeModal.playerId ? { ...p, badges: data.badges } : p));
    setBadgeSaving(false);
  };

  const handleBadgeAdd = async () => {
    if (!badgeModal || !badgeToAdd) return;
    setBadgeSaving(true);
    const res = await fetch(`/api/admin/players/${badgeModal.playerId}/badges`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ add: [badgeToAdd] }),
    });
    const data = await res.json();
    setBadgeModal((m) => m ? { ...m, badges: data.badges as string[] } : null);
    setPlayers((prev) => prev.map((p) => p.id === badgeModal.playerId ? { ...p, badges: data.badges } : p));
    setBadgeToAdd("");
    setBadgeSaving(false);
  };

  return (
    <div className="page">
      <h1>{t("players_title")}</h1>
      <AdminNav />

      {/* Badge modal */}
      {badgeModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="panel" style={{ width: "min(520px, 94vw)", padding: 28, display: "grid", gap: 16 }}>
            <h3 style={{ margin: 0 }}>🏅 Badges — {badgeModal.name}</h3>

            {/* Badges actuels */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {badgeModal.badges.length === 0 && <p className="meta" style={{ margin: 0 }}>Aucun badge</p>}
              {badgeModal.badges.map((b) => {
                const info = BADGE_CATALOG[b];
                return (
                  <span key={b} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "var(--surface-2)", border: "1.5px solid var(--border)", borderRadius: 6, padding: "3px 8px", fontSize: 12 }}>
                    {info ? `${info.emoji} ${info.name}` : b}
                    <button
                      onClick={() => handleBadgeRemove(b)}
                      disabled={badgeSaving}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--pink)", fontWeight: 700, fontSize: 14, padding: "0 2px", lineHeight: 1 }}
                      title="Retirer"
                    >×</button>
                  </span>
                );
              })}
            </div>

            {/* Ajouter un badge */}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <select
                value={badgeToAdd}
                onChange={(e) => setBadgeToAdd(e.target.value)}
                style={{ flex: 1, fontSize: 13 }}
              >
                <option value="">— Choisir un badge —</option>
                {Object.values(BADGE_CATALOG)
                  .filter((b) => !badgeModal.badges.includes(b.id))
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((b) => (
                    <option key={b.id} value={b.id}>{b.emoji} {b.name} ({b.rarity})</option>
                  ))}
              </select>
              <button className="primary" onClick={handleBadgeAdd} disabled={!badgeToAdd || badgeSaving} style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                Ajouter
              </button>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="ghost" onClick={() => { setBadgeModal(null); setBadgeToAdd(""); }}>Fermer</button>
            </div>
          </div>
        </div>
      )}

      {/* Suspend modal */}
      {suspendModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="panel" style={{ width: "min(480px, 92vw)", padding: 28, display: "grid", gap: 16 }}>
            <h3 style={{ margin: 0 }}>{t("suspend_title", { name: suspendModal.name })}</h3>
            <label className="field-row">
              {t("suspend_reason_label")} <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: 11 }}>{t("suspend_reason_hint")}</span>
              <textarea
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder={t("suspend_reason_placeholder")}
                style={{ resize: "vertical", fontFamily: "inherit", fontSize: 13 }}
              />
            </label>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="ghost" onClick={() => { setSuspendModal(null); setSuspendReason(""); }}>{t("btn_cancel")}</button>
              <button className="primary" style={{ borderColor: "var(--pink)", background: "var(--pink)" }} onClick={handleSuspendConfirm}>
                {t("btn_confirm_suspend")}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
        {(["PENDING", "ACTIVE", "REJECTED"] as const).map((s) => (
          <button key={s} className={filter === s ? "primary" : "ghost"} onClick={() => setFilter(s)} style={{ fontSize: 12 }}>
            {s === "PENDING" ? t("filter_pending") : s === "ACTIVE" ? t("filter_active") : t("filter_rejected")}
          </button>
        ))}
        <span style={{ fontSize: 13, color: "var(--text-muted)", marginLeft: "auto" }}>
          {players.length === 1 ? t("players_count_one", { count: players.length }) : t("players_count_other", { count: players.length })}
        </span>
      </div>
      <div style={{ marginBottom: 16 }}>
        <input
          type="search"
          placeholder={t("search_players_placeholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: "100%", maxWidth: 340 }}
        />
      </div>

      <div className="panel">
        {paged.length === 0 && <p style={{ color: "var(--text-muted)" }}>{t("empty_players")}</p>}
        {paged.map((player) => (
          <div key={player.id} className="moderation-row">
            <div>
              <strong>{player.name}</strong>
              {player.gender && player.gender !== "PREFER_NOT_SAY" && (
                <span style={{ marginLeft: 6, background: "var(--surface-2)", border: "1.5px solid var(--border)", borderRadius: 4, padding: "1px 6px", fontSize: 10, fontWeight: 700 }}>
                  {player.gender === "MALE" ? t("gender_male") : player.gender === "FEMALE" ? t("gender_female") : t("gender_nb")}
                </span>
              )}
              <p className="meta">{player.city ? `${player.city}, ` : ""}{player.country}</p>
              {player.account?.email && <p className="meta" style={{ fontSize: 11 }}>{player.account.email}</p>}
              {filter === "REJECTED" && player.suspendedReason && (
                <p className="meta" style={{ fontSize: 11, color: "var(--pink)", marginTop: 2 }}>
                  {t("reason_prefix")}{player.suspendedReason}
                </p>
              )}
            </div>
            <div className="button-row">
              {filter === "PENDING" && (
                <>
                  <button className="primary" style={{ fontSize: 12 }} onClick={() => moderate(player.id, "ACTIVE")}>{t("btn_accept")}</button>
                  <button className="ghost" style={{ fontSize: 12 }} onClick={() => moderate(player.id, "REJECTED")}>{t("btn_reject")}</button>
                </>
              )}
              {filter === "ACTIVE" && (
                <>
                  <button className="ghost" style={{ fontSize: 12 }} onClick={() => setBadgeModal({ playerId: player.id, name: player.name, badges: player.badges ?? [] })}>
                    🏅
                  </button>
                  <button className="ghost" style={{ fontSize: 12, color: "var(--pink)", borderColor: "var(--pink)" }} onClick={() => setSuspendModal({ playerId: player.id, name: player.name })}>
                    {t("btn_suspend")}
                  </button>
                </>
              )}
              {filter === "REJECTED" && (
                <button className="primary" style={{ fontSize: 12 }} onClick={() => moderate(player.id, "ACTIVE")}>{t("btn_reactivate")}</button>
              )}
            </div>
          </div>
        ))}
      </div>

      <Pagination page={safePage} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
