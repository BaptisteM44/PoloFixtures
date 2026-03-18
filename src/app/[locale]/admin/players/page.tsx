"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AdminNav } from "@/components/AdminNav";
import { Pagination, paginate } from "@/components/Pagination";

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
};

export default function AdminPlayersPage() {
  const t = useTranslations("admin");
  const [players, setPlayers] = useState<Player[]>([]);
  const [filter, setFilter] = useState<"PENDING" | "ACTIVE" | "REJECTED">("PENDING");
  const [page, setPage] = useState(1);
  const [suspendModal, setSuspendModal] = useState<{ playerId: string; name: string } | null>(null);
  const [suspendReason, setSuspendReason] = useState("");

  const load = () => {
    fetch(`/api/players?status=${filter}`)
      .then((res) => res.json())
      .then((data) => setPlayers(data));
  };

  useEffect(() => {
    setPage(1);
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

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

  return (
    <div className="page">
      <h1>{t("players_title")}</h1>
      <AdminNav />

      {/* Suspend modal */}
      {suspendModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="panel" style={{ width: "min(480px, 92vw)", padding: 28, display: "grid", gap: 16 }}>
            <h3 style={{ margin: 0 }}>Suspendre {suspendModal.name}</h3>
            <label className="field-row">
              Raison de la suspension <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: 11 }}>(visible par l&apos;admin, optionnel)</span>
              <textarea
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Ex: comportement inapproprié lors du tournoi Paris Open 2025…"
                style={{ resize: "vertical", fontFamily: "inherit", fontSize: 13 }}
              />
            </label>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="ghost" onClick={() => { setSuspendModal(null); setSuspendReason(""); }}>Annuler</button>
              <button className="primary" style={{ borderColor: "var(--pink)", background: "var(--pink)" }} onClick={handleSuspendConfirm}>
                Confirmer la suspension
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
        {(["PENDING", "ACTIVE", "REJECTED"] as const).map((s) => (
          <button key={s} className={filter === s ? "primary" : "ghost"} onClick={() => setFilter(s)} style={{ fontSize: 12 }}>
            {s === "PENDING" ? t("filter_pending") : s === "ACTIVE" ? t("filter_active") : t("filter_rejected")}
          </button>
        ))}
        <span style={{ fontSize: 13, color: "var(--text-muted)", marginLeft: "auto" }}>
          {players.length === 1 ? t("players_count_one", { count: players.length }) : t("players_count_other", { count: players.length })}
        </span>
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
                  Raison : {player.suspendedReason}
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
                <button className="ghost" style={{ fontSize: 12, color: "var(--pink)", borderColor: "var(--pink)" }} onClick={() => setSuspendModal({ playerId: player.id, name: player.name })}>
                  {t("btn_suspend")}
                </button>
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
