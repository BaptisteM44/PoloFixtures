"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import type { CommunityItemDetail, CommunityReply, VoteType } from "@/types/community";
import { Link } from "@/i18n/navigation";

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  open:        { label: "status_open",        color: "#1a1a1a", bg: "var(--teal)" },
  thinking:    { label: "status_thinking",    color: "#1a1a1a", bg: "var(--yellow)" },
  in_progress: { label: "status_in_progress", color: "#fff",    bg: "#e67e22" },
  done:        { label: "status_done",        color: "#1a1a1a", bg: "#a8e6a3" },
  rejected:    { label: "status_rejected",    color: "#fff",    bg: "#888" },
};

const VOTE_META: Record<VoteType, { emoji: string; label: string; activeColor: string; activeBg: string }> = {
  up:   { emoji: "👍", label: "vote_up",   activeColor: "#1a1a1a", activeBg: "var(--teal)" },
  meh:  { emoji: "🔄", label: "vote_meh",  activeColor: "#1a1a1a", activeBg: "var(--yellow)" },
  down: { emoji: "👎", label: "vote_down", activeColor: "#fff",    activeBg: "#888" },
};

const TYPE_LABEL: Record<string, string> = {
  idea: "type_idea",
  bug: "type_bug",
  translation: "type_translation",
};

interface Props {
  item: CommunityItemDetail;
  playerId: string | null;
  isAdmin: boolean;
  charterAccepted: boolean;
  onClose: () => void;
  onVote: (id: string, vote: VoteType, comment?: string) => void;
  onUnvote: (id: string) => void;
  onRefresh: () => Promise<void>;
  onAdminStatus: (id: string, status: string) => void;
}

export function LabsItemModal({ item, playerId, isAdmin, charterAccepted, onClose, onVote, onUnvote, onRefresh, onAdminStatus }: Props) {
  const t = useTranslations("labs");
  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 60) return t("time_ago_min", { n: m });
    const h = Math.floor(m / 60);
    if (h < 24) return t("time_ago_hour", { n: h });
    const d = Math.floor(h / 24);
    if (d < 30) return t("time_ago_day", { n: d });
    return t("time_ago_month", { n: Math.floor(d / 30) });
  };
  const [replySort, setReplySort] = useState<"new" | "likes">("new");
  const [replyText, setReplyText] = useState("");
  const [anonName, setAnonName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showMeh, setShowMeh] = useState(false);
  const [mehComment, setMehComment] = useState("");
  const [liking, setLiking] = useState<string | null>(null);
  const [replyAnon, setReplyAnon] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);

  const status = STATUS_META[item.status] ?? STATUS_META.open;

  // Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const sortedReplies = [...item.replies].sort((a, b) => {
    if (replySort === "likes") {
      if (a.isKeyReply && !b.isKeyReply) return -1;
      if (!a.isKeyReply && b.isKeyReply) return 1;
      return b.likeCount - a.likeCount;
    }
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  const submitReply = async () => {
    const text = replyText.trim();
    if (!text || text.length < 5) return;
    setSubmitting(true);
    try {
      const effectiveAnonName = !playerId
        ? (anonName.trim() || "Anonyme")
        : (replyAnon ? (anonName.trim() || "Anonyme") : undefined);
      const res = await fetch(`/api/community/items/${item.id}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text, authorName: effectiveAnonName }),
      });
      if (res.ok) {
        setReplyText("");
        setAnonName("");
        setReplyAnon(false);
        await onRefresh();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleVoteClick = (vote: VoteType) => {
    if (item.myVote?.vote === vote) { onUnvote(item.id); return; }
    if (vote === "meh") { setShowMeh(true); return; }
    onVote(item.id, vote);
  };

  const submitMeh = () => {
    if (!mehComment.trim()) return;
    onVote(item.id, "meh", mehComment.trim());
    setShowMeh(false);
    setMehComment("");
  };

  const toggleLike = async (reply: CommunityReply) => {
    if (!playerId || liking) return;
    setLiking(reply.id);
    try {
      if (reply.likedByMe) {
        await fetch(`/api/community/items/${item.id}/replies/${reply.id}/like`, { method: "DELETE" });
      } else {
        await fetch(`/api/community/items/${item.id}/replies/${reply.id}/like`, { method: "POST" });
      }
      await onRefresh();
    } finally {
      setLiking(null);
    }
  };

  const markKeyReply = async (replyId: string, current: boolean) => {
    await fetch(`/api/community/items/${item.id}/replies/${replyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isKeyReply: !current }),
    });
    await onRefresh();
  };

  const deleteReply = async (replyId: string) => {
    if (!confirm(t("delete_reply_confirm" as any))) return;
    await fetch(`/api/community/items/${item.id}/replies/${replyId}`, { method: "DELETE" });
    await onRefresh();
  };

  return (
    <div
      ref={backdropRef}
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.65)",
        zIndex: 2000,
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "16px 12px",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          width: "100%", maxWidth: 680,
          background: "var(--bg)",
          border: "2px solid var(--border)",
          borderRadius: 10,
          boxShadow: "6px 6px 0 var(--border)",
          overflow: "hidden",
          marginTop: 24,
          marginBottom: 40,
        }}
      >
        {/* ── Modal header ────────────────────────────────────────── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 18px",
          background: "var(--surface-2)",
          borderBottom: "2px solid var(--border)",
          flexWrap: "wrap", gap: 10,
        }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: "2px 7px",
              border: "1.5px solid var(--border)", borderRadius: 4,
              background: "var(--surface)",
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
          </div>
          <button
            type="button"
            onClick={onClose}
            className="header-icon-btn"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        {/* ── Content ─────────────────────────────────────────────── */}
        <div style={{ padding: "20px 20px 0" }}>
          <h2 style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(18px, 3vw, 24px)",
            fontWeight: 900,
            lineHeight: 1.25,
            marginBottom: 12,
          }}>
            {item.title}
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
            {item.authorName}
            {item.authorSlug && (
              <> · <Link href={`/player/${item.authorSlug}`} style={{ color: "var(--teal)", textDecoration: "underline" }}>{item.authorName}</Link></>
            )}
            {" "}· {timeAgo(item.createdAt)}
          </p>
          <p style={{
            fontSize: 14, lineHeight: 1.7,
            whiteSpace: "pre-wrap", marginBottom: 20,
          }}>
            {item.body}
          </p>
        </div>

        {/* ── Vote section ─────────────────────────────────────────── */}
        <div style={{
          margin: "0 20px",
          padding: "16px 0",
          borderTop: "2px solid var(--border-light)",
          borderBottom: "2px solid var(--border-light)",
        }}>
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 10 }}>
            {t("vote_title")}
          </p>

          {!playerId && (
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10, fontStyle: "italic" }}>
              {t("vote_login")}
            </p>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(["up", "meh", "down"] as VoteType[]).map((vote) => {
              const meta = VOTE_META[vote];
              const active = item.myVote?.vote === vote;
              const count = vote === "up" ? item.up : vote === "meh" ? item.meh : item.down;
              return (
                <button
                  key={vote}
                  type="button"
                  onClick={() => playerId && handleVoteClick(vote)}
                  disabled={!playerId}
                  title={!playerId ? t("vote_login_tooltip") : t(meta.label as any)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    fontSize: 13, fontWeight: 700,
                    padding: "8px 14px",
                    border: "2px solid var(--border)",
                    borderRadius: 6,
                    cursor: !playerId ? "default" : "pointer",
                    background: active ? meta.activeBg : "var(--surface)",
                    color: active ? meta.activeColor : "var(--text)",
                    boxShadow: active ? "none" : "2px 2px 0 var(--border)",
                    transform: active ? "translate(2px, 2px)" : "none",
                    opacity: !playerId ? 0.6 : 1,
                    transition: "all 0.1s",
                  }}
                >
                  {meta.emoji} {t(meta.label as any)} <span style={{ fontSize: 11, opacity: 0.7 }}>({count})</span>
                </button>
              );
            })}
          </div>

          {item.myVote?.comment && (
            <p style={{ marginTop: 10, fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
              {t("meh_comment_label", { comment: item.myVote.comment })}
            </p>
          )}

          {showMeh && (
            <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                autoFocus
                value={mehComment}
                onChange={(e) => setMehComment(e.target.value)}
                placeholder={t("meh_placeholder")}
                style={{
                  flex: 1, minWidth: 200, padding: "8px 12px", fontSize: 13,
                  border: "2px solid var(--yellow)", borderRadius: 6,
                  background: "var(--surface)", color: "var(--text)",
                }}
                onKeyDown={(e) => { if (e.key === "Enter") submitMeh(); if (e.key === "Escape") setShowMeh(false); }}
              />
              <button type="button" onClick={submitMeh} disabled={!mehComment.trim()} className="primary" style={{ padding: "8px 16px", fontSize: 13 }}>
                {t("send")}
              </button>
              <button type="button" onClick={() => setShowMeh(false)} className="ghost" style={{ padding: "8px 12px", fontSize: 13 }}>
                ✕
              </button>
            </div>
          )}
        </div>

        {/* ── Replies section ──────────────────────────────────────── */}
        <div style={{ padding: "16px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>
              {item.replies.length} {item.replies.length === 1 ? t("reply_singular") : t("reply_plural")}
            </p>
            <div style={{ display: "flex", gap: 6 }}>
              {(["new", "likes"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setReplySort(s)}
                  style={{
                    fontSize: 11, fontWeight: 600, padding: "3px 8px",
                    border: "1.5px solid var(--border)", borderRadius: 12,
                    background: replySort === s ? "var(--border)" : "transparent",
                    color: replySort === s ? "var(--bg)" : "var(--text-muted)",
                    cursor: "pointer",
                  }}
                >
                  {s === "new" ? t("reply_sort_new") : t("reply_sort_likes")}
                </button>
              ))}
            </div>
          </div>

          {/* Reply list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
            {sortedReplies.length === 0 && (
              <p style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "12px 0", fontStyle: "italic" }}>
                {t("no_replies")}
              </p>
            )}
            {sortedReplies.map((reply) => (
              <div
                key={reply.id}
                style={{
                  background: reply.isKeyReply ? "color-mix(in srgb, var(--yellow) 15%, var(--surface))" : "var(--surface)",
                  border: reply.isKeyReply ? "2px solid var(--yellow)" : "1.5px solid var(--border-light)",
                  borderRadius: 6,
                  padding: "10px 14px",
                  position: "relative",
                }}
              >
                {reply.isKeyReply && (
                  <div style={{
                    position: "absolute", top: -10, left: 12,
                    fontSize: 10, fontWeight: 700, background: "var(--yellow)",
                    border: "1.5px solid var(--border)", borderRadius: 4, padding: "1px 6px",
                    color: "#1a1a1a", letterSpacing: "0.05em",
                  }}>
                    ⭐ {t("key_reply")}
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>
                    {reply.authorSlug ? (
                      <Link href={`/player/${reply.authorSlug}`} style={{ color: "var(--text)", textDecoration: "underline" }}>
                        {reply.authorName}
                      </Link>
                    ) : reply.authorName}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>· {timeAgo(reply.createdAt)}</span>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => markKeyReply(reply.id, reply.isKeyReply)}
                      style={{
                        fontSize: 10, padding: "1px 6px",
                        border: "1px solid var(--border-light)", borderRadius: 4,
                        background: "transparent", cursor: "pointer", color: "var(--text-muted)",
                      }}
                    >
                      {reply.isKeyReply ? t("unmark_key") : t("mark_key")}
                    </button>
                  )}
                  {(isAdmin || (playerId && reply.authorId === playerId)) && (
                    <button
                      type="button"
                      onClick={() => deleteReply(reply.id)}
                      style={{
                        fontSize: 10, padding: "1px 6px",
                        border: "1px solid #e74c3c", borderRadius: 4,
                        background: "transparent", cursor: "pointer", color: "#e74c3c",
                      }}
                    >
                      {t("delete" as any)}
                    </button>
                  )}
                </div>
                <p style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap", marginBottom: 8 }}>{reply.body}</p>
                <button
                  type="button"
                  onClick={() => toggleLike(reply)}
                  disabled={!playerId || liking === reply.id}
                  style={{
                    fontSize: 11, fontWeight: 600, padding: "2px 8px",
                    border: "1.5px solid var(--border-light)", borderRadius: 20,
                    background: reply.likedByMe ? "color-mix(in srgb, var(--pink) 20%, var(--surface))" : "transparent",
                    cursor: !playerId ? "default" : "pointer",
                    color: reply.likedByMe ? "var(--text)" : "var(--text-muted)",
                    opacity: !playerId ? 0.6 : 1,
                    transition: "background 0.1s",
                  }}
                >
                  ❤️ {reply.likeCount}
                </button>
              </div>
            ))}
          </div>

          {/* Add reply */}
          <div style={{ borderTop: "2px solid var(--border-light)", paddingTop: 14 }}>
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 10 }}>
              {t("reply_label")}
            </p>
            {/* Toggle anonyme (connecté) */}
            {playerId && (
              <div style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, fontWeight: 600, userSelect: "none" }}>
                  <input
                    type="checkbox"
                    checked={replyAnon}
                    onChange={(e) => { setReplyAnon(e.target.checked); if (!e.target.checked) setAnonName(""); }}
                    style={{ cursor: "pointer", width: 14, height: 14 }}
                  />
                  {replyAnon ? t("reply_as_anon" as any) : t("reply_as_me" as any)}
                </label>
              </div>
            )}
            {/* Pseudo anonyme */}
            {(replyAnon || !playerId) && (
              <input
                value={anonName}
                onChange={(e) => setAnonName(e.target.value)}
                placeholder={t("anon_placeholder")}
                style={{
                  width: "100%", padding: "8px 12px", fontSize: 13,
                  border: "1.5px solid var(--border-light)", borderRadius: 6,
                  background: "var(--surface)", color: "var(--text)",
                  marginBottom: 8, boxSizing: "border-box",
                }}
              />
            )}
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder={t("reply_placeholder")}
              rows={3}
              style={{
                width: "100%", padding: "10px 12px", fontSize: 13,
                border: "2px solid var(--border-light)", borderRadius: 6,
                background: "var(--surface)", color: "var(--text)",
                resize: "vertical", fontFamily: "var(--font-body)",
                marginBottom: 8, boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <span style={{ fontSize: 11, color: replyText.length < 5 ? "var(--text-muted)" : "var(--teal)", alignSelf: "center" }}>
                {replyText.length}/1000
              </span>
              <button
                type="button"
                onClick={submitReply}
                disabled={submitting || replyText.trim().length < 5}
                className="primary"
                style={{ padding: "8px 18px", fontSize: 13 }}
              >
                {submitting ? "..." : t("reply_btn")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
