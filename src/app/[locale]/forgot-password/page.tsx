"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

export default function ForgotPasswordPage() {
  const t = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Erreur");
      return;
    }
    setDone(true);
  }

  return (
    <div style={{ maxWidth: 420, margin: "80px auto" }}>
      <div className="panel">
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>{t("forgot_title")}</h1>

        {done ? (
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <p style={{ fontSize: 15 }}>{t("forgot_sent")}</p>
            <Link className="ghost" href="/login" style={{ marginTop: 20, display: "inline-flex" }}>
              {t("link_back_login")}
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p className="meta" style={{ marginBottom: 4 }}>{t("forgot_subtitle")}</p>
            <label className="field-row">
              {t("field_email")}
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("field_email_placeholder")}
              />
            </label>
            {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}
            <button type="submit" className="primary" disabled={loading}>
              {loading ? "…" : t("forgot_btn_send")}
            </button>
            <Link href="/login" className="ghost" style={{ textAlign: "center", fontSize: 13 }}>
              {t("link_back_login")}
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
