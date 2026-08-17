"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";

type GuestField = { key: string; label: string; required: boolean };
type ResultsMode = "IMMEDIATE" | "AT_DATE" | "AT_CLOSE" | "HIDDEN";
type PollListItem = {
  id: string; question: string; status: "DRAFT" | "OPEN" | "CLOSED";
  options: string[]; allowGuests: boolean; multipleChoice: boolean;
  showResults: ResultsMode; openAt: string | null; closeAt: string | null; resultsAt: string | null;
  _count: { ballots: number; voters: number };
};

const STATUS_LABEL: Record<string, string> = { DRAFT: "Brouillon", OPEN: "Ouvert", CLOSED: "Fermé" };
const STATUS_COLOR: Record<string, string> = { DRAFT: "var(--text-muted)", OPEN: "var(--teal)", CLOSED: "var(--danger)" };
const RESULTS_MODE_LABEL: Record<ResultsMode, string> = {
  IMMEDIATE: "Dès que le votant a voté",
  AT_DATE: "À partir d'une date précise",
  AT_CLOSE: "Seulement à la fermeture du sondage",
  HIDDEN: "Jamais (admin seulement)",
};

// Convertit un input <input type="datetime-local"> (heure locale, sans fuseau)
// en ISO UTC pour l'API, et inversement pour pré-remplir un champ existant.
function localToIso(local: string): string | null {
  if (!local) return null;
  return new Date(local).toISOString();
}
function isoToLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AdminPolls() {
  const [polls, setPolls] = useState<PollListItem[]>([]);
  const [loading, setLoading] = useState(true);

  // --- Formulaire de création ---
  const [question, setQuestion] = useState("");
  const [description, setDescription] = useState("");
  const [options, setOptions] = useState<string[]>(["Oui", "Non"]);
  const [multipleChoice, setMultipleChoice] = useState(false);
  const [allowGuests, setAllowGuests] = useState(true);
  const [guestFields, setGuestFields] = useState<GuestField[]>([]);
  const [openAt, setOpenAt] = useState("");
  const [closeAt, setCloseAt] = useState("");
  const [showResults, setShowResults] = useState<ResultsMode>("IMMEDIATE");
  const [resultsAt, setResultsAt] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/polls");
    if (res.ok) setPolls((await res.json()).polls);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    setError(null);
    const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
    if (question.trim().length < 3) { setError("Question trop courte."); return; }
    if (cleanOptions.length < 2) { setError("Il faut au moins 2 options."); return; }
    setCreating(true);
    try {
      const res = await fetch("/api/polls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question.trim(),
          description: description.trim() || null,
          options: cleanOptions,
          multipleChoice,
          allowGuests,
          guestFields: guestFields
            .filter((f) => f.key.trim() && f.label.trim())
            .map((f) => ({ key: f.key.trim(), label: f.label.trim(), required: f.required })),
          openAt: localToIso(openAt),
          closeAt: localToIso(closeAt),
          showResults,
          resultsAt: showResults === "AT_DATE" ? localToIso(resultsAt) : null,
        }),
      });
      if (!res.ok) { setError("Erreur à la création."); return; }
      // reset + reload
      setQuestion(""); setDescription(""); setOptions(["Oui", "Non"]);
      setGuestFields([]); setMultipleChoice(false); setAllowGuests(true);
      setOpenAt(""); setCloseAt(""); setShowResults("IMMEDIATE"); setResultsAt("");
      await load();
    } finally {
      setCreating(false);
    }
  };

  const setStatus = async (id: string, status: string) => {
    await fetch(`/api/polls/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Supprimer ce sondage et tous ses votes ?")) return;
    await fetch(`/api/polls/${id}`, { method: "DELETE" });
    load();
  };

  const setResultsMode = async (id: string, mode: ResultsMode) => {
    await fetch(`/api/polls/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ showResults: mode }),
    });
    load();
  };

  const copyLink = (id: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/poll/${id}`);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, marginTop: 16 }}>
      {/* ── Création ── */}
      <div className="panel" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        <h3 style={{ margin: 0 }}>Nouveau sondage</h3>
        <label style={{ fontSize: 13, display: "grid", gap: 4 }}>
          Question
          <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ex : Faut-il un championnat européen ?" />
        </label>
        <label style={{ fontSize: 13, display: "grid", gap: 4 }}>
          Description (optionnel)
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </label>

        {/* Options */}
        <div style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Réponses possibles</span>
          {options.map((opt, i) => (
            <div key={i} style={{ display: "flex", gap: 6 }}>
              <input
                value={opt}
                onChange={(e) => setOptions((prev) => prev.map((o, idx) => (idx === i ? e.target.value : o)))}
                style={{ flex: 1 }}
              />
              {options.length > 2 && (
                <button className="ghost" onClick={() => setOptions((prev) => prev.filter((_, idx) => idx !== i))}>✕</button>
              )}
            </div>
          ))}
          <button className="ghost" style={{ alignSelf: "start", fontSize: 13 }} onClick={() => setOptions((prev) => [...prev, ""])}>
            + Ajouter une réponse
          </button>
        </div>

        <label style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={multipleChoice} onChange={(e) => setMultipleChoice(e.target.checked)} />
          Plusieurs réponses possibles
        </label>
        <label style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={allowGuests} onChange={(e) => setAllowGuests(e.target.checked)} />
          Autoriser les non-inscrits (via email de confirmation)
        </label>

        {/* Champs guests (builder libre) */}
        {allowGuests && (
          <div style={{ display: "grid", gap: 6, borderTop: "1px solid var(--border-light)", paddingTop: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>
              Champs demandés aux non-inscrits (l'email est toujours demandé)
            </span>
            {guestFields.map((f, i) => (
              <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input placeholder="clé (ex: club)" value={f.key}
                  onChange={(e) => setGuestFields((p) => p.map((x, idx) => idx === i ? { ...x, key: e.target.value } : x))}
                  style={{ width: 120 }} />
                <input placeholder="Label affiché (ex: Club)" value={f.label}
                  onChange={(e) => setGuestFields((p) => p.map((x, idx) => idx === i ? { ...x, label: e.target.value } : x))}
                  style={{ flex: 1 }} />
                <label style={{ fontSize: 12, display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
                  <input type="checkbox" checked={f.required}
                    onChange={(e) => setGuestFields((p) => p.map((x, idx) => idx === i ? { ...x, required: e.target.checked } : x))} />
                  oblig.
                </label>
                <button className="ghost" onClick={() => setGuestFields((p) => p.filter((_, idx) => idx !== i))}>✕</button>
              </div>
            ))}
            <button className="ghost" style={{ alignSelf: "start", fontSize: 13 }}
              onClick={() => setGuestFields((p) => [...p, { key: "", label: "", required: false }])}>
              + Ajouter un champ
            </button>
          </div>
        )}

        {/* Fenêtre d'ouverture/fermeture du sondage (optionnel) */}
        <div style={{ display: "grid", gap: 6, borderTop: "1px solid var(--border-light)", paddingTop: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Planification (laisser vide = géré manuellement via Ouvrir/Fermer)</span>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <label style={{ fontSize: 12, display: "grid", gap: 4 }}>
              Ouverture programmée
              <input type="datetime-local" value={openAt} onChange={(e) => setOpenAt(e.target.value)} />
            </label>
            <label style={{ fontSize: 12, display: "grid", gap: 4 }}>
              Fermeture programmée
              <input type="datetime-local" value={closeAt} onChange={(e) => setCloseAt(e.target.value)} />
            </label>
          </div>
        </div>

        {/* Visibilité des résultats pour les votants */}
        <div style={{ display: "grid", gap: 6, borderTop: "1px solid var(--border-light)", paddingTop: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Résultats visibles par les votants</span>
          <select value={showResults} onChange={(e) => setShowResults(e.target.value as ResultsMode)} style={{ maxWidth: 320 }}>
            {(Object.keys(RESULTS_MODE_LABEL) as ResultsMode[]).map((mode) => (
              <option key={mode} value={mode}>{RESULTS_MODE_LABEL[mode]}</option>
            ))}
          </select>
          {showResults === "AT_DATE" && (
            <label style={{ fontSize: 12, display: "grid", gap: 4, maxWidth: 220 }}>
              Date d'ouverture des résultats
              <input type="datetime-local" value={resultsAt} onChange={(e) => setResultsAt(e.target.value)} />
            </label>
          )}
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
            L'admin voit toujours les résultats en temps réel, quel que soit ce réglage.
          </p>
        </div>

        {error && <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{error}</p>}
        <button className="primary" onClick={create} disabled={creating} style={{ alignSelf: "start" }}>
          {creating ? "…" : "Créer le sondage"}
        </button>
      </div>

      {/* ── Liste ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h3 style={{ margin: 0 }}>Sondages existants</h3>
        {loading ? <p className="meta">Chargement…</p> : polls.length === 0 ? (
          <p className="meta">Aucun sondage pour l'instant.</p>
        ) : polls.map((p) => (
          <div key={p.id} className="panel" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <strong>{p.question}</strong>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                  {p.options.join(" · ")} · {p._count.voters} votant(s) · {p._count.ballots} bulletin(s)
                </div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: STATUS_COLOR[p.status], flexShrink: 0 }}>
                {STATUS_LABEL[p.status]}
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {p.status === "DRAFT" && <button className="primary" style={{ fontSize: 12 }} onClick={() => setStatus(p.id, "OPEN")}>Ouvrir</button>}
              {p.status === "OPEN" && <button className="ghost" style={{ fontSize: 12 }} onClick={() => setStatus(p.id, "CLOSED")}>Fermer</button>}
              {p.status === "CLOSED" && <button className="ghost" style={{ fontSize: 12 }} onClick={() => setStatus(p.id, "OPEN")}>Rouvrir</button>}
              <button className="ghost" style={{ fontSize: 12 }} onClick={() => copyLink(p.id)}>🔗 Copier le lien</button>
              <a className="ghost" style={{ fontSize: 12 }} href={`/poll/${p.id}`} target="_blank" rel="noopener noreferrer">👁 Voir</a>
              <Link className="primary" style={{ fontSize: 12 }} href={`/admin/polls/${p.id}`}>📊 Résultats</Link>
              <button className="danger" style={{ fontSize: 12 }} onClick={() => remove(p.id)}>Supprimer</button>
              <select
                value={p.showResults}
                onChange={(e) => setResultsMode(p.id, e.target.value as ResultsMode)}
                style={{ fontSize: 12 }}
                title="Résultats visibles par les votants"
              >
                {(Object.keys(RESULTS_MODE_LABEL) as ResultsMode[]).map((mode) => (
                  <option key={mode} value={mode}>{RESULTS_MODE_LABEL[mode]}</option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
