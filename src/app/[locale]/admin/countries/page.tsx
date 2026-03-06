"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AdminNav } from "@/components/AdminNav";

type Country = { id: string; code: string; name: string };

export default function AdminCountriesPage() {
  const t = useTranslations("admin");
  const [countries, setCountries] = useState<Country[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = () => {
    fetch("/api/admin/known-countries")
      .then((res) => res.json())
      .then((data) => Array.isArray(data) && setCountries(data));
  };

  useEffect(() => {
    load();
  }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (code.trim().length !== 2) {
      setError(t("error_code_length"));
      return;
    }
    if (name.trim().length < 2) {
      setError(t("error_name_short"));
      return;
    }
    setLoading(true);
    const res = await fetch("/api/admin/known-countries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.trim().toUpperCase(), name: name.trim() }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error?.formErrors?.[0] ?? data?.error ?? `Erreur ${res.status}`);
      return;
    }
    setCode("");
    setName("");
    load();
  };

  const remove = async (countryCode: string) => {
    if (!confirm(`Supprimer ${countryCode} ?`)) return;
    await fetch("/api/admin/known-countries", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: countryCode }),
    });
    load();
  };

  return (
    <div className="admin-page">
      <h1>{t("countries_title")}</h1>
      <AdminNav />
      <div className="panel" style={{ marginTop: 24 }}>
        <h3 style={{ marginBottom: 12 }}>{t("countries_add")}</h3>
        <form onSubmit={add} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label className="field-row" style={{ flex: "0 0 100px" }}>
            {t("country_code_label")} <span className="meta">({t("country_code_hint")})</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="FR"
              maxLength={2}
              style={{ textTransform: "uppercase" }}
            />
          </label>
          <label className="field-row" style={{ flex: "1 1 200px" }}>
            {t("country_name_label")}
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="France"
            />
          </label>
          <button type="submit" className="primary" disabled={loading} style={{ alignSelf: "flex-end", marginBottom: 0 }}>
            {loading ? t("btn_adding") : t("btn_add")}
          </button>
        </form>
        {error && <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 8 }}>{error}</p>}
      </div>
      <div className="panel" style={{ marginTop: 16 }}>
        <h3 style={{ marginBottom: 12 }}>{t("countries_list", { count: countries.length })}</h3>
        {countries.length === 0 ? (
          <p className="meta">{t("countries_empty")}</p>
        ) : (
          countries.map((c) => (
            <div key={c.id} className="moderation-row">
              <div>{c.name} <span className="meta">({c.code})</span></div>
              <button className="ghost" style={{ color: "var(--danger)", fontSize: 13 }} onClick={() => remove(c.code)}>
                {t("btn_delete")}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
