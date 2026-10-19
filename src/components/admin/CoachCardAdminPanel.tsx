"use client";

import { useState, useTransition } from "react";
import { searchPlayersAction } from "@/app/[locale]/admin/whbpc/actions";
import { assignCoachCardAction, revokeCoachCardAction } from "@/app/[locale]/admin/coach-cards/actions";
import { CoachCard } from "@/components/CoachCard";
import { COACH_EDITION, nextCollectorNumber } from "@/lib/coach-card";

type PlayerHit = { id: string; name: string; slug: string | null; city: string | null; country: string; photoPath?: string | null };
type ExistingCard = {
  playerId: string;
  collectorNumber: string;
  player: { id: string; name: string; slug: string | null; photoPath: string | null; badges: string[] };
};

export function CoachCardAdminPanel({ initialCards }: { initialCards: ExistingCard[] }) {
  const [cards, setCards] = useState(initialCards);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlayerHit[]>([]);
  const [selected, setSelected] = useState<PlayerHit | null>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  async function handleSearch(q: string) {
    setQuery(q);
    if (q.trim().length < 2) { setResults([]); return; }
    setResults(await searchPlayersAction(q));
  }

  const existing = cards.find((c) => c.playerId === selected?.id);
  const previewNumber = existing?.collectorNumber ?? nextCollectorNumber(cards.map((c) => c.collectorNumber));

  function handleGive() {
    if (!selected) return;
    setMessage(null);
    startTransition(async () => {
      const res = await assignCoachCardAction(selected.id);
      if ("error" in res && res.error) { setMessage(`Erreur : ${res.error}`); return; }
      const num = "collectorNumber" in res ? res.collectorNumber ?? previewNumber : previewNumber;
      setMessage(existing ? `${selected.name} a déjà la carte (n° ${num}).` : `Carte n° ${num} donnée à ${selected.name} ✓`);
      if (!existing) {
        setCards((prev) => [
          { playerId: selected.id, collectorNumber: num, player: { id: selected.id, name: selected.name, slug: selected.slug, photoPath: selected.photoPath ?? null, badges: [] } },
          ...prev,
        ]);
      }
      setSelected(null);
      setQuery("");
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div className="panel" style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 280px", minWidth: 0 }}>
          <h3 style={{ marginTop: 0 }}>Donner la carte Coach</h3>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 0 }}>
            {COACH_EDITION.tournament} · {COACH_EDITION.city} — n° d&apos;exemplaire automatique, nom et photo du profil.
          </p>

          <div style={{ position: "relative" }}>
            <input style={inputStyle} value={query} placeholder="Chercher un joueur…"
              onChange={(e) => { setSelected(null); handleSearch(e.target.value); }} />
            {results.length > 0 && (
              <div style={{ position: "absolute", zIndex: 10, top: "100%", left: 0, right: 0, background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: 6, marginTop: 4, maxHeight: 220, overflowY: "auto" }}>
                {results.map((p) => (
                  <button key={p.id} type="button" onClick={() => { setSelected(p); setResults([]); setQuery(p.name); }}
                    style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", background: "none", border: "none", cursor: "pointer", fontSize: 13, borderBottom: "1px solid var(--border)" }}>
                    <strong>{p.name}</strong>
                    <span style={{ color: "var(--text-muted)", marginLeft: 6, fontSize: 12 }}>{p.city ? `${p.city}, ` : ""}{p.country}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button type="button" className="primary" style={{ marginTop: 16 }} onClick={handleGive} disabled={pending || !selected || !!existing}>
            {pending ? "…" : !selected ? "Choisis un joueur" : existing ? `${selected.name} l'a déjà (n° ${existing.collectorNumber})` : `Donner la carte n° ${previewNumber} à ${selected.name}`}
          </button>
          {message && <p style={{ fontSize: 13, marginTop: 12, color: message.startsWith("Erreur") ? "var(--danger)" : "var(--teal)" }}>{message}</p>}
        </div>

        {/* Aperçu : exactement ce que le joueur recevra */}
        <div style={{ flexShrink: 0 }}>
          <CoachCard
            coachName={selected?.name ?? "Nom du coach"}
            tournament={COACH_EDITION.tournament}
            city={COACH_EDITION.city}
            collectorNumber={previewNumber}
            photoUrl={selected?.photoPath ?? null}
            badges={existing?.player.badges ?? []}
          />
        </div>
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Coachs ayant la carte ({cards.length})</h3>
        {cards.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Aucune carte donnée pour l&apos;instant.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[...cards].sort((a, b) => a.collectorNumber.localeCompare(b.collectorNumber)).map((c) => (
              <div key={c.playerId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6 }}>
                <span style={{ fontSize: 13 }}>n° <strong>{c.collectorNumber}</strong> — {c.player.name}</span>
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
