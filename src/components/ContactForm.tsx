"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

export function ContactForm() {
  const t = useTranslations("about");
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "error">("idle");

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("sending");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setStatus("ok");
        setForm({ name: "", email: "", subject: "", message: "" });
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  if (status === "ok") {
    return (
      <div style={{ textAlign: "center", padding: "48px 24px" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
        <h3 style={{ fontFamily: "var(--font-display)", fontSize: 22, marginBottom: 8 }}>{t("contact_sent_title")}</h3>
        <p className="meta">{t("contact_sent_desc")}</p>
        <button className="ghost" style={{ marginTop: 20, fontSize: 13 }} onClick={() => setStatus("idle")}>
          {t("contact_send_another")}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
            {t("contact_name")}
          </label>
          <input
            type="text"
            value={form.name}
            onChange={set("name")}
            placeholder="Baptiste"
            required
            style={{ width: "100%" }}
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
            {t("contact_email")}
          </label>
          <input
            type="email"
            value={form.email}
            onChange={set("email")}
            placeholder="polo@example.com"
            required
            style={{ width: "100%" }}
          />
        </div>
      </div>

      <div>
        <label style={{ display: "block", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
          {t("contact_subject")}
        </label>
        <select value={form.subject} onChange={set("subject")} required style={{ width: "100%" }}>
          <option value="">{t("contact_subject_placeholder")}</option>
          <option value="Suggestion">{t("contact_subject_suggestion")}</option>
          <option value="Bug">{t("contact_subject_bug")}</option>
          <option value="Organiser un tournoi">{t("contact_subject_tournament")}</option>
          <option value="Autre">{t("contact_subject_other")}</option>
        </select>
      </div>

      <div>
        <label style={{ display: "block", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
          {t("contact_message")}
        </label>
        <textarea
          value={form.message}
          onChange={set("message")}
          placeholder={t("contact_message_placeholder")}
          required
          rows={5}
          minLength={10}
          maxLength={3000}
          style={{ width: "100%", resize: "vertical" }}
        />
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{form.message.length}/3000</span>
      </div>

      {status === "error" && (
        <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{t("contact_error")}</p>
      )}

      <div>
        <button type="submit" className="primary" disabled={status === "sending"} style={{ fontSize: 14, padding: "10px 28px" }}>
          {status === "sending" ? t("contact_sending") : t("contact_submit")}
        </button>
      </div>
    </form>
  );
}
