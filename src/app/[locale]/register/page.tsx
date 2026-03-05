"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { COUNTRIES } from "@/lib/countries";

export default function RegisterPage() {
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
        setError(typeof data.error === "string" ? data.error : "Erreur lors de la création du compte.");
        return;
      }

      // Auto-login after registration
      const result = await signIn("player", {
        email: form.email,
        password: form.password,
        redirect: false
      });

      if (result?.error) {
        setError("Compte créé mais connexion échouée. Essaie de te connecter manuellement.");
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
          <h1>Créer un compte joueur</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
            Inscris-toi pour gérer ton profil et t&apos;inscrire aux tournois.
          </p>
        </div>

        <form className="panel form" onSubmit={submit} style={{ display: "grid", gap: 16 }}>
          <label className="field-row">
            Nom complet
            <input required value={form.name} onChange={set("name")} placeholder="Ton nom" />
          </label>
          <label className="field-row">
            Email
            <input required type="email" value={form.email} onChange={set("email")} placeholder="toi@exemple.com" />
          </label>
          <label className="field-row">
            Mot de passe <span style={{ color: "var(--text-muted)", fontSize: 12 }}>(min. 6 caractères)</span>
            <input required type="password" value={form.password} onChange={set("password")} placeholder="••••••" />
          </label>
          <div className="form-grid">
            <label className="field-row">
              Pays
              <select value={form.country} onChange={set("country")}>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
              </select>
            </label>
            <label className="field-row">
              Ville <span style={{ color: "var(--text-muted)", fontSize: 12 }}>(optionnel)</span>
              <input value={form.city} onChange={set("city")} placeholder="Paris" />
            </label>
          </div>

          {error && <p className="error">{error}</p>}

          <button className="primary" type="submit" disabled={loading} style={{ width: "100%", justifyContent: "center" }}>
            {loading ? "Création..." : "Créer mon compte"}
          </button>

          <p style={{ textAlign: "center", fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
            Déjà un compte ?{" "}
            <Link href="/login" style={{ color: "var(--teal)", fontWeight: 700 }}>Se connecter</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
