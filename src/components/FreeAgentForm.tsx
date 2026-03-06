"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

export function FreeAgentForm({ tournamentId }: { tournamentId: string }) {
  const t = useTranslations("free_agent");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "error">("idle");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("sending");
    const res = await fetch("/api/free-agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tournamentId, name, email, city, country, notes })
    });
    if (res.ok) {
      setStatus("ok");
      setName(""); setEmail(""); setCity(""); setCountry(""); setNotes("");
    } else {
      setStatus("error");
    }
  };

  if (status === "ok") {
    return (
      <div className="free-agent-success">
        <span>✅</span>
        <div>
          <strong>{t("success_title")}</strong>
          <p>{t("success_desc")}</p>
        </div>
        <button type="button" className="ghost" style={{ alignSelf: "center" }} onClick={() => setStatus("idle")}>
          {t("btn_new")}
        </button>
      </div>
    );
  }

  return (
    <form className="free-agent-form" onSubmit={submit}>
      <div className="free-agent-form__row">
        <label className="field-row">
          {t("field_name")}
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("field_name_placeholder")} required />
        </label>
        <label className="field-row">
          {t("field_email")}
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("field_email_placeholder")} required />
        </label>
      </div>
      <div className="free-agent-form__row">
        <label className="field-row">
          {t("field_city")}
          <input value={city} onChange={(e) => setCity(e.target.value)} placeholder={t("field_city_placeholder")} />
        </label>
        <label className="field-row">
          {t("field_country")}
          <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="FR" />
        </label>
      </div>
      <label className="field-row">
        {t("field_notes")} <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{t("field_notes_hint")}</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder={t("field_notes_placeholder")} />
      </label>
      {status === "error" && (
        <p className="error" style={{ margin: 0 }}>{t("error")}</p>
      )}
      <div>
        <button type="submit" className="primary" disabled={status === "sending"} style={{ width: "auto" }}>
          {status === "sending" ? t("btn_sending") : t("btn_submit")}
        </button>
      </div>
    </form>
  );
}
