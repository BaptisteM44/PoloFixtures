"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { COUNTRIES } from "@/lib/countries";

export default function RegisterPage() {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const [form, setForm] = useState({ name: "", email: "", password: "", country: "FR", city: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await res.json();

      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : t("error_register_failed"));
        return;
      }

      const result = await signIn("player", {
        email: form.email,
        password: form.password,
        redirect: false
      });

      if (result?.error) {
        setError(t("error_login_after_register"));
        return;
      }

      window.location.href = "/account";
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div style={{ width: "100%", maxWidth: 440 }}>
        <div style={{ marginBottom: 24 }}>
          <h1>{t("register_title")}</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>{t("register_subtitle")}</p>
        </div>

        <form className="panel form" onSubmit={submit} style={{ display: "grid", gap: 16 }}>
          <label className="field-row">
            {t("field_full_name")}
            <input required value={form.name} onChange={set("name")} placeholder={t("field_full_name_placeholder")} />
          </label>
          <label className="field-row">
            {t("field_email")}
            <input required type="email" value={form.email} onChange={set("email")} placeholder={t("field_email_placeholder")} />
          </label>
          <label className="field-row">
            {t("field_password")} <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{t("field_password_hint")}</span>
            <input required type="password" value={form.password} onChange={set("password")} placeholder={t("field_password_placeholder")} />
          </label>
          <div className="form-grid">
            <label className="field-row">
              {t("field_country")}
              <select value={form.country} onChange={set("country")}>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
              </select>
            </label>
            <label className="field-row">
              {t("field_city")} <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{tc("optional")}</span>
              <input value={form.city} onChange={set("city")} placeholder={t("field_city_placeholder")} />
            </label>
          </div>

          {error && <p className="error">{error}</p>}

          <button className="primary" type="submit" disabled={loading} style={{ width: "100%", justifyContent: "center" }}>
            {loading ? t("btn_register_loading") : t("btn_register")}
          </button>

          <p style={{ textAlign: "center", fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
            {t("link_already_account")}{" "}
            <Link href="/login" style={{ color: "var(--teal)", fontWeight: 700 }}>{t("link_login")}</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
