"use client";

import { useState, useTransition } from "react";
import { searchPlayersAction, assignWhbpcCardAction, revokeWhbpcCardAction } from "@/app/[locale]/admin/whbpc/actions";
import type { WhbpcCardData } from "@/components/WhbpcCard";

type PlayerHit = { id: string; name: string; slug: string | null; city: string | null; country: string };

type ExistingCard = WhbpcCardData & {
  id: string;
  playerId: string;
  player: { id: string; name: string; slug: string | null; photoPath: string | null };
};

const DEFAULTS: WhbpcCardData = {
  teamName: "",
  yearStarted: "",
  countryCode: "be",
  bestSkill: "",
  pedals: "Click",
  hand: "RIGHTIE",
  wheelSize: "26",
  gearRatio: "1,7",
};

export function WhbpcAdminPanel({ initialCards }: { initialCards: ExistingCard[] }) {
  const [cards, setCards] = useState(initialCards);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlayerHit[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerHit | null>(null);
  const [form, setForm] = useState<WhbpcCardData>(DEFAULTS);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  function set<K extends keyof WhbpcCardData>(key: K, value: WhbpcCardData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSearch(q: string) {
    setQuery(q);
    if (q.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    const hits = await searchPlayersAction(q);
    setResults(hits);
    setSearching(false);
  }

  function pickPlayer(p: PlayerHit) {
    setSelectedPlayer(p);
    setResults([]);
    setQuery(p.name);
    // Pré-remplir si ce joueur a déjà une carte
    const existing = cards.find((c) => c.playerId === p.id);
    setForm(existing ? { ...existing } : DEFAULTS);
  }

  function handleAssign() {
    if (!selectedPlayer) return;
    setMessage(null);
    startTransition(async () => {
      const res = await assignWhbpcCardAction({ playerId: selectedPlayer.id, ...form });
      if (res.error) { setMessage(`Erreur : ${res.error}`); return; }
      setMessage(`Carte attribuée à ${selectedPlayer.name} ✓`);
      setCards((prev) => {
        const others = prev.filter((c) => c.playerId !== selectedPlayer.id);
        return [{ id: "", playerId: selectedPlayer.id, player: { id: selectedPlayer.id, name: selectedPlayer.name, slug: selectedPlayer.slug, photoPath: null }, ...form }, ...others];
      });
    });
  }

  function handleRevoke(playerId: string) {
    if (!confirm("Retirer cette carte au joueur ?")) return;
    startTransition(async () => {
      await revokeWhbpcCardAction(playerId);
      setCards((prev) => prev.filter((c) => c.playerId !== playerId));
    });
  }

  const inputStyle: React.CSSProperties = { width: "100%", fontSize: 13, padding: "7px 10px", borderRadius: 6, border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)" };
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: 4 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Attribuer / éditer une carte WHBPC</h3>

        <label style={{ display: "block", marginBottom: 12, position: "relative" }}>
          <span style={labelStyle}>Chercher un joueur</span>
          <input
            style={inputStyle}
            value={query}
            onChange={(e) => { setSelectedPlayer(null); handleSearch(e.target.value); }}
            placeholder="Nom du joueur…"
          />
          {results.length > 0 && (
            <div style={{ position: "absolute", zIndex: 10, top: "100%", left: 0, right: 0, background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: 6, marginTop: 4, maxHeight: 220, overflowY: "auto" }}>
              {results.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pickPlayer(p)}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", background: "none", border: "none", cursor: "pointer", fontSize: 13, borderBottom: "1px solid var(--border)" }}
                >
                  <strong>{p.name}</strong>
                  <span style={{ color: "var(--text-muted)", marginLeft: 6, fontSize: 12 }}>
                    {p.city ? `${p.city}, ` : ""}{p.country}
                  </span>
                </button>
              ))}
            </div>
          )}
          {searching && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Recherche…</span>}
        </label>

        {selectedPlayer && (
          <>
            <p style={{ fontSize: 13, marginBottom: 16 }}>
              Joueur sélectionné : <strong>{selectedPlayer.name}</strong>
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label>
                <span style={labelStyle}>Teamname</span>
                <input style={inputStyle} value={form.teamName} maxLength={40} onChange={(e) => set("teamName", e.target.value)} />
              </label>
              <label>
                <span style={labelStyle}>Started playing (année)</span>
                <input style={inputStyle} value={form.yearStarted} inputMode="numeric" maxLength={4} onChange={(e) => set("yearStarted", e.target.value.replace(/\D/g, "").slice(0, 4))} />
              </label>
              <label>
                <span style={labelStyle}>Wheel size (&quot;)</span>
                <input style={inputStyle} value={form.wheelSize} inputMode="numeric" maxLength={3} onChange={(e) => set("wheelSize", e.target.value.replace(/\D/g, "").slice(0, 3))} />
              </label>
              <label>
                <span style={labelStyle}>Gear ratio</span>
                <input style={inputStyle} value={form.gearRatio} maxLength={10} onChange={(e) => set("gearRatio", e.target.value)} />
              </label>
              <label>
                <span style={labelStyle}>Hand</span>
                <select style={inputStyle} value={form.hand} onChange={(e) => set("hand", e.target.value as "RIGHTIE" | "LEFTIE")}>
                  <option value="RIGHTIE">Rightie (droite)</option>
                  <option value="LEFTIE">Leftie (gauche)</option>
                </select>
              </label>
              <label>
                <span style={labelStyle}>Pedals</span>
                <input style={inputStyle} value={form.pedals} maxLength={30} placeholder="Click / Clipped In / Flat" onChange={(e) => set("pedals", e.target.value)} />
              </label>
              <label>
                <span style={labelStyle}>Best skill</span>
                <input style={inputStyle} value={form.bestSkill} maxLength={30} onChange={(e) => set("bestSkill", e.target.value)} />
              </label>
              <label>
                <span style={labelStyle}>Pays (code 2 lettres)</span>
                <input style={inputStyle} value={form.countryCode} maxLength={2} onChange={(e) => set("countryCode", e.target.value.toLowerCase().replace(/[^a-z]/g, "").slice(0, 2))} />
              </label>
            </div>

            <button type="button" className="primary" style={{ marginTop: 16 }} onClick={handleAssign} disabled={pending || !form.teamName || !form.yearStarted}>
              {pending ? "…" : "Attribuer la carte"}
            </button>
          </>
        )}

        {message && <p style={{ fontSize: 13, marginTop: 12, color: message.startsWith("Erreur") ? "var(--danger)" : "var(--teal)" }}>{message}</p>}
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Joueurs ayant la carte ({cards.length})</h3>
        {cards.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Aucune carte attribuée pour l&apos;instant.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {cards.map((c) => (
              <div key={c.playerId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6 }}>
                <span style={{ fontSize: 13 }}>
                  <strong>{c.player.name}</strong> — {c.teamName} ({c.yearStarted})
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
