"use client";

import { useEffect, useState } from "react";
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
      <h1>Gestion des joueurs</h1>
      <AdminNav />

      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
        {(["PENDING", "ACTIVE", "REJECTED"] as const).map((s) => (
          <button key={s} className={filter === s ? "primary" : "ghost"} onClick={() => setFilter(s)} style={{ fontSize: 12 }}>
            {s === "PENDING" ? "En attente" : s === "ACTIVE" ? "Actifs" : "Rejetés"} 
          </button>
        ))}
        <span style={{ fontSize: 13, color: "var(--text-muted)", marginLeft: "auto" }}>
          {players.length} joueur{players.length > 1 ? "s" : ""}
        </span>
      </div>

      <div className="panel">
        {paged.length === 0 && <p style={{ color: "var(--text-muted)" }}>Aucun joueur dans cette catégorie.</p>}
        {paged.map((player) => (
          <div key={player.id} className="moderation-row">
            <div>
              <strong>{player.name}</strong>
              {player.gender && player.gender !== "PREFER_NOT_SAY" && (
                <span style={{ marginLeft: 6, background: "var(--surface-2)", border: "1.5px solid var(--border)", borderRadius: 4, padding: "1px 6px", fontSize: 10, fontWeight: 700 }}>
                  {player.gender === "MALE" ? "Homme" : player.gender === "FEMALE" ? "Femme" : "Non-binaire"}
                </span>
              )}
              <p className="meta">{player.city ? `${player.city}, ` : ""}{player.country}</p>
            </div>
            <div className="button-row">
              {filter === "PENDING" && (
                <>
                  <button className="primary" style={{ fontSize: 12 }} onClick={() => moderate(player.id, "ACTIVE")}>Accepter</button>
                  <button className="ghost" style={{ fontSize: 12 }} onClick={() => moderate(player.id, "REJECTED")}>Rejeter</button>
                </>
              )}
              {filter === "REJECTED" && (
                <button className="primary" style={{ fontSize: 12 }} onClick={() => moderate(player.id, "ACTIVE")}>Réactiver</button>
              )}
            </div>
          </div>
        ))}
      </div>

      <Pagination page={safePage} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
