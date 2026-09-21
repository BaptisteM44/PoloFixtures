"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { CharterModal } from "@/components/CharterModal";
import { Link } from "@/i18n/navigation";

type OtherPlayer = {
  id: string;
  name: string;
  photoPath: string | null;
  slug: string | null;
};

type ConvSummary = {
  id: string;
  other: OtherPlayer;
  lastMessage: { content: string; createdAt: string; authorId: string } | null;
  unread: number;
};

type Message = {
  id: string;
  content: string;
  authorId: string;
  createdAt: string;
  editedAt?: string | null;
  author: { id: string; name: string; photoPath: string | null };
};

type SearchResult = { id: string; name: string; slug: string | null; photoPath: string | null };

type DirectMessageEvent =
  | { type: "new"; conversationId: string; message: Message }
  | { type: "edited"; conversationId: string; message: Message }
  | { type: "deleted"; conversationId: string; messageId: string };

export function MessagesClient({
  conversations,
  currentPlayerId,
  charterAccepted: initialCharterAccepted,
}: {
  conversations: ConvSummary[];
  currentPlayerId: string;
  charterAccepted?: boolean;
}) {
  const t = useTranslations("messages");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [convList, setConvList] = useState(conversations);
  const [localCharterAccepted, setLocalCharterAccepted] = useState(initialCharterAccepted ?? false);
  const [showCharter, setShowCharter] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [deletingConvId, setDeletingConvId] = useState<string | null>(null);
  const [openMenuFor, setOpenMenuFor] = useState<string | null>(null);
  // Nouveau message : recherche d'un·e joueur·euse à contacter.
  const [showNewConv, setShowNewConv] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeConv = convList.find((c) => c.id === activeId) ?? null;
  // Mobile : on affiche soit la liste, soit le fil — jamais les deux empilés.
  const mobileShowThread = activeId !== null || showNewConv;

  // Ferme le menu ⋯ d'un message au clic ailleurs sur la page.
  useEffect(() => {
    if (!openMenuFor) return;
    const handler = () => setOpenMenuFor(null);
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openMenuFor]);

  function formatRelative(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return t("just_now");
    if (diffMin < 60) return t("minutes_ago", { count: diffMin });
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return t("hours_ago", { count: diffH });
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  }

  // Charge les messages à l'ouverture d'une conversation.
  useEffect(() => {
    if (!activeId) return;
    setLoadingMsgs(true);
    fetch(`/api/direct-conversations/${activeId}/messages`)
      .then((r) => r.json())
      .then((data) => {
        setMessages(data);
        setConvList((prev) =>
          prev.map((c) => (c.id === activeId ? { ...c, unread: 0 } : c))
        );
        requestAnimationFrame(() => {
          if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
        });
      })
      .finally(() => setLoadingMsgs(false));
  }, [activeId]);

  // Ref à jour de activeId, lisible depuis le listener SSE (closure figée au montage).
  const activeIdRef = useRef(activeId);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  // Temps réel via SSE (remplace le polling) : reçoit les nouveaux messages,
  // éditions et suppressions pour TOUTES mes conversations, pas seulement celle
  // ouverte — pour mettre à jour la sidebar (aperçu, badge non-lu) en direct.
  useEffect(() => {
    const es = new EventSource("/api/sse");
    es.addEventListener("direct_message", (evt) => {
      const payload = JSON.parse((evt as MessageEvent).data) as DirectMessageEvent;
      const { conversationId } = payload;

      if (payload.type === "new" || payload.type === "edited") {
        const msg = payload.message;
        setConvList((prev) => {
          const exists = prev.some((c) => c.id === conversationId);
          if (!exists) return prev; // conversation pas encore dans la liste locale (rare, rechargement suffira)
          return prev
            .map((c) =>
              c.id === conversationId
                ? {
                    ...c,
                    lastMessage: { content: msg.content, createdAt: msg.createdAt, authorId: msg.authorId },
                    unread: payload.type === "new" && conversationId !== activeIdRef.current && msg.authorId !== currentPlayerId
                      ? c.unread + 1
                      : c.unread,
                  }
                : c
            )
            .sort((a, b) => (a.id === conversationId ? -1 : b.id === conversationId ? 1 : 0));
        });
        if (conversationId === activeIdRef.current) {
          setMessages((prev) => {
            if (payload.type === "edited") return prev.map((m) => (m.id === msg.id ? msg : m));
            if (prev.some((m) => m.id === msg.id)) return prev; // déjà ajouté en optimiste
            return [...prev, msg];
          });
          requestAnimationFrame(() => {
            if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
          });
        }
      } else if (payload.type === "deleted") {
        if (conversationId === activeIdRef.current) {
          setMessages((prev) => prev.filter((m) => m.id !== payload.messageId));
        }
      }
    });
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPlayerId]);

  const send = async () => {
    if (!activeId || !input.trim() || sending) return;
    if (!localCharterAccepted) { setShowCharter(true); return; }
    setSending(true);
    const res = await fetch(`/api/direct-conversations/${activeId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: input.trim() }),
    });
    if (res.ok) {
      const msg: Message = await res.json();
      setMessages((prev) => [...prev, msg]);
      setConvList((prev) =>
        prev.map((c) =>
          c.id === activeId
            ? { ...c, lastMessage: { content: msg.content, createdAt: msg.createdAt, authorId: msg.authorId } }
            : c
        )
      );
      setInput("");
      requestAnimationFrame(() => {
        if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
      });
    }
    setSending(false);
  };

  const deleteMessage = async (messageId: string) => {
    if (!activeId) return;
    const res = await fetch(`/api/direct-conversations/${activeId}/messages`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId }),
    });
    if (res.ok) {
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      setConvList((prev) =>
        prev.map((c) => {
          if (c.id !== activeId) return c;
          const remaining = messages.filter((m) => m.id !== messageId);
          const last = remaining[remaining.length - 1];
          return { ...c, lastMessage: last ? { content: last.content, createdAt: last.createdAt, authorId: last.authorId } : null };
        })
      );
    }
  };

  const editMessage = async (messageId: string) => {
    if (!activeId || !editContent.trim()) return;
    const res = await fetch(`/api/direct-conversations/${activeId}/messages`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, content: editContent.trim() }),
    });
    if (res.ok) {
      const updated: Message = await res.json();
      setMessages((prev) => prev.map((m) => (m.id === messageId ? updated : m)));
      setEditingId(null);
      setEditContent("");
      setConvList((prev) =>
        prev.map((c) => {
          if (c.id !== activeId || c.lastMessage?.authorId !== currentPlayerId) return c;
          const lastMsg = messages[messages.length - 1];
          if (lastMsg?.id === messageId) {
            return { ...c, lastMessage: { ...c.lastMessage!, content: editContent.trim() } };
          }
          return c;
        })
      );
    }
  };

  const deleteConversation = async (convId: string) => {
    const res = await fetch(`/api/direct-conversations/${convId}`, { method: "DELETE" });
    if (res.ok) {
      const newList = convList.filter((c) => c.id !== convId);
      setConvList(newList);
      if (activeId === convId) {
        setActiveId(null);
        setMessages([]);
      }
      setDeletingConvId(null);
    }
  };

  // ── Nouveau message : recherche + démarrage de conversation ──────────────
  const runSearch = useCallback((q: string) => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    if (q.trim().length < 2) { setSearchResults([]); return; }
    searchDebounce.current = setTimeout(async () => {
      setSearching(true);
      const res = await fetch(`/api/players?search=${encodeURIComponent(q.trim())}&status=ACTIVE&hasAccount=true`);
      if (res.ok) {
        const players: SearchResult[] = await res.json();
        setSearchResults(players.filter((p) => p.id !== currentPlayerId));
      }
      setSearching(false);
    }, 250);
  }, [currentPlayerId]);

  const openExistingOrNew = (player: SearchResult) => {
    const existing = convList.find((c) => c.other.id === player.id);
    setShowNewConv(false);
    setSearchQuery("");
    setSearchResults([]);
    if (existing) {
      setActiveId(existing.id);
    } else {
      // Pas encore de conversation : on ouvre un fil "virtuel" — le premier
      // message envoyé créera la conversation côté serveur (POST racine).
      setActiveId(null);
      setPendingRecipient(player);
    }
  };

  const [pendingRecipient, setPendingRecipient] = useState<SearchResult | null>(null);

  const sendFirstMessage = async () => {
    if (!pendingRecipient || !input.trim() || sending) return;
    if (!localCharterAccepted) { setShowCharter(true); return; }
    setSending(true);
    const res = await fetch("/api/direct-conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipientId: pendingRecipient.id, message: input.trim() }),
    });
    if (res.ok) {
      const data = await res.json();
      const newConv: ConvSummary = {
        id: data.conversation.id,
        other: pendingRecipient,
        lastMessage: { content: data.message.content, createdAt: data.message.createdAt, authorId: data.message.authorId },
        unread: 0,
      };
      setConvList((prev) => [newConv, ...prev]);
      setActiveId(newConv.id);
      setPendingRecipient(null);
      setInput("");
    }
    setSending(false);
  };

  const closeThread = () => {
    setActiveId(null);
    setShowNewConv(false);
    setPendingRecipient(null);
    setMessages([]);
  };

  const isComposingNew = !!pendingRecipient;

  return (
    <>
      {showCharter && <CharterModal onAccepted={() => { setLocalCharterAccepted(true); setShowCharter(false); }} />}
      <div className={`messages-layout${mobileShowThread ? " messages-layout--show-thread" : ""}`}>
        {/* Sidebar */}
        <aside className="messages-sidebar">
          <div className="messages-sidebar__header">
            <h3 style={{ margin: 0, fontSize: 15 }}>{t("page_title")}</h3>
            <button
              type="button"
              className="primary"
              style={{ fontSize: 12, padding: "5px 12px" }}
              onClick={() => { setShowNewConv(true); setActiveId(null); setPendingRecipient(null); }}
            >
              ✏️ {t("new_conversation")}
            </button>
          </div>

          {convList.length === 0 ? (
            <div className="empty-state" style={{ padding: "32px 16px" }}>
              <p>{t("empty")}</p>
              <p className="meta">{t("empty_hint")}</p>
            </div>
          ) : (
            convList.map((conv) => (
              <div key={conv.id} className={`messages-conv-item${conv.id === activeId ? " messages-conv-item--active" : ""}`}>
                {deletingConvId === conv.id ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", fontSize: 12, width: "100%" }}>
                    <span style={{ flex: 1 }}>{t("delete_conversation_confirm")}</span>
                    <button type="button" className="primary" style={{ fontSize: 11, padding: "3px 10px" }} onClick={() => deleteConversation(conv.id)}>{t("save")}</button>
                    <button type="button" className="ghost" style={{ fontSize: 11, padding: "3px 10px" }} onClick={() => setDeletingConvId(null)}>{t("cancel")}</button>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      className="messages-conv-item__main"
                      onClick={() => { setActiveId(conv.id); setShowNewConv(false); setPendingRecipient(null); }}
                    >
                      <div className="messages-conv-item__avatar">
                        {conv.other.photoPath ? (
                          <img src={conv.other.photoPath} alt="" />
                        ) : (
                          <span>{conv.other.name[0].toUpperCase()}</span>
                        )}
                        {conv.unread > 0 && (
                          <span className="messages-conv-item__badge">{conv.unread}</span>
                        )}
                      </div>
                      <div className="messages-conv-item__body">
                        <strong>{conv.other.name}</strong>
                        {conv.lastMessage && (
                          <span className="meta" style={{ fontSize: 12 }}>
                            {conv.lastMessage.authorId === currentPlayerId ? t("you_prefix") : ""}
                            {conv.lastMessage.content.slice(0, 50)}
                            {conv.lastMessage.content.length > 50 ? "…" : ""}
                          </span>
                        )}
                      </div>
                      {conv.lastMessage && (
                        <span className="meta" style={{ fontSize: 11, flexShrink: 0, alignSelf: "flex-start" }}>
                          {formatRelative(conv.lastMessage.createdAt)}
                        </span>
                      )}
                    </button>
                    {/* Toujours visible (pas de hover-only) : essentiel au tactile. */}
                    <button
                      type="button"
                      className="messages-conv-item__delete"
                      onClick={(e) => { e.stopPropagation(); setDeletingConvId(conv.id); }}
                      title={t("delete_conversation")}
                      aria-label={t("delete_conversation")}
                    >
                      🗑
                    </button>
                  </>
                )}
              </div>
            ))
          )}
        </aside>

        {/* Main thread */}
        <main className="messages-thread">
          {showNewConv && !isComposingNew && (
            <div className="messages-new-conv">
              <div className="messages-thread__header">
                <button type="button" className="messages-back-btn" onClick={closeThread} aria-label={t("go_back")}>‹</button>
                <strong>{t("new_conversation")}</strong>
              </div>
              <div style={{ padding: 16 }}>
                <input
                  type="text"
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); runSearch(e.target.value); }}
                  placeholder={t("search_placeholder")}
                  style={{ width: "100%" }}
                />
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 4 }}>
                  {searching && <p className="meta" style={{ fontSize: 13 }}>{t("loading")}</p>}
                  {!searching && searchQuery.trim().length >= 2 && searchResults.length === 0 && (
                    <p className="meta" style={{ fontSize: 13 }}>{t("search_no_results")}</p>
                  )}
                  {searchResults.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="messages-search-result"
                      onClick={() => openExistingOrNew(p)}
                    >
                      <div className="messages-conv-item__avatar" style={{ width: 32, height: 32 }}>
                        {p.photoPath ? <img src={p.photoPath} alt="" /> : <span>{p.name[0].toUpperCase()}</span>}
                      </div>
                      <span style={{ fontSize: 14 }}>{p.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {isComposingNew && pendingRecipient && (
            <>
              <div className="messages-thread__header">
                <button type="button" className="messages-back-btn" onClick={closeThread} aria-label={t("go_back")}>‹</button>
                <Link href={`/player/${pendingRecipient.slug ?? pendingRecipient.id}`} style={{ color: "inherit", textDecoration: "none" }}>
                  <strong style={{ cursor: "pointer" }}>{pendingRecipient.name}</strong>
                </Link>
              </div>
              <div className="messages-thread__body">
                <p className="meta" style={{ textAlign: "center", marginTop: 24 }}>{t("first_message_hint", { name: pendingRecipient.name })}</p>
              </div>
              <div className="messages-thread__input">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendFirstMessage(); } }}
                  placeholder={t("input_placeholder")}
                  rows={2}
                  maxLength={2000}
                  style={{ flex: 1, resize: "none" }}
                  autoFocus
                />
                <button type="button" className="primary" onClick={sendFirstMessage} disabled={sending || !input.trim()} style={{ alignSelf: "flex-end" }}>
                  {sending ? "…" : t("btn_send")}
                </button>
              </div>
            </>
          )}

          {activeConv && (
            <>
              <div className="messages-thread__header">
                <button type="button" className="messages-back-btn" onClick={closeThread} aria-label={t("go_back")}>‹</button>
                <Link href={`/player/${activeConv.other.slug ?? activeConv.other.id}`} style={{ color: "inherit", textDecoration: "none" }}>
                  <strong style={{ cursor: "pointer" }}>{activeConv.other.name}</strong>
                </Link>
              </div>

              <div className="messages-thread__body" ref={bodyRef}>
                {loadingMsgs && <p className="meta" style={{ textAlign: "center" }}>{t("loading")}</p>}
                {messages.map((msg) => {
                  const mine = msg.authorId === currentPlayerId;
                  return (
                    <div key={msg.id} className={`message-bubble${mine ? " message-bubble--mine" : ""}`}>
                      {editingId === msg.id ? (
                        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                          <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); editMessage(msg.id); } }}
                            rows={2}
                            maxLength={2000}
                            style={{ flex: 1, resize: "none", fontSize: 13 }}
                            autoFocus
                          />
                          <button type="button" className="primary" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => editMessage(msg.id)}>{t("save")}</button>
                          <button type="button" className="ghost" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => { setEditingId(null); setEditContent(""); }}>{t("cancel")}</button>
                        </div>
                      ) : (
                        <>
                          <p>{msg.content}</p>
                          <span className="meta" style={{ fontSize: 11 }}>
                            {formatRelative(msg.createdAt)}
                            {msg.editedAt && <> · <em>{t("message_edited")}</em></>}
                          </span>
                          {mine && (
                            <div className="message-actions">
                              {/* Menu ⋯ toujours accessible (plus de hover-only) */}
                              <button
                                type="button"
                                className="message-actions__toggle"
                                onClick={(e) => { e.stopPropagation(); setOpenMenuFor(openMenuFor === msg.id ? null : msg.id); }}
                                aria-label={t("message_actions")}
                              >
                                ⋯
                              </button>
                              {openMenuFor === msg.id && (
                                <div className="message-actions__menu" onMouseDown={(e) => e.stopPropagation()}>
                                  <button type="button" onClick={() => { setEditingId(msg.id); setEditContent(msg.content); setOpenMenuFor(null); }}>{t("edit_message")}</button>
                                  <button type="button" onClick={() => { deleteMessage(msg.id); setOpenMenuFor(null); }}>{t("delete_message")}</button>
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="messages-thread__input">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                  }}
                  placeholder={t("input_placeholder")}
                  rows={2}
                  maxLength={2000}
                  style={{ flex: 1, resize: "none" }}
                />
                <button
                  type="button"
                  className="primary"
                  onClick={send}
                  disabled={sending || !input.trim()}
                  style={{ alignSelf: "flex-end" }}
                >
                  {sending ? "…" : t("btn_send")}
                </button>
              </div>
            </>
          )}

          {!activeConv && !showNewConv && !isComposingNew && (
            <div className="messages-thread__placeholder">
              <p className="meta">{t("select_conversation_hint")}</p>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
