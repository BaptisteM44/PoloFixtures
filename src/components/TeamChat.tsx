"use client";

import { useState, useEffect, useRef, useCallback } from "react";

type Author = { id: string; name: string; photoPath: string | null };
type Message = { id: string; content: string; createdAt: string; author: Author };

type Props = {
  teamId: string;
  currentPlayerId: string;
  teammates: { id: string; name: string }[];
};

const CHAT_COLORS = 12;

function authorColorIndex(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % CHAT_COLORS;
}

export function TeamChat({ teamId, currentPlayerId, teammates }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  const fetchMessages = useCallback(async () => {
    const res = await fetch(`/api/teams/${teamId}/messages`);
    if (res.ok) {
      const data: Message[] = await res.json();
      setMessages((prev) => {
        if (prev.length === data.length && prev.length > 0 && prev[prev.length - 1].id === data[data.length - 1].id) {
          return prev;
        }
        return data;
      });
    }
    setLoading(false);
  }, [teamId]);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 15000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  useEffect(() => {
    if (!loading && messages.length > prevCountRef.current) {
      const c = containerRef.current;
      if (c) c.scrollTo({ top: c.scrollHeight, behavior: "smooth" });
    }
    prevCountRef.current = messages.length;
  }, [messages, loading]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;
    setSending(true);
    setError(null);
    const res = await fetch(`/api/teams/${teamId}/messages`, {
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

  return (
    <div className="team-chat">
      <div className="team-chat__messages" ref={containerRef}>
        {loading && <p className="meta" style={{ textAlign: "center", padding: 16 }}>Chargement…</p>}
        {!loading && messages.length === 0 && (
          <p className="meta" style={{ textAlign: "center", padding: 16, margin: 0 }}>
            Aucun message. Lancez la discussion avec vos coéquipiers !
          </p>
        )}
        {messages.map((msg) => {
          const isMine = msg.author.id === currentPlayerId;
          return (
            <div
              key={msg.id}
              className={`team-chat__msg ${isMine ? "team-chat__msg--mine" : ""}`}
              style={{ "--author-color": `var(--chat-c${authorColorIndex(msg.author.id)})` } as React.CSSProperties}
            >
              <div className="team-chat__msg-meta">
                <span className="team-chat__msg-author">{msg.author.name}</span>
                <span className="team-chat__msg-time">
                  {new Date(msg.createdAt).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <div className="team-chat__msg-bubble">{msg.content}</div>
            </div>
          );
        })}
      </div>

      <form className="team-chat__form" onSubmit={handleSend}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Écrire un message…"
          maxLength={1000}
          disabled={sending}
          style={{ flex: 1 }}
        />
        <button className="primary" type="submit" disabled={sending || !text.trim()} style={{ padding: "8px 18px", fontSize: 13, flexShrink: 0 }}>
          {sending ? "…" : "Envoyer"}
        </button>
      </form>

      {error && <p className="error" style={{ margin: "4px 0 0", fontSize: 12 }}>{error}</p>}
    </div>
  );
}
