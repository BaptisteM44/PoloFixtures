"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { COUNTRIES } from "@/lib/countries";
import { ClubPicker } from "@/components/ClubPicker";

export default function RegisterPage() {
  const t = useTranslations("auth");
  const ta = useTranslations("account");
  const tc = useTranslations("common");
  const [form, setForm] = useState({ name: "", email: "", password: "", country: "FR", city: "" });
  const [charterAccepted, setCharterAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [charterError, setCharterError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"register" | "club">("register");

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  // Resolve country name from code for the ClubPicker
  const countryName = COUNTRIES.find((c) => c.code === form.country)?.name ?? form.country;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!charterAccepted) { setCharterError(true); return; }
    setError(null);
    setCharterError(false);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, charterAccepted: true })
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

      // Go to club step instead of redirecting
      setStep("club");
    } finally {
      setLoading(false);
    }
  };

  const handleJoinClub = async (clubId: string) => {
    await fetch("/api/clubs/by-city", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clubId }),
    });
  };

  const handleCreateClub = async (data: { name: string; city: string; country: string }) => {
    await fetch("/api/clubs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  };

  const goToAccount = () => {
    window.location.href = "/account";
  };

  if (step === "club") {
    return (
      <div className="login-page">
        <div style={{ width: "100%", maxWidth: 480 }}>
          <div style={{ marginBottom: 24 }}>
            <h1>{t("section_club")}</h1>
            <p style={{ color: "var(--text-muted)", fontSize: 14 }}>{t("section_club_hint")}</p>
          </div>
          <div className="panel" style={{ padding: "20px 24px", display: "grid", gap: 16 }}>
            <ClubPicker
              country={countryName}
              onJoin={handleJoinClub}
              onCreate={handleCreateClub}
              namespace="account"
            />
            <button
              type="button"
              className="primary"
              onClick={goToAccount}
              style={{ width: "100%", justifyContent: "center" }}
            >
              {t("skip_club")} →
            </button>
          </div>
        </div>
      </div>
    );
  }

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

          <div>
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", fontSize: 13 }}>
              <input
                type="checkbox"
                checked={charterAccepted}
                onChange={(e) => { setCharterAccepted(e.target.checked); if (e.target.checked) setCharterError(false); }}
                style={{ accentColor: "var(--teal)", width: 16, height: 16, marginTop: 2, flexShrink: 0 }}
              />
              <span style={{ color: charterError ? "var(--danger)" : "var(--text-muted)", lineHeight: 1.4 }}>
                {t("charter_accept_label_pre")}{" "}
                <a href="/legal/terms" target="_blank" rel="noopener noreferrer" style={{ color: "var(--teal)" }}>{t("charter_accept_cgu")}</a>
                {", "}
                <a href="/legal/privacy" target="_blank" rel="noopener noreferrer" style={{ color: "var(--teal)" }}>{t("charter_accept_privacy")}</a>
                {" "}{t("charter_accept_label_post")}{" "}
                <a href="/legal/charter" target="_blank" rel="noopener noreferrer" style={{ color: "var(--teal)" }}>{t("charter_accept_charter_link")}</a>
              </span>
            </label>
            {charterError && (
              <p style={{ margin: "6px 0 0 26px", fontSize: 12, color: "var(--danger)" }}>
                {t("charter_required")}
              </p>
            )}
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
