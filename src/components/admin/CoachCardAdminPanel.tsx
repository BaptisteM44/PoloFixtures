"use client";

import { useState, useTransition } from "react";
import { searchPlayersAction } from "@/app/[locale]/admin/whbpc/actions";
import { assignCoachCardAction, revokeCoachCardAction } from "@/app/[locale]/admin/coach-cards/actions";
import { CoachCard } from "@/components/CoachCard";

type PlayerHit = { id: string; name: string; slug: string | null; city: string | null; country: string; photoPath?: string | null };
type Form = { tournament: string; city: string; collectorNumber: string };
type ExistingCard = Form & {
  playerId: string;
  player: { id: string; name: string; slug: string | null; photoPath: string | null; badges: string[] };
};

export function CoachCardAdminPanel({ initialCards }: { initialCards: ExistingCard[] }) {
  const [cards, setCards] = useState(initialCards);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlayerHit[]>([]);
  const [selected, setSelected] = useState<PlayerHit | null>(null);
  // Les champs restent remplis d'un joueur à l'autre : plusieurs coachs d'une même édition s'enchaînent vite.
  const [form, setForm] = useState<Form>({ tournament: "", city: "", collectorNumber: "" });
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  async function handleSearch(q: string) {
    setQuery(q);
    if (q.trim().length < 2) { setResults([]); return; }
    setResults(await searchPlayersAction(q));
  }

  function pick(p: PlayerHit) {
    setSelected(p);
    setResults([]);
    setQuery(p.name);
    const existing = cards.find((c) => c.playerId === p.id);
    if (existing) setForm({ tournament: existing.tournament, city: existing.city, collectorNumber: existing.collectorNumber });
  }

  function handleAssign() {
    if (!selected) return;
    setMessage(null);
    startTransition(async () => {
      const res = await assignCoachCardAction({ playerId: selected.id, ...form });
      if (res.error) { setMessage(`Erreur : ${res.error}`); return; }
      setMessage(`Carte Coach attribuée à ${selected.name} ✓`);
      setCards((prev) => [
        { playerId: selected.id, ...form, player: { id: selected.id, name: selected.name, slug: selected.slug, photoPath: selected.photoPath ?? null, badges: [] } },
        ...prev.filter((c) => c.playerId !== selected.id),
      ]);
    });
  }

  function handleRevoke(playerId: string) {
    if (!confirm("Retirer la carte Coach à ce joueur ?")) return;
    startTransition(async () => {
      await revokeCoachCardAction(playerId);
      setCards((prev) => prev.filter((c) => c.playerId !== playerId));
    });
  }

  const inputStyle: React.CSSProperties = { width: "100%", fontSize: 13, padding: "7px 10px", borderRadius: 6, border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)" };
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: 4 };
  const previewCard = cards.find((c) => c.playerId === selected?.id);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div className="panel" style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 300px", minWidth: 0 }}>
          <h3 style={{ marginTop: 0 }}>Attribuer / modifier une carte Coach</h3>

          <label style={{ display: "block", marginBottom: 12, position: "relative" }}>
            <span style={labelStyle}>Joueur</span>
            <input style={inputStyle} value={query} placeholder="Nom du joueur…"
              onChange={(e) => { setSelected(null); handleSearch(e.target.value); }} />
            {results.length > 0 && (
              <div style={{ position: "absolute", zIndex: 10, top: "100%", left: 0, right: 0, background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: 6, marginTop: 4, maxHeight: 220, overflowY: "auto" }}>
                {results.map((p) => (
                  <button key={p.id} type="button" onClick={() => pick(p)}
                    style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", background: "none", border: "none", cursor: "pointer", fontSize: 13, borderBottom: "1px solid var(--border)" }}>
                    <strong>{p.name}</strong>
                    <span style={{ color: "var(--text-muted)", marginLeft: 6, fontSize: 12 }}>{p.city ? `${p.city}, ` : ""}{p.country}</span>
                  </button>
                ))}
              </div>
            )}
          </label>

          <div style={{ display: "grid", gap: 12 }}>
            <label>
              <span style={labelStyle}>Édition (ex. Newbalaya 2026)</span>
              <input style={inputStyle} value={form.tournament} maxLength={40} onChange={(e) => setForm((f) => ({ ...f, tournament: e.target.value }))} />
            </label>
            <label>
              <span style={labelStyle}>Ville</span>
              <input style={inputStyle} value={form.city} maxLength={30} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
            </label>
            <label>
              <span style={labelStyle}>N° d&apos;exemplaire (ex. 03/12)</span>
              <input style={inputStyle} value={form.collectorNumber} maxLength={10} onChange={(e) => setForm((f) => ({ ...f, collectorNumber: e.target.value }))} />
            </label>
          </div>

          <button type="button" className="primary" style={{ marginTop: 16 }} onClick={handleAssign}
            disabled={pending || !selected || !form.tournament.trim() || !form.city.trim() || !form.collectorNumber.trim()}>
            {pending ? "…" : selected ? `Attribuer à ${selected.name}` : "Choisis un joueur"}
          </button>
          {message && <p style={{ fontSize: 13, marginTop: 12, color: message.startsWith("Erreur") ? "var(--danger)" : "var(--teal)" }}>{message}</p>}
        </div>

        {/* Aperçu en direct */}
        <div style={{ flexShrink: 0 }}>
          <CoachCard
            coachName={selected?.name ?? "Nom du coach"}
            tournament={form.tournament || "Édition"}
            city={form.city || "Ville"}
            collectorNumber={form.collectorNumber || "00/00"}
            photoUrl={selected?.photoPath ?? previewCard?.player.photoPath ?? null}
            badges={previewCard?.player.badges ?? []}
          />
        </div>
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Coachs ayant la carte ({cards.length})</h3>
        {cards.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Aucune carte attribuée pour l&apos;instant.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {cards.map((c) => (
              <div key={c.playerId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6 }}>
                <span style={{ fontSize: 13 }}>
                  <strong>{c.player.name}</strong> — {c.tournament} · {c.city} · n° {c.collectorNumber}
                </span>
                <button type="button" className="ghost" style={{ fontSize: 12, color: "var(--danger)" }} onClick={() => handleRevoke(c.playerId)} disabled={pending}>
                  Retirer
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
