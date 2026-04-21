"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  sendClubMessageAction,
  deleteClubMessageAction,
} from "@/app/[locale]/club/[id]/actions";

type Message = {
  id: string;
  content: string;
  createdAt: string;
  player: { id: string; name: string };
};

const CHAT_COLORS = [
  "#e53935", "#8e24aa", "#1e88e5", "#43a047",
  "#f4511e", "#6d4c41", "#00897b", "#3949ab",
  "#d81b60", "#7cb342", "#fb8c00", "#5e35b1",
];

function hashColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  return CHAT_COLORS[Math.abs(hash) % CHAT_COLORS.length];
}

function fmtTime(d: Date, locale: string) {
  return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

function fmtDay(d: Date, locale: string) {
  return d.toLocaleDateString(locale, { day: "numeric", month: "short" });
}

export function ClubChat({
  clubId,
  messages: initialMessages,
  currentPlayerId,
  isAdmin,
}: {
  clubId: string;
  messages: Message[];
  currentPlayerId: string | null;
  isAdmin: boolean;
}) {
  const t = useTranslations("club");
  const locale = useLocale();
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [isPending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Poll for new messages
  useEffect(() => {
    const interval = setInterval(async () => {
      const res = await fetch(`/api/clubs/${clubId}/messages`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [clubId]);

  function handleSend() {
    if (!input.trim()) return;
    startTransition(async () => {
      const res = await sendClubMessageAction(clubId, input);
      if ("ok" in res) {
        setInput("");
        // Refetch
        const r = await fetch(`/api/clubs/${clubId}/messages`);
        if (r.ok) setMessages(await r.json());
      }
    });
  }

  function handleDelete(messageId: string) {
    startTransition(async () => {
      await deleteClubMessageAction(clubId, messageId);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="club-chat">
      <div className="club-chat__messages" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="empty-state" style={{ padding: 32 }}>
            <p>{t("chat_empty")}</p>
          </div>
        ) : (
          messages.map((m, i) => {
            const d = new Date(m.createdAt);
            const prevD = i > 0 ? new Date(messages[i - 1].createdAt) : null;
            const showDate = !prevD || d.toDateString() !== prevD.toDateString();
            const isMine = m.player.id === currentPlayerId;
            const color = hashColor(m.player.id);

            return (
              <div key={m.id}>
                {showDate && (
                  <div className="club-chat__date-sep">{fmtDay(d, locale)}</div>
                )}
                <div className={`club-chat__msg${isMine ? " club-chat__msg--mine" : ""}`}>
                  <div
                    className="club-chat__msg-bubble"
                    style={{ "--author-color": color } as React.CSSProperties}
                  >
                    <div className="club-chat__msg-header">
                      <strong style={{ color }}>{m.player.name}</strong>
                      <span className="club-chat__msg-time">{fmtTime(d, locale)}</span>
                    </div>
                    <p>{m.content}</p>
                  </div>
                  {(isMine || isAdmin) && (
                    <button
                      className="club-chat__delete-btn"
                      onClick={() => handleDelete(m.id)}
                      disabled={isPending}
                      title={t("chat_delete_title")}
                    >✕</button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {currentPlayerId ? (
        <div className="club-chat__input-bar">
          <input
            className="form-input"
            placeholder={t("chat_placeholder")}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isPending}
          />
          <button className="primary" onClick={handleSend} disabled={isPending || !input.trim()}>
            {t("chat_send")}
          </button>
        </div>
      ) : (
        <p style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: 16 }}>
          {t("chat_login_prompt")}
        </p>
      )}
    </div>
  );
}
