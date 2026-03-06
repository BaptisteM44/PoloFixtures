"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

export default function ResetPasswordPage({ params }: { params: { token: string } }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError(t("reset_error_mismatch"));
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: params.token, password }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? t("reset_error_invalid"));
      return;
    }
    router.push("/login?reset=1" as any);
  }

  return (
    <div style={{ maxWidth: 420, margin: "80px auto" }}>
      <div className="panel">
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>{t("reset_title")}</h1>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label className="field-row">
            {t("reset_field_password")}
            <input
              type="password"
              required
              minLength={8}
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8 car. minimum"
            />
          </label>
          <label className="field-row">
            {t("reset_field_confirm")}
            <input
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Répéter"
            />
          </label>
          {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}
          <button type="submit" className="primary" disabled={loading}>
            {loading ? "Enregistrement…" : t("reset_btn")}
          </button>
          <Link href="/login" className="ghost" style={{ textAlign: "center", fontSize: 13 }}>
            {t("link_back_login")}
          </Link>
        </form>
      </div>
    </div>
  );
}
