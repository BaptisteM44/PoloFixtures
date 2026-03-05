"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
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
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>Mot de passe oublié</h1>

        {done ? (
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <p style={{ fontSize: 15 }}>
              Si cette adresse est associée à un compte, un lien de réinitialisation vient d&apos;être envoyé. Vérifiez votre boîte mail (et les spams).
            </p>
            <Link className="ghost" href="/login" style={{ marginTop: 20, display: "inline-flex" }}>
              Retour à la connexion
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p className="meta" style={{ marginBottom: 4 }}>
              Entrez votre adresse email pour recevoir un lien de réinitialisation.
            </p>
            <label className="field-row">
              Email
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vous@example.com"
              />
            </label>
            {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}
            <button type="submit" className="primary" disabled={loading}>
              {loading ? "Envoi…" : "Envoyer le lien"}
            </button>
            <Link href="/login" className="ghost" style={{ textAlign: "center", fontSize: 13 }}>
              Retour à la connexion
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
