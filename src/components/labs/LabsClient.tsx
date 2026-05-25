"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { CommunityItem, CommunityItemDetail, VoteType } from "@/types/community";
import { LabsItemModal } from "./LabsItemModal";
import { LabsNewItemModal } from "./LabsNewItemModal";

// ── Types de tabs ─────────────────────────────────────────────────────────────
type Tab = "trending" | "idea" | "bug" | "translation" | "done";
type Sort = "hot" | "new" | "top";

const TABS: { id: Tab; label: string; emoji: string; showSort?: boolean }[] = [
  { id: "trending",    label: "tab_trending",    emoji: "🔥", showSort: true },
  { id: "idea",        label: "tab_idea",        emoji: "💡", showSort: true },
  { id: "bug",         label: "tab_bug",         emoji: "🐛", showSort: true },
  { id: "translation", label: "tab_translation", emoji: "🌍", showSort: true },
  { id: "done",        label: "tab_done",        emoji: "✅", showSort: false },
];

const TYPE_LABEL: Record<string, string> = {
  idea: "type_idea",
  bug: "type_bug",
  translation: "type_translation",
};

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  open:        { label: "status_open",        color: "#1a1a1a", bg: "var(--teal)" },
  thinking:    { label: "status_thinking",    color: "#1a1a1a", bg: "var(--yellow)" },
  in_progress: { label: "status_in_progress", color: "#fff",    bg: "#e67e22" },
  done:        { label: "status_done",        color: "#1a1a1a", bg: "#a8e6a3" },
  rejected:    { label: "status_rejected",    color: "#fff",    bg: "#888" },
};

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  playerId: string | null;
  isAdmin: boolean;
  charterAccepted: boolean;
}

export function LabsClient({ playerId, isAdmin, charterAccepted }: Props) {
  const t = useTranslations("labs");
  const [activeTab, setActiveTab] = useState<Tab>("trending");
  const [sort, setSort] = useState<Sort>("hot");
  const [items, setItems] = useState<CommunityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<CommunityItemDetail | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [votingId, setVotingId] = useState<string | null>(null);

  const currentTab = TABS.find((t) => t.id === activeTab)!;

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const typeParam = activeTab === "trending" ? "all" : activeTab;
      const res = await fetch(`/api/community/items?type=${typeParam}&sort=${sort}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data);
      }
    } finally {
      setLoading(false);
    }
  }, [activeTab, sort]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const openItem = async (id: string) => {
    const res = await fetch(`/api/community/items/${id}`);
    if (res.ok) {
      const data = await res.json();
      setSelectedItem(data);
    }
  };

  const handleVote = async (itemId: string, vote: VoteType, comment?: string) => {
    if (votingId) return;
    setVotingId(itemId);
    try {
      await fetch(`/api/community/items/${itemId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vote, comment }),
      });
      await fetchItems();
      if (selectedItem?.id === itemId) {
        const res = await fetch(`/api/community/items/${itemId}`);
        if (res.ok) setSelectedItem(await res.json());
      }
    } finally {
      setVotingId(null);
    }
  };

  const handleUnvote = async (itemId: string) => {
    if (votingId) return;
    setVotingId(itemId);
    try {
      await fetch(`/api/community/items/${itemId}/vote`, { method: "DELETE" });
      await fetchItems();
      if (selectedItem?.id === itemId) {
        const res = await fetch(`/api/community/items/${itemId}`);
        if (res.ok) setSelectedItem(await res.json());
      }
    } finally {
      setVotingId(null);
    }
  };

  const handleAdminStatus = async (itemId: string, status: string) => {
    await fetch(`/api/community/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await fetchItems();
    if (selectedItem?.id === itemId) {
      const res = await fetch(`/api/community/items/${itemId}`);
      if (res.ok) setSelectedItem(await res.json());
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm(t("delete_item_confirm" as any))) return;
    await fetch(`/api/community/items/${itemId}`, { method: "DELETE" });
    if (selectedItem?.id === itemId) setSelectedItem(null);
    await fetchItems();
  };

  return (
    <>
      {/* ── Header page ─────────────────────────────────────────────────── */}
      <div style={{ background: "var(--bg)", minHeight: "100vh" }}>
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 16px 60px" }}>

          {/* Title */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 28 }}>
            <div>
              <h1 style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(28px, 5vw, 48px)",
                fontWeight: 900,
                letterSpacing: "-0.02em",
                lineHeight: 1,
                marginBottom: 6,
              }}>
                🧪 Community Lab
              </h1>
              <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
                {t("page_subtitle")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNewModal(true)}
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: 15,
                padding: "10px 20px",
                background: "var(--teal)",
                border: "2px solid var(--border)",
                borderRadius: 6,
                cursor: "pointer",
                boxShadow: "3px 3px 0 var(--border)",
                whiteSpace: "nowrap",
              }}
            >
              {t("new_idea_btn")}
            </button>
          </div>

          {/* ── Tabs ───────────────────────────────────────────────────── */}
          <div style={{
            display: "flex",
            gap: 4,
            marginBottom: 20,
            flexWrap: "wrap",
          }}>
            {TABS.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => { setActiveTab(tab.id); if (tab.id === "done") setSort("hot"); }}
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 700,
                    fontSize: 13,
                    padding: "8px 14px",
                    border: "2px solid var(--border)",
                    borderRadius: 6,
                    cursor: "pointer",
                    background: active ? "var(--border)" : "var(--surface)",
                    color: active ? "var(--bg)" : "var(--text)",
                    boxShadow: active ? "none" : "2px 2px 0 var(--border)",
                    transform: active ? "translate(2px, 2px)" : "none",
                    transition: "all 0.1s",
                  }}
                >
                  {tab.emoji} {t(tab.label as any)}
                </button>
              );
            })}
          </div>

          {/* ── Sort bar ────────────────────────────────────────────────── */}
          {currentTab.showSort && (
            <div style={{ display: "flex", gap: 8, marginBottom: 20, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>{t("sort_label")}</span>
              {(["hot", "new", "top"] as Sort[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSort(s)}
                  style={{
                    fontSize: 12,
                    padding: "4px 10px",
                    border: "1.5px solid var(--border)",
                    borderRadius: 20,
                    cursor: "pointer",
                    background: sort === s ? "var(--border)" : "transparent",
                    color: sort === s ? "var(--bg)" : "var(--text-muted)",
                    fontWeight: 600,
                    transition: "all 0.1s",
                  }}
                >
                  {s === "hot" ? t("sort_hot") : s === "new" ? t("sort_new") : t("sort_top")}
                </button>
              ))}
            </div>
          )}

          {/* ── Items list ──────────────────────────────────────────────── */}
          {loading ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>
              {t("loading")}
            </div>
          ) : items.length === 0 ? (
            <div style={{
              textAlign: "center", padding: "60px 24px",
              border: "2px dashed var(--border-light)", borderRadius: 8,
            }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
              <p style={{ color: "var(--text-muted)", fontWeight: 600 }}>{t("empty_title")}</p>
              <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>{t("empty_cta")}</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {items.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  playerId={playerId}
                  isAdmin={isAdmin}
                  voting={votingId === item.id}
                  onVote={handleVote}
                  onUnvote={handleUnvote}
                  onOpen={() => openItem(item.id)}
                  onAdminStatus={handleAdminStatus}
                  onDelete={handleDeleteItem}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      {selectedItem && (
        <LabsItemModal
          item={selectedItem}
          playerId={playerId}
          isAdmin={isAdmin}
          charterAccepted={charterAccepted}
          onClose={() => setSelectedItem(null)}
          onVote={handleVote}
          onUnvote={handleUnvote}
          onRefresh={async () => {
            const res = await fetch(`/api/community/items/${selectedItem.id}`);
            if (res.ok) setSelectedItem(await res.json());
            fetchItems();
          }}
          onAdminStatus={handleAdminStatus}
        />
      )}

      {showNewModal && (
        <LabsNewItemModal
          playerId={playerId}
          charterAccepted={charterAccepted}
          onClose={() => setShowNewModal(false)}
          onCreated={() => { setShowNewModal(false); fetchItems(); }}
        />
      )}
    </>
  );
}

// ── ItemCard ──────────────────────────────────────────────────────────────────
interface CardProps {
  item: CommunityItem;
  playerId: string | null;
  isAdmin: boolean;
  voting: boolean;
  onVote: (id: string, vote: VoteType, comment?: string) => void;
  onUnvote: (id: string) => void;
  onOpen: () => void;
  onAdminStatus: (id: string, status: string) => void;
  onDelete: (id: string) => void;
}

function ItemCard({ item, playerId, isAdmin, voting, onVote, onUnvote, onOpen, onAdminStatus, onDelete }: CardProps) {
  const t = useTranslations("labs");
  const status = STATUS_META[item.status] ?? STATUS_META.open;
  const [showMehInput, setShowMehInput] = useState(false);
  const [mehComment, setMehComment] = useState("");
  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 60) return t("time_min", { n: m });
    const h = Math.floor(m / 60);
    if (h < 24) return t("time_hour", { n: h });
    const d = Math.floor(h / 24);
    if (d < 30) return t("time_day", { n: d });
    return t("time_month", { n: Math.floor(d / 30) });
  };

  const handleVoteClick = (vote: VoteType) => {
    if (item.myVote === vote) { onUnvote(item.id); return; }
    if (vote === "meh") { setShowMehInput(true); return; }
    onVote(item.id, vote);
  };

  const submitMeh = () => {
    if (!mehComment.trim()) return;
    onVote(item.id, "meh", mehComment.trim());
    setShowMehInput(false);
    setMehComment("");
  };

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "2px solid var(--border)",
        borderRadius: 8,
        padding: "16px 18px",
        boxShadow: "3px 3px 0 var(--border)",
        position: "relative",
        opacity: voting ? 0.7 : 1,
        transition: "opacity 0.15s",
      }}
    >
      {item.pinned && (
        <div style={{ position: "absolute", top: 10, right: 10, fontSize: 16 }} title={t("pinned")}>📌</div>
      )}

      {/* Header: type + status */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: "2px 7px",
          border: "1.5px solid var(--border)", borderRadius: 4,
          background: "var(--surface-2)", letterSpacing: "0.04em",
        }}>
          {t((TYPE_LABEL[item.type] ?? item.type) as any)}
        </span>
        {isAdmin ? (
          <select
            value={item.status}
            onChange={(e) => onAdminStatus(item.id, e.target.value)}
            style={{
              fontSize: 11, fontWeight: 700, padding: "2px 6px",
              border: "1.5px solid var(--border)", borderRadius: 4,
              background: status.bg, color: status.color, cursor: "pointer",
            }}
          >
            {Object.entries(STATUS_META).map(([k, v]) => (
              <option key={k} value={k}>{t(v.label as any)}</option>
            ))}
          </select>
        ) : (
          <span style={{
            fontSize: 11, fontWeight: 700, padding: "2px 7px",
            border: "1.5px solid var(--border)", borderRadius: 4,
            background: status.bg, color: status.color,
          }}>
            {t(status.label as any)}
          </span>
        )}
        <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: "auto" }}>
          {item.authorName} · {timeAgo(item.createdAt)}
        </span>
      </div>

      {/* Title */}
      <button
        type="button"
        onClick={onOpen}
        style={{
          display: "block", textAlign: "left", background: "none", border: "none",
          cursor: "pointer", padding: 0, width: "100%",
        }}
      >
        <h3 style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: "clamp(14px, 2.5vw, 17px)",
          lineHeight: 1.3,
          marginBottom: 6,
          color: "var(--text)",
        }}>
          {item.title}
        </h3>
        <p style={{
          fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5,
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
          overflow: "hidden", marginBottom: 12,
        }}>
          {item.body}
        </p>
      </button>

      {/* Meh comment input */}
      {showMehInput && (
        <div style={{ marginBottom: 10, display: "flex", gap: 8 }}>
          <input
            autoFocus
            value={mehComment}
            onChange={(e) => setMehComment(e.target.value)}
            placeholder={t("meh_card_placeholder")}
            style={{
              flex: 1, padding: "6px 10px", fontSize: 13,
              border: "2px solid var(--yellow)", borderRadius: 6,
              background: "var(--surface)", color: "var(--text)",
            }}
            onKeyDown={(e) => { if (e.key === "Enter") submitMeh(); if (e.key === "Escape") setShowMehInput(false); }}
          />
          <button
            type="button"
            onClick={submitMeh}
            disabled={!mehComment.trim()}
            className="primary"
            style={{ padding: "6px 12px", fontSize: 12, whiteSpace: "nowrap" }}
          >
            {t("send")}
          </button>
          <button
            type="button"
            onClick={() => setShowMehInput(false)}
            className="ghost"
            style={{ padding: "6px 10px", fontSize: 12 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Footer: votes + reply count + open */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <VoteButton
          vote="up"
          count={item.up}
          active={item.myVote === "up"}
          disabled={!playerId || voting}
          onClick={() => handleVoteClick("up")}
        />
        <VoteButton
          vote="meh"
          count={item.meh}
          active={item.myVote === "meh"}
          disabled={!playerId || voting}
          onClick={() => handleVoteClick("meh")}
        />
        <VoteButton
          vote="down"
          count={item.down}
          active={item.myVote === "down"}
          disabled={!playerId || voting}
          onClick={() => handleVoteClick("down")}
        />
        <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 4 }}>
          🗣️ {item.replyCount}
        </span>
      </div>

      {/* Meh comment display */}
      {item.myVote === "meh" && item.myVoteComment && (
        <p style={{ marginTop: 8, fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
          {t("meh_comment_label", { comment: item.myVoteComment })}
        </p>
      )}

      {/* Actions row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
        {(isAdmin || (playerId && item.authorId === playerId)) && (
          <button
            type="button"
            onClick={() => onDelete(item.id)}
            title={t("delete" as any)}
            style={{
              fontSize: 11, fontWeight: 700,
              padding: "3px 8px",
              border: "1.5px solid #e74c3c", borderRadius: 4,
              background: "transparent", cursor: "pointer", color: "#e74c3c",
            }}
          >
            {t("delete" as any)}
          </button>
        )}
        <button
          type="button"
          onClick={onOpen}
          style={{
            marginLeft: (isAdmin || (playerId && item.authorId === playerId)) ? 0 : "auto",
            fontSize: 12, fontWeight: 700,
            padding: "4px 12px",
            border: "1.5px solid var(--border)",
            borderRadius: 4,
            background: "transparent",
            cursor: "pointer",
            color: "var(--text-muted)",
          }}
        >
          {t("view")}
        </button>
      </div>
    </div>
  );
}

// ── VoteButton ─────────────────────────────────────────────────────────────────
const VOTE_META: Record<VoteType, { emoji: string; label: string; activeColor: string; activeBg: string }> = {
  up:   { emoji: "👍", label: "vote_up",   activeColor: "#1a1a1a", activeBg: "var(--teal)" },
  meh:  { emoji: "🔄", label: "vote_meh",  activeColor: "#1a1a1a", activeBg: "var(--yellow)" },
  down: { emoji: "👎", label: "vote_down", activeColor: "#fff",    activeBg: "#888" },
};

function VoteButton({
  vote, count, active, disabled, onClick,
}: {
  vote: VoteType; count: number; active: boolean; disabled: boolean; onClick: () => void;
}) {
  const t = useTranslations("labs");
  const meta = VOTE_META[vote];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? t("vote_login_tooltip") : t(meta.label as any)}
      style={{
        display: "flex", alignItems: "center", gap: 4,
        fontSize: 12, fontWeight: 700,
        padding: "4px 10px",
        border: "1.5px solid var(--border)",
        borderRadius: 20,
        cursor: disabled ? "default" : "pointer",
        background: active ? meta.activeBg : "transparent",
        color: active ? meta.activeColor : "var(--text-muted)",
        opacity: disabled && !active ? 0.6 : 1,
        transition: "all 0.1s",
      }}
    >
      {meta.emoji} {count}
    </button>
  );
}
