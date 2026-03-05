"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function ResetPasswordPage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Les mots de passe ne correspondent pas");
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
      setError(data.error ?? "Lien invalide ou expiré");
      return;
    }
    router.push("/login?reset=1");
  }

  return (
    <div style={{ maxWidth: 420, margin: "80px auto" }}>
      <div className="panel">
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>Nouveau mot de passe</h1>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label className="field-row">
            Nouveau mot de passe
            <input
              type="password"
              required
              minLength={8}
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8 caractères minimum"
            />
          </label>
          <label className="field-row">
            Confirmer
            <input
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Répéter le mot de passe"
            />
          </label>
          {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}
          <button type="submit" className="primary" disabled={loading}>
            {loading ? "Enregistrement…" : "Enregistrer"}
          </button>
          <Link href="/login" className="ghost" style={{ textAlign: "center", fontSize: 13 }}>
            Retour à la connexion
          </Link>
        </form>
      </div>
    </div>
  );
}
