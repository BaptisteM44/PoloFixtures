"use client";

import { useState, useEffect, useRef, useCallback } from "react";

type Author = { id: string; name: string; photoPath: string | null };
type Message = { id: string; content: string; createdAt: string; author: Author; isOrga?: boolean };

type Props = {
  tournamentId: string;
  chatMode: "OPEN" | "ORG_ONLY" | "DISABLED";
  currentPlayerId: string | null;
  currentPlayerName: string | null;
  isOrga: boolean;
  creatorId: string | null;
  fullPage?: boolean;
};

const CHAT_COLORS = 12;

function authorColorIndex(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % CHAT_COLORS;
}

export function TournamentChat({ tournamentId, chatMode, currentPlayerId, currentPlayerName, isOrga, creatorId, fullPage }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);

  const canPost =
    chatMode !== "DISABLED" &&
    !!currentPlayerId &&
    (chatMode === "OPEN" || isOrga);

  const fetchMessages = useCallback(async () => {
    const res = await fetch(`/api/tournaments/${tournamentId}/messages`);
    if (res.ok) {
      const data: Message[] = await res.json();
      setMessages((prev) => {
        // Only update state if the message list actually changed
        if (prev.length === data.length && prev.length > 0 && prev[prev.length - 1].id === data[data.length - 1].id) {
          return prev;
        }
        return data;
      });
    }
    setLoading(false);
  }, [tournamentId]);

  useEffect(() => {
    fetchMessages();
    // Poll every 15s for new messages
    const interval = setInterval(fetchMessages, 15000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  useEffect(() => {
    // Only auto-scroll when new messages arrive, and scroll within the container only
    if (!loading && messages.length > prevMessageCountRef.current) {
      const container = messagesContainerRef.current;
      if (container) {
        container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
      }
    }
    prevMessageCountRef.current = messages.length;
  }, [messages, loading]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;
    setSending(true);
    setError(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    setSending(false);
    if (res.ok) {
      const msg: Message = await res.json();
      setMessages((prev) => [...prev, msg]);
      setText("");
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Erreur lors de l'envoi.");
    }
  };

  const handleDelete = async (messageId: string) => {
    const res = await fetch(`/api/tournaments/${tournamentId}/messages?messageId=${messageId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    }
  };

  if (chatMode === "DISABLED") return null;

  return (
    <div className={`tournament-chat ${fullPage ? "tournament-chat--full" : ""}`}>
      <div className="tournament-chat__header">
        <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 15 }}>
          💬 Discussion
        </h3>
        {chatMode === "ORG_ONLY" && (
          <span style={{ fontSize: 11, fontFamily: "var(--font-display)", fontWeight: 700, color: "var(--text-muted)", background: "var(--surface-2)", border: "1.5px solid var(--border-light)", borderRadius: 4, padding: "2px 8px" }}>
            ANNONCES · ORG ONLY
          </span>
        )}
      </div>

      <div className="tournament-chat__messages" ref={messagesContainerRef}>
        {loading && <p className="meta" style={{ textAlign: "center", padding: 16 }}>Chargement…</p>}
        {!loading && messages.length === 0 && (
          <p className="meta" style={{ textAlign: "center", padding: 16, margin: 0 }}>
            {chatMode === "ORG_ONLY" ? "Aucune annonce pour l'instant." : "Aucun message pour l'instant. Soyez le premier !"}
          </p>
        )}
        {messages.map((msg) => {
          const isMsgOrga = msg.isOrga || msg.author.id === creatorId || (msg.author.id === currentPlayerId && isOrga);
          return (
          <div
            key={msg.id}
            className={`tournament-chat__msg ${isMsgOrga ? "tournament-chat__msg--orga" : ""} ${msg.author.id === currentPlayerId ? "tournament-chat__msg--mine" : ""}`}
            style={{ "--author-color": `var(--chat-c${authorColorIndex(msg.author.id)})` } as React.CSSProperties}
          >
            <div className="tournament-chat__msg-meta">
              <span className="tournament-chat__msg-author">{msg.author.name}</span>
              <span className="tournament-chat__msg-time">
                {new Date(msg.createdAt).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            <div className="tournament-chat__msg-bubble">
              {msg.content}
              {isOrga && (
                <button
                  className="tournament-chat__msg-delete"
                  onClick={() => handleDelete(msg.id)}
                  title="Supprimer ce message"
                  type="button"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {canPost ? (
        <form className="tournament-chat__form" onSubmit={handleSend}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={chatMode === "ORG_ONLY" ? "Écrire une annonce…" : "Écrire un message…"}
            maxLength={1000}
            disabled={sending}
            style={{ flex: 1 }}
          />
          <button className="primary" type="submit" disabled={sending || !text.trim()} style={{ padding: "8px 18px", fontSize: 13, flexShrink: 0 }}>
            {sending ? "…" : "Envoyer"}
          </button>
        </form>
      ) : (
        <div className="tournament-chat__login-hint">
          {!currentPlayerId ? (
            <span className="meta">Connectez-vous pour participer à la discussion.</span>
          ) : chatMode === "ORG_ONLY" ? (
            <span className="meta">Seul l&apos;organisateur peut publier des annonces.</span>
          ) : null}
        </div>
      )}

      {error && <p className="error" style={{ margin: "4px 0 0", fontSize: 12 }}>{error}</p>}
    </div>
  );
}
