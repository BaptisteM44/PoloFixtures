"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";

type PlayerResult = {
  id: string;
  name: string;
  city: string | null;
  country: string;
  photoPath: string | null;
  diets?: string[];
};

type PastTeam = {
  teamId: string;
  teamName: string;
  tournamentName: string;
  tournamentDate: string;
  players: { id: string; name: string; country: string; city: string | null; isCaptain: boolean }[];
};

type Squad = {
  id: string;
  name: string;
  logoPath: string | null;
  members: { role: string; player: { id: string; name: string; country: string; city: string | null } }[];
};

type PlayerSlot =
  | { type: "empty" }
  | { type: "existing"; player: PlayerResult }
  | { type: "manual"; name: string; city: string; country: string; diets: string[] };

/** Parse "3v3" → 3, "4v4" → 4, etc. Default 3. */
function maxPlayersFromFormat(format: string): number {
  const m = format.match(/^(\d+)v\d+$/i);
  return m ? parseInt(m[1], 10) : 3;
}

export function RegisterTeamForm({
  tournamentId,
  format = "3v3",
  currentPlayerId,
  onSuccess,
  accommodationAvailable = false,
}: {
  tournamentId: string;
  format?: string;
  currentPlayerId?: string | null;
  onSuccess?: () => void;
  accommodationAvailable?: boolean;
}) {
  const maxPlayers = maxPlayersFromFormat(format);
  const [open, setOpen] = useState(false);
  const [needsAccommodation, setNeedsAccommodation] = useState<boolean[]>(() => Array(maxPlayers).fill(false));
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [pastTeams, setPastTeams] = useState<PastTeam[]>([]);
  const [squads, setSquads] = useState<Squad[]>([]);
  const [pastTeamsLoading, setPastTeamsLoading] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [teamCity, setTeamCity] = useState("");
  const [teamCountry, setTeamCountry] = useState("");
  const [slots, setSlots] = useState<PlayerSlot[]>(() =>
    Array.from({ length: maxPlayers }, () => ({ type: "empty" as const }))
  );
  const [captainIndex, setCaptainIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const updateSlot = (i: number, val: PlayerSlot) => {
    setSlots((prev) => prev.map((s, idx) => (idx === i ? val : s)));
  };

  const reset = () => {
    setTeamName(""); setTeamCity(""); setTeamCountry("");
    setSlots(Array.from({ length: maxPlayers }, () => ({ type: "empty" as const })));
    setError(null); setMode("new");
  };

  // Load past teams + squads when switching to "existing" mode
  const handleSwitchToExisting = async () => {
    setMode("existing");
    if (!currentPlayerId || pastTeams.length > 0 || squads.length > 0) return;
    setPastTeamsLoading(true);
    const [teamsRes, squadsRes] = await Promise.all([
      fetch(`/api/players/${currentPlayerId}/teams`),
      fetch("/api/squads"),
    ]);
    if (teamsRes.ok) setPastTeams(await teamsRes.json());
    if (squadsRes.ok) setSquads(await squadsRes.json());
    setPastTeamsLoading(false);
  };

  const applyPastTeam = (pt: PastTeam) => {
    setTeamName(pt.teamName);
    const newSlots: PlayerSlot[] = Array.from({ length: maxPlayers }, () => ({ type: "empty" as const }));
    pt.players.slice(0, maxPlayers).forEach((p, i) => {
      newSlots[i] = { type: "existing", player: { id: p.id, name: p.name, country: p.country, city: p.city, photoPath: null } };
      if (p.isCaptain) setCaptainIndex(i);
    });
    setSlots(newSlots);
    setMode("new");
  };

  const applySquad = (squad: Squad) => {
    setTeamName(squad.name);
    const newSlots: PlayerSlot[] = Array.from({ length: maxPlayers }, () => ({ type: "empty" as const }));
    squad.members.slice(0, maxPlayers).forEach((m, i) => {
      newSlots[i] = { type: "existing", player: { id: m.player.id, name: m.player.name, country: m.player.country, city: m.player.city, photoPath: null } };
      if (m.role === "CAPTAIN") setCaptainIndex(i);
    });
    setSlots(newSlots);
    setMode("new");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const filledSlots = slots.filter((s) => s.type !== "empty");
    if (filledSlots.length === 0) { setError(t("error_add_player")); return; }
    setLoading(true);

    const filledIndices = slots.map((s, i) => s.type !== "empty" ? i : -1).filter((i) => i >= 0);
    const players = filledSlots.map((s, idx) => {
      const originalIndex = filledIndices[idx];
      const accom = needsAccommodation[originalIndex] ?? false;
      if (s.type === "existing") return { type: "existing" as const, playerId: s.player.id, needsAccommodation: accom };
      if (s.type === "manual") return { type: "manual" as const, name: s.name, city: s.city || null, country: s.country, diets: s.diets, needsAccommodation: accom };
      return null;
    }).filter(Boolean);

    const res = await fetch(`/api/tournaments/${tournamentId}/register-team`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamName, city: teamCity || null, country: teamCountry, players, captainIndex })
    });

    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? t("error_generic"));
      return;
    }
    setSuccess(true);
    onSuccess?.();
  };

  const t = useTranslations("team");

  if (success) {
    return (
      <div className="panel" style={{ textAlign: "center", padding: 32, marginTop: 24 }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
        <h3>{t("success_title")}</h3>
        <p className="meta">{t("success_desc")}</p>
        <button className="ghost" style={{ marginTop: 16 }} onClick={() => { setSuccess(false); setOpen(false); reset(); }}>
          {t("success_register_another")}
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button className="primary" style={{ marginTop: 16 }} onClick={() => setOpen(true)}>
        {t("btn_open")}
      </button>
    );
  }

  // ── Mode "équipe existante" ────────────────────────────────────────────────
  if (mode === "existing") {
    return (
      <div className="panel" style={{ marginTop: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0 }}>{t("existing_title")}</h3>
          <button className="ghost" style={{ padding: "4px 12px" }} onClick={() => setMode("new")}>{t("btn_back")}</button>
        </div>
        {pastTeamsLoading && <p className="meta">{t("loading")}</p>}
        {!pastTeamsLoading && squads.length === 0 && pastTeams.length === 0 && (
          <p className="meta">{t("empty_no_teams")} <button type="button" className="ghost" style={{ fontSize: 12 }} onClick={() => setMode("new")}>{t("btn_create_new")}</button></p>
        )}
        <div style={{ display: "grid", gap: 10 }}>
          {squads.length > 0 && (
            <>
              <p style={{ margin: "4px 0 2px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>{t("section_permanent")}</p>
              {squads.map((sq) => (
                <div key={sq.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", border: "2px solid var(--teal)", borderRadius: 8, background: "color-mix(in srgb, var(--teal) 6%, var(--surface))" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {sq.logoPath && <img src={sq.logoPath} alt="" style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover" }} />}
                    <div>
                      <div style={{ fontWeight: 700, fontFamily: "var(--font-display)" }}>{sq.name}</div>
                      <div className="meta" style={{ fontSize: 12 }}>{sq.members.map((m) => m.player.name).join(", ")}</div>
                    </div>
                  </div>
                  <button className="primary" type="button" style={{ fontSize: 12 }} onClick={() => applySquad(sq)}>
                    {t("btn_use_this")}
                  </button>
                </div>
              ))}
            </>
          )}
          {pastTeams.length > 0 && (
            <>
              <p style={{ margin: "8px 0 2px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>{t("section_past")}</p>
              {pastTeams.map((pt) => (
                <div key={pt.teamId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", border: "2px solid var(--border)", borderRadius: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontFamily: "var(--font-display)" }}>{pt.teamName}</div>
                    <div className="meta" style={{ fontSize: 12 }}>{pt.tournamentName} · {new Date(pt.tournamentDate).getFullYear()}</div>
                    <div className="meta" style={{ fontSize: 12 }}>{pt.players.map((p) => p.name).join(", ")}</div>
                  </div>
                  <button className="primary" type="button" style={{ fontSize: 12 }} onClick={() => applyPastTeam(pt)}>
                    {t("btn_use_this")}
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="panel" style={{ marginTop: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h3 style={{ margin: 0 }}>{t("register_title")}</h3>
        <button className="ghost" style={{ padding: "4px 12px" }} onClick={() => setOpen(false)}>✕</button>
      </div>

      {/* Mode switcher */}
      {currentPlayerId && (
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <button type="button" className="ghost" style={{ fontSize: 12 }} onClick={handleSwitchToExisting}>
            {t("btn_use_existing")}
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 20 }}>
        {/* Team info */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label className="field-row" style={{ gridColumn: "1/-1" }}>
            {t("field_name")}
            <input required value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder={t("field_name_placeholder")} />
          </label>
          <label className="field-row">
            {t("field_city")}
            <input value={teamCity} onChange={(e) => setTeamCity(e.target.value)} placeholder={t("field_city_placeholder")} />
          </label>
          <label className="field-row">
            {t("field_country")}
            <input required value={teamCountry} onChange={(e) => setTeamCountry(e.target.value)} placeholder="Belgium" />
          </label>
        </div>

        {/* Player slots */}
        <div>
          <p style={{ fontWeight: 700, fontFamily: "var(--font-display)", marginBottom: 12, fontSize: 14 }}>
            {t("players_title", { max: maxPlayers, format: format.toUpperCase() })}
          </p>
          <div style={{ display: "grid", gap: 12 }}>
            {slots.map((slot, i) => (
              <PlayerSlotInput
                key={i}
                index={i}
                slot={slot}
                onChange={(val) => updateSlot(i, val)}
                isCaptain={i === captainIndex}
                onSetCaptain={() => setCaptainIndex(i)}
                tournamentId={tournamentId}
                showAccommodation={accommodationAvailable && slot.type !== "empty"}
                needsAccommodation={needsAccommodation[i]}
                onToggleAccommodation={() => setNeedsAccommodation((prev) => prev.map((v, idx) => idx === i ? !v : v))}
              />
            ))}
          </div>
        </div>

        {error && <p className="error">{error}</p>}

        <div style={{ display: "flex", gap: 10 }}>
          <button className="primary" type="submit" disabled={loading}>
            {loading ? t("btn_submit_loading") : t("btn_submit")}
          </button>
          <button className="ghost" type="button" onClick={() => setOpen(false)}>{t("btn_cancel")}</button>
        </div>
      </form>
    </div>
  );
}

function PlayerSlotInput({
  index,
  slot,
  onChange,
  isCaptain,
  onSetCaptain,
  tournamentId,
  showAccommodation,
  needsAccommodation,
  onToggleAccommodation,
}: {
  index: number;
  slot: PlayerSlot;
  onChange: (val: PlayerSlot) => void;
  isCaptain?: boolean;
  onSetCaptain?: () => void;
  tournamentId: string;
  showAccommodation?: boolean;
  needsAccommodation?: boolean;
  onToggleAccommodation?: () => void;
}) {
  const t = useTranslations("team");
  const [mode, setMode] = useState<"search" | "manual">("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlayerResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualCity, setManualCity] = useState("");
  const [manualCountry, setManualCountry] = useState("");
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const DIET_LABELS: Record<string, string> = {
    OMNIVORE: t("diet_omnivore"),
    VEGETARIAN: t("diet_vegetarian"),
    VEGAN: t("diet_vegan"),
    GLUTEN_FREE: t("diet_gluten_free"),
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const search = useCallback((q: string) => {
    if (q.length < 2) { setResults([]); setShowResults(false); return; }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      const res = await fetch(`/api/players?search=${encodeURIComponent(q)}&excludeTournamentId=${tournamentId}`);
      const data = await res.json();
      setResults(data);
      setShowResults(true);
    }, 250);
  }, [tournamentId]);

  const labelNum = `${t("slot_label", { n: index + 1 })}${isCaptain ? ` ${t("slot_captain")}` : ""}`;

  if (slot.type === "existing") {
    const playerDiets = slot.player.diets ?? [];
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "var(--teal)", borderRadius: 8, border: "2px solid var(--border)" }}>
        <label style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }} title={t("slot_set_captain")}>
          <input type="radio" checked={!!isCaptain} onChange={() => onSetCaptain?.()} style={{ accentColor: "var(--pink)" }} />
          <span style={{ fontSize: 11, fontWeight: 700 }}>{t("slot_captain_abbr")}</span>
        </label>
        <div style={{ flex: 1 }}>
          <strong style={{ fontFamily: "var(--font-display)", fontSize: 14 }}>{slot.player.name}</strong>
          <span className="meta" style={{ marginLeft: 8 }}>{slot.player.city ? `${slot.player.city}, ` : ""}{slot.player.country}</span>
          {playerDiets.length > 0 && (
            <span style={{ marginLeft: 8 }}>
              {playerDiets.map((d) => (
                <span key={d} style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4, border: "1.5px solid var(--border)", marginRight: 4, background: "var(--yellow)", color: "var(--text)" }}>
                  {DIET_LABELS[d] ?? d}
                </span>
              ))}
            </span>
          )}
        </div>
        {showAccommodation && (
          <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 11, whiteSpace: "nowrap" }}>
            <input type="checkbox" checked={!!needsAccommodation} onChange={() => onToggleAccommodation?.()} style={{ accentColor: "var(--teal)", width: 13, height: 13 }} />
            {t("field_accommodation")}
          </label>
        )}
        <button type="button" className="ghost" style={{ padding: "2px 10px", fontSize: 12 }} onClick={() => { onChange({ type: "empty" }); setQuery(""); }}>
          ✕
        </button>
      </div>
    );
  }

  if (slot.type === "manual") {
    const currentDiets = slot.diets ?? [];
    const toggleDiet = (d: string) => {
      const next = currentDiets.includes(d) ? currentDiets.filter((x) => x !== d) : [...currentDiets, d];
      onChange({ type: "manual", name: manualName, city: manualCity, country: manualCountry, diets: next });
    };
    return (
      <div style={{ padding: "10px 14px", background: "var(--surface-2)", borderRadius: 8, border: "2px solid var(--border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }} title={t("slot_set_captain")}>
              <input type="radio" checked={!!isCaptain} onChange={() => onSetCaptain?.()} style={{ accentColor: "var(--pink)" }} />
              <span style={{ fontSize: 11, fontWeight: 700 }}>{t("slot_captain_abbr")}</span>
            </label>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 700 }}>{labelNum} <span className="meta">— {t("slot_manual")}</span></span>
          </div>
          <button type="button" className="ghost" style={{ padding: "2px 10px", fontSize: 12 }} onClick={() => onChange({ type: "empty" })}>✕</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
          <input placeholder={t("slot_manual_name")} value={manualName} onChange={(e) => { setManualName(e.target.value); onChange({ type: "manual", name: e.target.value, city: manualCity, country: manualCountry, diets: currentDiets }); }} required />
          <input placeholder={t("field_city_placeholder")} value={manualCity} onChange={(e) => { setManualCity(e.target.value); onChange({ type: "manual", name: manualName, city: e.target.value, country: manualCountry, diets: currentDiets }); }} />
          <input placeholder={t("field_country")} value={manualCountry} onChange={(e) => { setManualCountry(e.target.value); onChange({ type: "manual", name: manualName, city: manualCity, country: e.target.value, diets: currentDiets }); }} required />
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          {(["OMNIVORE", "VEGETARIAN", "VEGAN", "GLUTEN_FREE"] as const).map((d) => (
            <label key={d} style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
              <input type="checkbox" checked={currentDiets.includes(d)} onChange={() => toggleDiet(d)} style={{ width: 12, height: 12 }} />
              {DIET_LABELS[d]}
            </label>
          ))}
          {showAccommodation && (
            <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 11, fontWeight: 600, marginLeft: 8 }}>
              <input type="checkbox" checked={!!needsAccommodation} onChange={() => onToggleAccommodation?.()} style={{ accentColor: "var(--teal)", width: 12, height: 12 }} />
              {t("field_accommodation")}
            </label>
          )}
        </div>
      </div>
    );
  }

  // Empty slot
  return (
    <div style={{ border: "2px dashed var(--border-light)", borderRadius: 8, padding: "10px 14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 700, color: "var(--text-muted)" }}>{labelNum}</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" onClick={() => setMode("search")} style={{ fontSize: 11, padding: "2px 8px", fontWeight: 700, background: mode === "search" ? "var(--teal)" : "transparent", border: "1.5px solid var(--border)", borderRadius: 4, cursor: "pointer" }}>
            {t("slot_btn_search")}
          </button>
          <button type="button" onClick={() => { setMode("manual"); onChange({ type: "manual", name: "", city: "", country: "", diets: [] }); }} style={{ fontSize: 11, padding: "2px 8px", fontWeight: 700, background: mode === "manual" ? "var(--yellow)" : "transparent", border: "1.5px solid var(--border)", borderRadius: 4, cursor: "pointer" }}>
            {t("slot_btn_manual")}
          </button>
        </div>
      </div>
      {mode === "search" && (
        <div ref={containerRef} style={{ position: "relative" }}>
          <input
            placeholder={t("slot_search_placeholder")}
            value={query}
            onChange={(e) => { setQuery(e.target.value); search(e.target.value); }}
            onFocus={() => results.length > 0 && setShowResults(true)}
            style={{ width: "100%" }}
          />
          {showResults && results.length > 0 && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--surface)", border: "2px solid var(--border)", borderRadius: 8, zIndex: 50, maxHeight: 200, overflowY: "auto", boxShadow: "var(--shadow-lg)" }}>
              {results.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  style={{ width: "100%", textAlign: "left", padding: "8px 12px", background: "none", border: "none", cursor: "pointer", borderBottom: "1px solid var(--border-light)" }}
                  onMouseDown={() => { onChange({ type: "existing", player: p }); setShowResults(false); setQuery(""); }}
                >
                  <strong style={{ fontSize: 13 }}>{p.name}</strong>
                  <span className="meta" style={{ marginLeft: 8, fontSize: 12 }}>{p.city ? `${p.city}, ` : ""}{p.country}</span>
                </button>
              ))}
            </div>
          )}
          {showResults && results.length === 0 && query.length >= 2 && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--surface)", border: "2px solid var(--border)", borderRadius: 8, zIndex: 50, padding: "10px 12px" }}>
              <span className="meta">{t("slot_not_found")} </span>
              <button type="button" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--teal)", fontWeight: 700, fontSize: 13, padding: 0 }} onClick={() => { setMode("manual"); setManualName(query); onChange({ type: "manual", name: query, city: "", country: "", diets: [] }); setShowResults(false); }}>
                {t("slot_add_manual")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
