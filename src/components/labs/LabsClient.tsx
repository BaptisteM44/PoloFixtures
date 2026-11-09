"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { CommunityItem, CommunityItemDetail, VoteType } from "@/types/community";
import { LabsItemModal } from "./LabsItemModal";
import { LabsNewItemModal } from "./LabsNewItemModal";
import { ShareIcon, shareItemUrl } from "./ShareIcon";

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

  // Lien partagé (?id=xxx) : ouvre directement la proposition au chargement.
  const searchParams = useSearchParams();
  useEffect(() => {
    const sharedId = searchParams.get("id");
    if (sharedId) openItem(sharedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    fetchStats();
    if (selectedItem?.id === itemId) {
      const res = await fetch(`/api/community/items/${itemId}`);
      if (res.ok) setSelectedItem(await res.json());
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm(t("delete_item_confirm"))) return;
    await fetch(`/api/community/items/${itemId}`, { method: "DELETE" });
    if (selectedItem?.id === itemId) setSelectedItem(null);
    await fetchItems();
    fetchStats();
  };

  // Chiffres du haut : fait / en cours / en attente (toutes catégories)
  const [stats, setStats] = useState<{ done: number; inProgress: number; pending: number } | null>(null);
  const fetchStats = useCallback(async () => {
    const res = await fetch("/api/community/stats");
    if (res.ok) setStats(await res.json());
  }, []);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  // « Pas retenu » depuis plus de 3 mois : rangé dans un tiroir grisé en bas,
  // pas perdu mais plus dans le fil. Date du refus ≈ dernière modification.
  const ARCHIVE_AFTER_MS = 90 * 86_400_000;
  const isArchived = (item: CommunityItem) =>
    item.status === "rejected" && Date.now() - new Date(item.updatedAt).getTime() > ARCHIVE_AFTER_MS;
  // « Pas retenu » récents : en bas du fil (l'API les trie déjà ainsi ; ordre conservé sinon)
  const visibleItems = [
    ...items.filter((item) => item.status !== "rejected"),
    ...items.filter((item) => item.status === "rejected" && !isArchived(item)),
  ];
  const archivedItems = items.filter(isArchived);

  const renderCard = (item: CommunityItem) => (
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
  );

  const selectTab = (id: Tab) => { setActiveTab(id); if (id === "done") setSort("hot"); };

  return (
    <>
      <div className="labs">
        <header className="labs__head">
          <div>
            <h1 className="labs__title">🧪 Community Lab</h1>
            <p className="labs__subtitle">{t("page_subtitle")}</p>
          </div>
          <button type="button" className="primary" onClick={() => setShowNewModal(true)}>
            {t("new_idea_btn")}
          </button>
        </header>

        {/* ── Avancement : fait / en cours / en attente ── */}
        <div className="labs-stats">
          <button type="button" className="labs-stat labs-stat--done" onClick={() => selectTab("done")} title={t("tab_done")}>
            <span className="labs-stat__num">{stats?.done ?? "–"}</span>
            <span className="labs-stat__label">✅ {t("stat_done")}</span>
          </button>
          <div className="labs-stat labs-stat--progress">
            <span className="labs-stat__num">{stats?.inProgress ?? "–"}</span>
            <span className="labs-stat__label">🛠️ {t("stat_in_progress")}</span>
          </div>
          <div className="labs-stat labs-stat--pending">
            <span className="labs-stat__num">{stats?.pending ?? "–"}</span>
            <span className="labs-stat__label">⏳ {t("stat_pending")}</span>
          </div>
        </div>

        {/* ── Onglets + tri ── */}
        <div className="labs-bar">
          <div className="labs-tabs" role="tablist">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                className={`labs-tab${activeTab === tab.id ? " is-active" : ""}`}
                onClick={() => selectTab(tab.id)}
              >
                {tab.emoji} {t(tab.label as never)}
              </button>
            ))}
          </div>
          {currentTab.showSort && (
            <div className="labs-sort">
              <span className="labs-sort__label">{t("sort_label")}</span>
              {(["hot", "new", "top"] as Sort[]).map((s) => (
                <button key={s} type="button" className={`labs-chip${sort === s ? " is-active" : ""}`} onClick={() => setSort(s)}>
                  {s === "hot" ? t("sort_hot") : s === "new" ? t("sort_new") : t("sort_top")}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Propositions : 2 par ligne ── */}
        {loading ? (
          <p className="labs-empty">{t("loading")}</p>
        ) : items.length === 0 ? (
          <div className="labs-empty labs-empty--box">
            <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
            <p style={{ fontWeight: 600, margin: 0 }}>{t("empty_title")}</p>
            <p style={{ fontSize: 13, margin: "4px 0 0" }}>{t("empty_cta")}</p>
          </div>
        ) : (
          <>
            {visibleItems.length > 0 && <div className="labs-grid">{visibleItems.map(renderCard)}</div>}
            {archivedItems.length > 0 && (
              <details className="labs-drawer">
                <summary>🗄️ {t("archived_drawer", { count: archivedItems.length })}</summary>
                <div className="labs-grid">{archivedItems.map(renderCard)}</div>
              </details>
            )}
          </>
        )}
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
          onCreated={() => { setShowNewModal(false); fetchItems(); fetchStats(); }}
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
    if (item.myVote === vote) {
      if (vote === "meh") { setShowMehInput(true); setMehComment(item.myVoteComment ?? ""); return; }
      onUnvote(item.id); return;
    }
    if (vote === "meh") { setShowMehInput(true); setMehComment(""); return; }
    onVote(item.id, vote);
  };

  const submitMeh = () => {
    if (!mehComment.trim()) return;
    onVote(item.id, "meh", mehComment.trim());
    setShowMehInput(false);
    setMehComment("");
  };

  const [copied, setCopied] = useState(false);
  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation(); // n'ouvre pas la modale en dessous
    const result = await shareItemUrl(item.id, item.title, t("share_copy_fallback"));
    if (result === "copied") {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  };

  const canDelete = isAdmin || (!!playerId && item.authorId === playerId);

  return (
    <article className={`labs-card${voting ? " is-busy" : ""}${item.status === "rejected" ? " is-rejected" : ""}`}>
      {/* Type, statut, auteur·rice, partage */}
      <div className="labs-card__head">
        <span className="labs-tag">{t((TYPE_LABEL[item.type] ?? item.type) as never)}</span>
        {isAdmin ? (
          <select
            className="labs-tag labs-tag--status"
            value={item.status}
            onChange={(e) => onAdminStatus(item.id, e.target.value)}
            style={{ background: status.bg, color: status.color }}
          >
            {Object.entries(STATUS_META).map(([k, v]) => (
              <option key={k} value={k}>{t(v.label as never)}</option>
            ))}
          </select>
        ) : (
          <span className="labs-tag labs-tag--status" style={{ background: status.bg, color: status.color }}>
            {t(status.label as never)}
          </span>
        )}
        {item.pinned && <span title={t("pinned")}>📌</span>}
        <span className="labs-card__meta">{item.authorName} · {timeAgo(item.createdAt)}</span>
        <button
          type="button"
          onClick={handleShare}
          className="header-icon-btn"
          aria-label={t("share_button")}
          title={t("share_button")}
          style={{ flexShrink: 0 }}
        >
          {copied ? "✓" : <ShareIcon size={15} />}
        </button>
      </div>

      {/* Titre + début du texte : ouvre la proposition */}
      <button type="button" className="labs-card__open" onClick={onOpen}>
        <h3 className="labs-card__title">{item.title}</h3>
        <p className="labs-card__body">{item.body}</p>
      </button>

      {/* Avis « à revoir » : commentaire obligatoire */}
      {showMehInput && (
        <div className="labs-card__meh-form">
          <input
            autoFocus
            value={mehComment}
            onChange={(e) => setMehComment(e.target.value)}
            placeholder={t("meh_card_placeholder")}
            onKeyDown={(e) => { if (e.key === "Enter") submitMeh(); if (e.key === "Escape") setShowMehInput(false); }}
          />
          <button type="button" onClick={submitMeh} disabled={!mehComment.trim()} className="primary" style={{ padding: "6px 12px", fontSize: 12 }}>
            {t("send")}
          </button>
          <button type="button" onClick={() => setShowMehInput(false)} className="ghost" style={{ padding: "6px 10px", fontSize: 12 }}>
            ✕
          </button>
        </div>
      )}
      {item.myVote === "meh" && item.myVoteComment && !showMehInput && (
        <p className="labs-card__meh">💬 {item.myVoteComment}</p>
      )}
      {item.myVote === "meh" && !item.myVoteComment && !showMehInput && (
        <button type="button" className="labs-card__meh-add" onClick={() => setShowMehInput(true)}>
          ✏️ {t("meh_add_comment")}
        </button>
      )}

      {/* Votes, réponses, actions — toujours en bas de la carte */}
      <div className="labs-card__foot">
        <VoteButton vote="up" count={item.up} active={item.myVote === "up"} disabled={!playerId || voting} onClick={() => handleVoteClick("up")} />
        <VoteButton vote="meh" count={item.meh} active={item.myVote === "meh"} disabled={!playerId || voting} onClick={() => handleVoteClick("meh")} />
        <VoteButton vote="down" count={item.down} active={item.myVote === "down"} disabled={!playerId || voting} onClick={() => handleVoteClick("down")} />
        <span className="labs-card__replies">🗣️ {item.replyCount}</span>
        <span className="labs-card__actions">
          {canDelete && (
            <button type="button" className="labs-chip labs-chip--danger" onClick={() => onDelete(item.id)}>
              {t("delete")}
            </button>
          )}
          <button type="button" className="labs-chip" onClick={onOpen}>{t("view")}</button>
        </span>
      </div>
    </article>
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
      title={disabled ? t("vote_login_tooltip") : t(meta.label as never)}
      className={`labs-chip labs-vote${active ? " is-active" : ""}`}
      style={active ? { background: meta.activeBg, color: meta.activeColor } : undefined}
    >
      {meta.emoji} {count}
    </button>
  );
}
