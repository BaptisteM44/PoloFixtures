"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

export function ContactAdminModal() {
  const t = useTranslations("contact");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const reset = () => {
    setName(""); setEmail(""); setSubject(""); setMessage("");
    setStatus("idle"); setErrorMsg("");
  };

  const handleClose = () => { setOpen(false); reset(); };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg("");
    try {
      const res = await fetch("/api/contact-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, subject, message }),
      });
      if (res.ok) {
        setStatus("ok");
      } else {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.error ?? t("error_invalid"));
        setStatus("error");
      }
    } catch {
      setErrorMsg(t("error_invalid"));
      setStatus("error");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: "var(--text-muted)", fontSize: 13, padding: 0,
          textDecoration: "underline", textDecorationStyle: "dotted",
        }}
      >
        {t("btn_open")}
      </button>

      {open && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 9000,
            background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 16,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
          <div style={{
            background: "var(--surface)", borderRadius: "var(--radius)",
            border: "2px solid var(--border)", boxShadow: "var(--shadow-lg)",
            width: "100%", maxWidth: 480, padding: 28,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontFamily: "var(--font-display)" }}>{t("modal_title")}</h3>
              <button
                type="button" onClick={handleClose}
                style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "var(--text-muted)", lineHeight: 1 }}
              >✕</button>
            </div>

            {status === "ok" ? (
              <div style={{ textAlign: "center", padding: "24px 0" }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
                <h4 style={{ margin: "0 0 8px" }}>{t("success_title")}</h4>
                <p className="meta" style={{ margin: "0 0 20px" }}>{t("success_desc")}</p>
                <button className="primary" onClick={handleClose}>{t("btn_close")}</button>
              </div>
            ) : (
              <form onSubmit={send} style={{ display: "grid", gap: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <label className="field-row">
                    {t("field_name")}
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("field_name_placeholder")} required />
                  </label>
                  <label className="field-row">
                    {t("field_email")}
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("field_email_placeholder")} required />
                  </label>
                </div>
                <label className="field-row">
                  {t("field_subject")}
                  <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t("field_subject_placeholder")} required />
                </label>
                <label className="field-row">
                  {t("field_message")}
                  <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} placeholder={t("field_message_placeholder")} required style={{ resize: "vertical" }} />
                </label>
                {status === "error" && (
                  <p className="error" style={{ margin: 0 }}>{errorMsg}</p>
                )}
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button type="button" className="ghost" onClick={handleClose}>{t("btn_cancel")}</button>
                  <button type="submit" className="primary" disabled={status === "sending"}>
                    {status === "sending" ? t("btn_send") + "…" : t("btn_send")}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
