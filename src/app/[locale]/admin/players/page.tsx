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
};

export default function AdminPlayersPage() {
  const t = useTranslations("admin");
  const [players, setPlayers] = useState<Player[]>([]);
  const [filter, setFilter] = useState<"PENDING" | "ACTIVE" | "REJECTED">("PENDING");
  const [page, setPage] = useState(1);

  const load = () => {
    fetch(`/api/players?status=${filter}`)
      .then((res) => res.json())
      .then((data) => setPlayers(data));
  };

  useEffect(() => {
    setPage(1);
    load();
  }, [filter]);

  const { items: paged, totalPages, page: safePage } = paginate(players, page, PER_PAGE);

  const moderate = async (id: string, status: "ACTIVE" | "REJECTED") => {
    await fetch(`/api/players/${id}/moderate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    load();
  };

  return (
    <div className="page">
        <h1>{t("players_title")}</h1>
        <AdminNav />

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
              </div>
              <div className="button-row">
                {filter === "PENDING" && (
                  <>
                    <button className="primary" style={{ fontSize: 12 }} onClick={() => moderate(player.id, "ACTIVE")}>{t("btn_accept")}</button>
                    <button className="ghost" style={{ fontSize: 12 }} onClick={() => moderate(player.id, "REJECTED")}>{t("btn_reject")}</button>
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
