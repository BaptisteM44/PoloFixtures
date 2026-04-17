"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

type EquipmentItem = {
  id: string;
  name: string;
  category: string;
  notes: string | null;
  borrowedBy: string | null;
  borrowerName?: string | null;
};

type Member = {
  playerId: string;
  player: { id: string; name: string };
};

const CATEGORIES = ["bike", "mallet", "other"] as const;

export function ClubEquipment({
  clubId,
  equipment: initialEquipment,
  members,
  isAdmin,
  currentPlayerId,
}: {
  clubId: string;
  equipment: EquipmentItem[];
  members: Member[];
  isAdmin: boolean;
  currentPlayerId: string | null;
}) {
  const t = useTranslations("club");
  const [equipment, setEquipment] = useState(initialEquipment);
  const [showAdd, setShowAdd] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("bike");
  const [notes, setNotes] = useState("");

  function handleAdd() {
    if (!name.trim()) return;
    startTransition(async () => {
      const res = await fetch(`/api/clubs/${clubId}/equipment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), category, notes: notes.trim() || null }),
      });
      if (res.ok) {
        const item = await res.json();
        setEquipment((prev) => [...prev, item]);
        setName(""); setCategory("bike"); setNotes(""); setShowAdd(false);
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await fetch(`/api/clubs/${clubId}/equipment/${id}`, { method: "DELETE" });
      setEquipment((prev) => prev.filter((e) => e.id !== id));
    });
  }

  function handleBorrow(id: string, playerId: string | null) {
    startTransition(async () => {
      const res = await fetch(`/api/clubs/${clubId}/equipment/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ borrowedBy: playerId }),
      });
      if (res.ok) {
        const updated = await res.json();
        setEquipment((prev) => prev.map((e) => e.id === id ? updated : e));
      }
    });
  }

  const grouped = CATEGORIES.map((cat) => ({
    cat,
    items: equipment.filter((e) => e.category === cat),
  })).filter((g) => g.items.length > 0 || (isAdmin && showAdd && category === g.cat));

  const categoryLabel = (cat: string) =>
    cat === "bike" ? `🚲 ${t("equip_cat_bike")}` :
    cat === "mallet" ? `🏑 ${t("equip_cat_mallet")}` :
    `📦 ${t("equip_cat_other")}`;

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>{t("equip_title")}</h3>
        {isAdmin && !showAdd && (
          <button className="ghost" style={{ fontSize: 13 }} onClick={() => setShowAdd(true)}>
            + {t("equip_add_btn")}
          </button>
        )}
      </div>

      {isAdmin && showAdd && (
        <div className="panel" style={{ marginBottom: 20, padding: "16px 18px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input className="form-input" placeholder={t("equip_name_placeholder")} value={name} onChange={(e) => setName(e.target.value)} />
            <select className="form-select" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
            </select>
            <textarea className="form-input" placeholder={t("equip_notes_placeholder")} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            <div style={{ display: "flex", gap: 8 }}>
              <button className="primary" style={{ fontSize: 13 }} onClick={handleAdd} disabled={isPending || !name.trim()}>
                {t("equip_btn_add")}
              </button>
              <button className="ghost" style={{ fontSize: 13 }} onClick={() => setShowAdd(false)}>{t("equip_btn_cancel")}</button>
            </div>
          </div>
        </div>
      )}

      {equipment.length === 0 && !showAdd && (
        <div className="empty-state"><p>{t("equip_empty")}</p></div>
      )}

      {CATEGORIES.map((cat) => {
        const items = equipment.filter((e) => e.category === cat);
        if (items.length === 0) return null;
        return (
          <div key={cat} style={{ marginBottom: 24 }}>
            <h4 style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 10 }}>
              {categoryLabel(cat)}
            </h4>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
              {items.map((item) => (
                <div key={item.id} className="club-venue-card" style={{ borderLeft: item.borrowedBy ? "3px solid var(--orange)" : "3px solid var(--teal)" }}>
                  <div className="club-venue-card__top">
                    <span className="club-venue-card__name">{item.name}</span>
                    {isAdmin && (
                      <button className="ghost" style={{ fontSize: 11, padding: "2px 6px", color: "var(--text-muted)" }} onClick={() => handleDelete(item.id)} disabled={isPending}>✕</button>
                    )}
                  </div>
                  {item.notes && <p className="club-venue-card__address">{item.notes}</p>}
                  <div style={{ marginTop: 8 }}>
                    {item.borrowedBy ? (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ fontSize: 11, color: "var(--orange)", fontWeight: 600 }}>
                          📤 {t("equip_borrowed_by")} {item.borrowerName ?? item.borrowedBy}
                        </span>
                        {(isAdmin || item.borrowedBy === currentPlayerId) && (
                          <button className="ghost" style={{ fontSize: 11, padding: "2px 8px" }} onClick={() => handleBorrow(item.id, null)} disabled={isPending}>
                            {t("equip_return")}
                          </button>
                        )}
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 11, color: "var(--teal)", fontWeight: 600 }}>✅ {t("equip_available")}</span>
                        {currentPlayerId && (
                          <select
                            className="form-select"
                            style={{ fontSize: 11, padding: "2px 6px" }}
                            defaultValue=""
                            onChange={(e) => { if (e.target.value) handleBorrow(item.id, e.target.value); }}
                            disabled={isPending}
                          >
                            <option value="">{t("equip_borrow_btn")}</option>
                            {members.map((m) => (
                              <option key={m.playerId} value={m.playerId}>{m.player.name}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
