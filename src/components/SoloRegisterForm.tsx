"use client";

import { useState, useEffect } from "react";

const LEVELS = ["C", "C+", "B-", "B", "B+", "A-", "A", "A+"] as const;
type Level = typeof LEVELS[number];

type RegistrationField = {
  id: string;
  label: string;
  required: boolean;
  target: "PLAYER" | "TEAM" | "CAPTAIN";
  order: number;
};

function getLevelTier(level: string): "A" | "B" | "C" {
  const score: Record<string, number> = { "C": 1, "C+": 2, "B-": 3, "B": 4, "B+": 5, "A-": 6, "A": 7, "A+": 8 };
  const s = score[level] ?? 4;
  if (s >= 6) return "A";
  if (s >= 3) return "B";
  return "C";
}

export function SoloRegisterForm({
  tournamentId,
  currentPlayerId,
  maxSoloPlayers,
  soloCount,
  alreadyRegistered,
  alreadyLevel,
}: {
  tournamentId: string;
  currentPlayerId: string | null;
  maxSoloPlayers: number | null;
  soloCount: number;
  alreadyRegistered: boolean;
  alreadyLevel: string | null;
}) {
  const [level, setLevel] = useState<Level>("B");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registered, setRegistered] = useState(alreadyRegistered);
  const [registeredLevel, setRegisteredLevel] = useState(alreadyLevel);
  const [waitlisted, setWaitlisted] = useState(false);
  const [currentCount, setCurrentCount] = useState(soloCount);

  // Questionnaire d'inscription — seuls les champs PLAYER concernent un
  // joueur individuel (pas d'équipe ni de capitaine en inscription solo).
  const [regFields, setRegFields] = useState<RegistrationField[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch(`/api/tournaments/${tournamentId}/registration-fields`)
      .then((r) => r.json())
      .then((fields: RegistrationField[]) =>
        setRegFields(fields.filter((f) => f.target === "PLAYER").sort((a, b) => a.order - b.order))
      )
      .catch(() => {});
  }, [tournamentId]);

  const isFull = maxSoloPlayers !== null && currentCount >= maxSoloPlayers;

  const handleRegister = async () => {
    if (!currentPlayerId) return;
    // Vérifie les champs obligatoires avant l'envoi.
    const missing = regFields.find((f) => f.required && !(answers[f.id] ?? "").trim());
    if (missing) {
      setError(`Champ obligatoire manquant : « ${missing.label} »`);
      return;
    }
    setLoading(true);
    setError(null);
    const answersPayload = regFields
      .map((f) => ({ fieldId: f.id, value: (answers[f.id] ?? "").trim() }))
      .filter((a) => a.value);
    const res = await fetch(`/api/tournaments/${tournamentId}/solo-register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level, ...(answersPayload.length > 0 ? { answers: answersPayload } : {}) }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Une erreur est survenue.");
      return;
    }
    const data = await res.json();
    setRegistered(true);
    setRegisteredLevel(level);
    setWaitlisted(data.waitlisted);
    setCurrentCount((c) => c + 1);
  };

  const handleUnregister = async () => {
    if (!currentPlayerId) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/solo-register`, { method: "DELETE" });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Une erreur est survenue.");
      return;
    }
    setRegistered(false);
    setRegisteredLevel(null);
    setWaitlisted(false);
    setCurrentCount((c) => Math.max(0, c - 1));
  };

  if (!currentPlayerId) {
    return (
      <div className="panel" style={{ padding: "20px 24px", marginTop: 16 }}>
        <p className="meta">Connectez-vous pour vous inscrire individuellement.</p>
      </div>
    );
  }

  return (
    <div className="panel" style={{ padding: "20px 24px", marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15 }}>
          Inscription individuelle
        </span>
        <span className="meta" style={{ fontSize: 12 }}>
          {maxSoloPlayers !== null
            ? `${currentCount} / ${maxSoloPlayers} inscrits`
            : `${currentCount} inscrit${currentCount > 1 ? "s" : ""}`}
        </span>
        {maxSoloPlayers !== null && isFull && !registered && (
          <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "var(--font-display)", color: "var(--orange)", background: "color-mix(in srgb, var(--orange) 15%, var(--surface))", padding: "2px 8px", borderRadius: 4, border: "1.5px solid var(--orange)" }}>
            Complet — liste d&apos;attente
          </span>
        )}
      </div>

      {registered ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14 }}>
            Vous êtes inscrit en niveau{" "}
            <span className="level-badge" data-level={registeredLevel ? getLevelTier(registeredLevel) : "B"}>
              {registeredLevel}
            </span>
            {waitlisted && (
              <span style={{ marginLeft: 8, fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
                (liste d&apos;attente)
              </span>
            )}
          </span>
          <button
            className="ghost"
            style={{ fontSize: 12, padding: "4px 12px", color: "var(--danger)", borderColor: "var(--danger)" }}
            onClick={handleUnregister}
            disabled={loading}
          >
            {loading ? "…" : "Se désinscrire"}
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
            Mon niveau :
            <select value={level} onChange={(e) => setLevel(e.target.value as Level)} style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
              {LEVELS.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </label>

          {/* Questionnaire d'inscription (champs PLAYER) */}
          {regFields.map((field) => (
            <label key={field.id} className="field-row" style={{ fontSize: 13 }}>
              {field.label}{field.required && <span style={{ color: "var(--danger, #e53e3e)", marginLeft: 2 }}>*</span>}
              <input
                value={answers[field.id] ?? ""}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [field.id]: e.target.value }))}
                required={field.required}
                maxLength={500}
                style={{ fontSize: 13 }}
              />
            </label>
          ))}

          <button
            className="primary"
            onClick={handleRegister}
            disabled={loading}
            style={{ fontSize: 13, alignSelf: "flex-start" }}
          >
            {loading ? "…" : isFull ? "S'inscrire (liste d'attente)" : "S'inscrire"}
          </button>
        </div>
      )}

      {error && <p className="error" style={{ marginTop: 10 }}>{error}</p>}
    </div>
  );
}
