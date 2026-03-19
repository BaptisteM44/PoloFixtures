"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

type Props = {
  recipientId: string;
  recipientName: string;
  freeAgentId?: string;
};

export function ContactModal({ recipientId, recipientName, freeAgentId }: Props) {
  const t = useTranslations("contact_modal");
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "error">("idle");

  const send = async () => {
    if (!message.trim()) return;
    setStatus("sending");
    const res = await fetch("/api/direct-conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipientId, message, freeAgentId }),
    });
    if (res.ok) {
      setStatus("ok");
    } else {
      setStatus("error");
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        className="ghost"
        style={{ fontSize: 12, padding: "4px 10px" }}
        onClick={() => setOpen(true)}
      >
        {t("btn_contact")}
      </button>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
          zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
          padding: 16,
        }}
        onClick={(e) => { if (e.target === e.currentTarget) { setOpen(false); setStatus("idle"); setMessage(""); } }}
      >
        <div className="panel" style={{ width: "100%", maxWidth: 480, zIndex: 1001 }}>
          {status === "ok" ? (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <p style={{ fontSize: 24, marginBottom: 8 }}>✅</p>
              <p style={{ fontWeight: 700, marginBottom: 4 }}>{t("sent_title")}</p>
              <p className="meta" style={{ marginBottom: 20 }}>
                {t("sent_desc", { name: recipientName })}
              </p>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <a href="/messages" className="primary" style={{ fontSize: 14 }}>
                  {t("view_messages")}
                </a>
                <button
                  type="button"
                  className="ghost"
                  style={{ fontSize: 14 }}
                  onClick={() => { setOpen(false); setStatus("idle"); setMessage(""); }}
                >
                  {t("btn_close")}
                </button>
              </div>
            </div>
          ) : (
            <>
              <h3 style={{ marginBottom: 4 }}>{t("title", { name: recipientName })}</h3>
              <p className="meta" style={{ marginBottom: 16 }}>
                {t("desc")}
              </p>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder={t("placeholder", { name: recipientName })}
                style={{ width: "100%", resize: "vertical" }}
                autoFocus
              />
              <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end", alignItems: "center" }}>
                {status === "error" && (
                  <span className="meta" style={{ color: "var(--error)", flex: 1 }}>
                    {t("error_auth")}
                  </span>
                )}
                <button
                  type="button"
                  className="ghost"
                  onClick={() => { setOpen(false); setStatus("idle"); setMessage(""); }}
                >
                  {t("btn_cancel")}
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={status === "sending" || !message.trim()}
                  onClick={send}
                >
                  {status === "sending" ? t("btn_sending") : t("btn_send")}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
