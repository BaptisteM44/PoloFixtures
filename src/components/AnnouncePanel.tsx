"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

type Props = {
  tournamentId: string;
};

export function AnnouncePanel({ tournamentId }: Props) {
  const t = useTranslations("tournament");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [target, setTarget] = useState<"captains" | "all">("captains");
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "error">("idle");
  const [result, setResult] = useState<{ sent: number; errors: string[] } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetLabel = target === "captains" ? t("announce_confirm_captains") : t("announce_confirm_all");
    if (!confirm(t("announce_confirm", { target: targetLabel }))) return;
    setStatus("sending");
    setResult(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/announce`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, message, target }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ sent: data.sent, errors: data.errors ?? [] });
        setStatus("ok");
        setSubject("");
        setMessage("");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="panel">
      <h3 style={{ fontFamily: "var(--font-display)", fontSize: 16, marginBottom: 4 }}>
        📢 {t("announce_title")}
      </h3>
      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
        {t("announce_subtitle")}
      </p>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 16 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
            <input
              type="radio"
              name="target"
              value="captains"
              checked={target === "captains"}
              onChange={() => setTarget("captains")}
            />
            {t("announce_target_captains")}
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
            <input
              type="radio"
              name="target"
              value="all"
              checked={target === "all"}
              onChange={() => setTarget("all")}
            />
            {t("announce_target_all")}
          </label>
        </div>

        <label className="field-row">
          {t("announce_subject")}
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={t("announce_subject_placeholder")}
            required
            minLength={3}
          />
        </label>

        <label className="field-row">
          {t("announce_message")}
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            placeholder={t("announce_message_placeholder")}
            required
            minLength={10}
          />
        </label>

        {status === "error" && (
          <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>
            {t("announce_error")}
          </p>
        )}

        {status === "ok" && result && (
          <p style={{ color: "var(--success, green)", fontSize: 13, margin: 0 }}>
            ✅ {result.sent} email{result.sent > 1 ? "s" : ""} {result.sent > 1 ? "envoyés" : "envoyé"}.
            {result.errors.length > 0 && ` (${result.errors.length} échec${result.errors.length > 1 ? "s" : ""})`}
          </p>
        )}

        <div>
          <button type="submit" className="primary" disabled={status === "sending"} style={{ width: "auto" }}>
            {status === "sending" ? t("announce_sending") : t("announce_send")}
          </button>
        </div>
      </form>
    </div>
  );
}
