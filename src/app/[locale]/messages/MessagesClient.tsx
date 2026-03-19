"use client";

import { useState, useEffect, useRef } from "react";
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
  const [activeId, setActiveId] = useState<string | null>(
    conversations[0]?.id ?? null
  );
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
  const bodyRef = useRef<HTMLDivElement>(null);

  const activeConv = convList.find((c) => c.id === activeId) ?? null;

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

  // Load messages when active conversation changes
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

  // Poll for new messages every 10s
  useEffect(() => {
    if (!activeId) return;
    const interval = setInterval(() => {
      fetch(`/api/direct-conversations/${activeId}/messages`)
        .then((r) => r.json())
        .then((r) => r.json())
        .then(setMessages);
    }, 10000);
    return () => clearInterval(interval);
  }, [activeId]);


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
      // Update sidebar last message
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
      setMessages((prev) => prev.map((m) => m.id === messageId ? updated : m));
      setEditingId(null);
      setEditContent("");
      // Update sidebar if it was the last message
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
        setActiveId(newList[0]?.id ?? null);
        setMessages([]);
      }
      setDeletingConvId(null);
    }
  };

  if (convList.length === 0) {
    return (
      <div className="empty-state">
        <p>{t("empty")}</p>
        <p className="meta">{t("empty_hint")}</p>
      </div>
    );
  }

  return (
    <>
    {showCharter && <CharterModal onAccepted={() => { setLocalCharterAccepted(true); setShowCharter(false); }} />}
    <div className="messages-layout">
      {/* Sidebar */}
      <aside className="messages-sidebar">
        {convList.map((conv) => (
          <div key={conv.id} className={`messages-conv-item${conv.id === activeId ? " messages-conv-item--active" : ""}`}>
            {deletingConvId === conv.id ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", fontSize: 12, width: "100%" }}>
                <span style={{ flex: 1 }}>{t("delete_conversation_confirm")}</span>
                <button type="button" className="primary" style={{ fontSize: 11, padding: "3px 10px" }} onClick={() => deleteConversation(conv.id)}>{t("save")}</button>
                <button type="button" className="ghost" style={{ fontSize: 11, padding: "3px 10px" }} onClick={() => setDeletingConvId(null)}>{t("cancel")}</button>
              </div>
            ) : (
              <button
                type="button"
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left", color: "inherit", font: "inherit" }}
                onClick={() => setActiveId(conv.id)}
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
                  <Link href={`/player/${conv.other.slug ?? conv.other.id}`} onClick={(e) => e.stopPropagation()} style={{ color: "inherit", textDecoration: "none" }}>
                    <strong>{conv.other.name}</strong>
                  </Link>
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
            )}
            {deletingConvId !== conv.id && (
              <button
                type="button"
                className="messages-conv-item__delete"
                onClick={(e) => { e.stopPropagation(); setDeletingConvId(conv.id); }}
                title={t("delete_conversation")}
              >
                🗑
              </button>
            )}
          </div>
        ))}
      </aside>

      {/* Main thread */}
      <main className="messages-thread">
        {activeConv && (
          <>
            <div className="messages-thread__header">
              <Link href={`/player/${activeConv.other.slug ?? activeConv.other.id}`} style={{ color: "inherit", textDecoration: "none" }}>
                <strong style={{ cursor: "pointer" }}>{activeConv.other.name}</strong>
              </Link>
            </div>

            <div className="messages-thread__body" ref={bodyRef}>
              {loadingMsgs && <p className="meta" style={{ textAlign: "center" }}>{t("loading")}</p>}
              {messages.map((msg) => {
                const mine = msg.authorId === currentPlayerId;
                return (
                  <div
                    key={msg.id}
                    className={`message-bubble${mine ? " message-bubble--mine" : ""}`}
                  >
                    {editingId === msg.id ? (
                      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); editMessage(msg.id); } }}
                          rows={2}
                          maxLength={2000}
                          style={{ flex: 1, resize: "none", fontSize: 13 }}
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
                            <button type="button" onClick={() => { setEditingId(msg.id); setEditContent(msg.content); }}>{t("edit_message")}</button>
                            <button type="button" onClick={() => deleteMessage(msg.id)}>{t("delete_message")}</button>
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
      </main>
    </div>
    </>
  );
}
