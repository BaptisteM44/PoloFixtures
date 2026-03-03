"use client";

import { useState } from "react";

export function FreeAgentForm({ tournamentId }: { tournamentId: string }) {
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
          <strong>Demande envoyée !</strong>
          <p>Les organisateurs ont été notifiés.</p>
        </div>
        <button type="button" className="ghost" style={{ alignSelf: "center" }} onClick={() => setStatus("idle")}>
          Nouvelle demande
        </button>
      </div>
    );
  }

  return (
    <form className="free-agent-form" onSubmit={submit}>
      <div className="free-agent-form__row">
        <label className="field-row">
          Nom *
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ton nom" required />
        </label>
        <label className="field-row">
          Email *
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="toi@exemple.com" required />
        </label>
      </div>
      <div className="free-agent-form__row">
        <label className="field-row">
          Ville
          <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Paris" />
        </label>
        <label className="field-row">
          Pays
          <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="FR" />
        </label>
      </div>
      <label className="field-row">
        Notes <span style={{ color: "var(--text-muted)", fontSize: 12 }}>(niveau, préférences…)</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Je joue depuis 3 ans, j'ai mon vélo…" />
      </label>
      {status === "error" && (
        <p className="error" style={{ margin: 0 }}>Une erreur est survenue, réessaie.</p>
      )}
      <div>
        <button type="submit" className="primary" disabled={status === "sending"} style={{ width: "auto" }}>
          {status === "sending" ? "Envoi…" : "Envoyer ma demande"}
        </button>
      </div>
    </form>
  );
}
