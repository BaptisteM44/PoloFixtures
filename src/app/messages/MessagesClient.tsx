"use client";

import { useState, useEffect, useRef } from "react";

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
  author: { id: string; name: string; photoPath: string | null };
};

function formatRelative(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `il y a ${diffH}h`;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export function MessagesClient({
  conversations,
  currentPlayerId,
}: {
  conversations: ConvSummary[];
  currentPlayerId: string;
}) {
  const [activeId, setActiveId] = useState<string | null>(
    conversations[0]?.id ?? null
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [convList, setConvList] = useState(conversations);
  const bottomRef = useRef<HTMLDivElement>(null);

  const activeConv = convList.find((c) => c.id === activeId) ?? null;

  // Load messages when active conversation changes
  useEffect(() => {
    if (!activeId) return;
    setLoadingMsgs(true);
    fetch(`/api/direct-conversations/${activeId}/messages`)
      .then((r) => r.json())
      .then((data) => {
        setMessages(data);
        // Mark as read in UI
        setConvList((prev) =>
          prev.map((c) => (c.id === activeId ? { ...c, unread: 0 } : c))
        );
      })
      .finally(() => setLoadingMsgs(false));
  }, [activeId]);

  // Poll for new messages every 10s
  useEffect(() => {
    if (!activeId) return;
    const interval = setInterval(() => {
      fetch(`/api/direct-conversations/${activeId}/messages`)
        .then((r) => r.json())
        .then(setMessages);
    }, 10000);
    return () => clearInterval(interval);
  }, [activeId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    if (!activeId || !input.trim() || sending) return;
    setSending(true);
    const res = await fetch(`/api/direct-conversations/${activeId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: input.trim() }),
    });
    if (res.ok) {
      const msg: Message = await res.json();
      setMessages((prev) => [...prev, msg]);
      // Update last message in sidebar
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

  if (convList.length === 0) {
    return (
      <div className="empty-state">
        <p>Aucune conversation pour l&apos;instant.</p>
        <p className="meta">Tu peux contacter des free agents depuis la page d&apos;un tournoi.</p>
      </div>
    );
  }

  return (
    <div className="messages-layout">
      {/* ── Sidebar — conversation list ── */}
      <aside className="messages-sidebar">
        {convList.map((conv) => (
          <button
            key={conv.id}
            type="button"
            className={`messages-conv-item${conv.id === activeId ? " messages-conv-item--active" : ""}`}
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
              <strong>{conv.other.name}</strong>
              {conv.lastMessage && (
                <span className="meta" style={{ fontSize: 12 }}>
                  {conv.lastMessage.authorId === currentPlayerId ? "Toi : " : ""}
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
        ))}
      </aside>

      {/* ── Main — message thread ── */}
      <main className="messages-thread">
        {activeConv && (
          <>
            <div className="messages-thread__header">
              <strong>{activeConv.other.name}</strong>
            </div>

            <div className="messages-thread__body">
              {loadingMsgs && <p className="meta" style={{ textAlign: "center" }}>Chargement…</p>}
              {messages.map((msg) => {
                const mine = msg.authorId === currentPlayerId;
                return (
                  <div
                    key={msg.id}
                    className={`message-bubble${mine ? " message-bubble--mine" : ""}`}
                  >
                    <p>{msg.content}</p>
                    <span className="meta" style={{ fontSize: 11 }}>
                      {formatRelative(msg.createdAt)}
                    </span>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            <div className="messages-thread__input">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                }}
                placeholder="Ton message… (Entrée pour envoyer)"
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
                {sending ? "…" : "Envoyer"}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
