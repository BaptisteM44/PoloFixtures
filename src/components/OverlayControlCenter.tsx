"use client";

import { useState } from "react";

type Tournament = { id: string; name: string; status: string };
type Channel = {
  id: string;
  slug: string;
  label: string;
  tournamentId: string | null;
  court: string;
  theme: string;
  showClock: boolean;
  showScore: boolean;
  showTeamNames: boolean;
  showEventFeed: boolean;
  showHeader: boolean;
  tournament: { id: string; name: string; status: string } | null;
};

function ToggleSwitch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none" }}>
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: 36, height: 20, borderRadius: 10,
          background: checked ? "var(--success)" : "var(--border-light)",
          border: "2px solid var(--border)",
          position: "relative", cursor: "pointer", transition: "background 0.2s",
          flexShrink: 0,
        }}
      >
        <div style={{
          position: "absolute", top: 1, left: checked ? 16 : 1,
          width: 14, height: 14, borderRadius: "50%",
          background: "#fff", border: "1px solid var(--border)",
          transition: "left 0.2s",
        }} />
      </div>
      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{label}</span>
    </label>
  );
}

export function OverlayControlCenter({
  initialChannels,
  tournaments,
}: {
  initialChannels: Channel[];
  tournaments: Tournament[];
}) {
  const [channels, setChannels] = useState<Channel[]>(initialChannels);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});
  const [newSlug, setNewSlug] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  const updateChannel = (slug: string, patch: Partial<Channel>) => {
    setChannels((prev) => prev.map((c) => c.slug === slug ? { ...c, ...patch } : c));
  };

  const saveChannel = async (ch: Channel) => {
    setSaving((s) => ({ ...s, [ch.slug]: true }));
    try {
      const res = await fetch(`/api/overlay/channels/${ch.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: ch.label,
          tournamentId: ch.tournamentId || null,
          court: ch.court,
          theme: ch.theme,
          showClock: ch.showClock,
          showScore: ch.showScore,
          showTeamNames: ch.showTeamNames,
          showEventFeed: ch.showEventFeed,
          showHeader: ch.showHeader,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      setChannels((prev) => prev.map((c) => c.slug === ch.slug ? { ...c, ...data } : c));
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving((s) => ({ ...s, [ch.slug]: false }));
    }
  };

  const deleteChannel = async (slug: string) => {
    if (!confirm(`Supprimer le canal "${slug}" ?`)) return;
    setDeleting((s) => ({ ...s, [slug]: true }));
    try {
      await fetch(`/api/overlay/channels/${slug}`, { method: "DELETE" });
      setChannels((prev) => prev.filter((c) => c.slug !== slug));
    } finally {
      setDeleting((s) => ({ ...s, [slug]: false }));
    }
  };

  const createChannel = async () => {
    setCreateError("");
    if (!newSlug || !newLabel) { setCreateError("Slug et nom requis"); return; }
    setCreating(true);
    try {
      const res = await fetch("/api/overlay/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: newSlug, label: newLabel }),
      });
      const data = await res.json();
      if (!res.ok) { setCreateError(data.error ?? "Erreur"); return; }
      setChannels((prev) => [...prev, { ...data, tournament: null }]);
      setNewSlug(""); setNewLabel("");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Canaux existants */}
      {channels.length === 0 && (
        <p className="meta">Aucun canal créé. Commencez par en créer un ci-dessous.</p>
      )}

      {channels.map((ch) => (
        <div key={ch.slug} className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Ligne titre + URL */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{
                display: "inline-block", width: 10, height: 10, borderRadius: "50%",
                background: ch.tournamentId ? "var(--success)" : "var(--border-light)",
                border: "2px solid var(--border)", flexShrink: 0,
              }} />
              <input
                value={ch.label}
                onChange={(e) => updateChannel(ch.slug, { label: e.target.value })}
                style={{ fontWeight: 700, fontSize: 16, border: "none", background: "transparent", outline: "none", minWidth: 0 }}
              />
              <span className="meta" style={{ fontSize: 12 }}>/{ch.slug}</span>
            </div>
            <button
              className="btn btn--danger btn--sm"
              disabled={deleting[ch.slug]}
              onClick={() => deleteChannel(ch.slug)}
              style={{ flexShrink: 0 }}
            >
              {deleting[ch.slug] ? "…" : "Supprimer"}
            </button>
          </div>

          {/* URL persistante */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <code style={{ fontSize: 12, background: "var(--surface-2)", padding: "3px 8px", borderRadius: 4, border: "1px solid var(--border-light)" }}>
              {baseUrl}/overlay/{ch.slug}
            </code>
            <button className="btn btn--sm" onClick={() => navigator.clipboard.writeText(`${baseUrl}/overlay/${ch.slug}`)}>
              Copier
            </button>
            <a href={`/overlay/${ch.slug}`} target="_blank" rel="noreferrer" className="btn btn--sm">
              Ouvrir ↗
            </a>
          </div>

          {/* Tournoi + Court + Thème */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 200px" }}>
              <label style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--text-muted)" }}>Tournoi</label>
              <select
                value={ch.tournamentId ?? ""}
                onChange={(e) => updateChannel(ch.slug, { tournamentId: e.target.value || null })}
                style={{ width: "100%" }}
              >
                <option value="">— Aucun (En attente) —</option>
                {tournaments.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} {t.status === "LIVE" ? "🔴" : ""}</option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "0 0 80px" }}>
              <label style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--text-muted)" }}>Court</label>
              <input
                type="number" min={1} max={10}
                value={ch.court}
                onChange={(e) => updateChannel(ch.slug, { court: e.target.value })}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "0 0 100px" }}>
              <label style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--text-muted)" }}>Thème</label>
              <select value={ch.theme} onChange={(e) => updateChannel(ch.slug, { theme: e.target.value })}>
                <option value="dark">Sombre</option>
                <option value="light">Clair</option>
              </select>
            </div>
          </div>

          {/* Toggles affichage */}
          <div>
            <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 8 }}>Affichage overlay</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              <ToggleSwitch checked={ch.showHeader}    onChange={(v) => updateChannel(ch.slug, { showHeader: v })}    label="Bandeau (terrain/tournoi)" />
              <ToggleSwitch checked={ch.showTeamNames} onChange={(v) => updateChannel(ch.slug, { showTeamNames: v })} label="Noms d'équipes" />
              <ToggleSwitch checked={ch.showScore}     onChange={(v) => updateChannel(ch.slug, { showScore: v })}     label="Score" />
              <ToggleSwitch checked={ch.showClock}     onChange={(v) => updateChannel(ch.slug, { showClock: v })}     label="Chronomètre" />
              <ToggleSwitch checked={ch.showEventFeed} onChange={(v) => updateChannel(ch.slug, { showEventFeed: v })} label="Feed d'événements" />
            </div>
          </div>

          <div>
            <button className="btn btn--primary" disabled={saving[ch.slug]} onClick={() => saveChannel(ch)}>
              {saving[ch.slug] ? "Sauvegarde…" : "Sauvegarder"}
            </button>
          </div>
        </div>
      ))}

      {/* Créer un nouveau canal */}
      <div className="card" style={{ padding: 20, borderStyle: "dashed" }}>
        <p style={{ fontWeight: 700, marginBottom: 12 }}>+ Nouveau canal</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--text-muted)" }}>Slug (URL)</label>
            <input
              placeholder="terrain1"
              value={newSlug}
              onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              style={{ width: 140 }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--text-muted)" }}>Nom affiché</label>
            <input
              placeholder="Terrain 1"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              style={{ width: 160 }}
            />
          </div>
          <button className="btn btn--primary" disabled={creating} onClick={createChannel}>
            {creating ? "…" : "Créer"}
          </button>
        </div>
        {createError && <p style={{ color: "var(--danger)", marginTop: 8, fontSize: 13 }}>{createError}</p>}
      </div>
    </div>
  );
}
