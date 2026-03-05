"use client";

import { useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const CONTINENTS = [
  { code: "EU", label: "Europe" },
  { code: "NA", label: "North America" },
  { code: "SA", label: "South America" },
  { code: "AS", label: "Asia" },
  { code: "AF", label: "Africa" },
  { code: "OC", label: "Oceania" }
];

type PlayerResult = { id: string; name: string; city: string | null; country: string };

export default function NewTournamentPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();

  const [form, setForm] = useState({
    name: "",
    continentCode: "EU",
    country: "",
    city: "",
    dateStart: "",
    dateEnd: "",
    registrationStart: "",
    registrationEnd: "",
    contactEmail: "",
    format: "3v3",
    gameDurationMin: 12,
    maxTeams: 12,
    courtsCount: 2,
    registrationFeePerTeam: 0,
    registrationFeeCurrency: "EUR",
    saturdayFormat: "ALL_DAY",
    sundayFormat: "SE",
    accommodationAvailable: false,
    breakfastProvided: false,
    lunchProvided: false,
    dinnerProvided: false,
  });

  const [coOrganizers, setCoOrganizers] = useState<PlayerResult[]>([]);
  const [coOrgQuery, setCoOrgQuery] = useState("");
  const [coOrgResults, setCoOrgResults] = useState<PlayerResult[]>([]);
  const [showCoOrgResults, setShowCoOrgResults] = useState(false);
  const coOrgDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const coOrgRef = useRef<HTMLDivElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (authStatus === "loading") return <div className="page"><p>Chargement…</p></div>;
  if (!session?.user?.playerId) {
    return (
      <div className="page">
        <div className="panel" style={{ textAlign: "center", padding: 48 }}>
          <h2>Connecte-toi pour créer un tournoi</h2>
          <p style={{ color: "var(--text-muted)" }}>Tu dois avoir un compte joueur pour organiser un tournoi.</p>
          <Link href="/login?next=/tournament/new" className="primary" style={{ marginTop: 16, display: "inline-block" }}>Se connecter</Link>
        </div>
      </div>
    );
  }

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const setNum = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: Number(e.target.value) }));

  const setBool = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.checked }));

  const searchCoOrgs = useCallback((q: string) => {
    if (q.length < 2) { setCoOrgResults([]); setShowCoOrgResults(false); return; }
    if (coOrgDebounce.current) clearTimeout(coOrgDebounce.current);
    coOrgDebounce.current = setTimeout(async () => {
      const res = await fetch(`/api/players?search=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data: PlayerResult[] = await res.json();
        const currentIds = new Set([session.user!.playerId!, ...coOrganizers.map((c) => c.id)]);
        setCoOrgResults(data.filter((p) => !currentIds.has(p.id)));
        setShowCoOrgResults(true);
      }
    }, 250);
  }, [coOrganizers, session.user]);

  const addCoOrg = (p: PlayerResult) => {
    setCoOrganizers((prev) => [...prev, p]);
    setCoOrgQuery("");
    setCoOrgResults([]);
    setShowCoOrgResults(false);
  };

  const removeCoOrg = (id: string) => setCoOrganizers((prev) => prev.filter((c) => c.id !== id));

  // Validate dates before submit
  const validateDates = (): string | null => {
    if (form.dateStart && form.dateEnd && form.dateEnd < form.dateStart)
      return "La date de fin doit être après la date de début.";
    if (form.registrationStart && form.registrationEnd && form.registrationEnd < form.registrationStart)
      return "La fin des inscriptions doit être après leur ouverture.";
    return null;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const dateError = validateDates();
    if (dateError) { setError(dateError); return; }

    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/tournaments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        contactEmail: form.contactEmail || session.user!.email || "contact@bikepolo.app",
        coOrganizerIds: coOrganizers.map((c) => c.id),
      })
    });

    if (res.ok) {
      const data = await res.json();
      router.push(`/tournament/${data.id}/edit`);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Erreur lors de la création.");
    }
    setSubmitting(false);
  };

  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <h1>Créer un tournoi</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: 24 }}>
        Ton tournoi sera soumis à validation par un administrateur. Une fois approuvé, il sera visible publiquement. Tu pourras continuer à le compléter pendant ce temps.
      </p>

      <form onSubmit={submit} style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "start" }}>

        {/* ── Section 1 : Infos de base ── */}
        <section className="panel" style={{ flex: "0 1 420px", display: "grid", gap: 14, padding: "20px 24px" }}>
          <h3 style={{ margin: "0 0 4px", fontFamily: "var(--font-display)", fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>
            1 — Infos de base
          </h3>
          <label className="field-row">
            Nom du tournoi *
            <input value={form.name} onChange={set("name")} required placeholder="Paris Open 2026" />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label className="field-row">
              Continent *
              <select value={form.continentCode} onChange={set("continentCode")}>
                {CONTINENTS.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
            </label>
            <label className="field-row">
              Format *
              <select value={form.format} onChange={set("format")}>
                <option value="2v2">2v2</option>
                <option value="3v3">3v3</option>
                <option value="4v4">4v4</option>
                <option value="5v5">5v5</option>
              </select>
            </label>
            <label className="field-row">
              Pays *
              <input value={form.country} onChange={set("country")} required placeholder="France" />
            </label>
            <label className="field-row">
              Ville *
              <input value={form.city} onChange={set("city")} required placeholder="Paris" />
            </label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label className="field-row">
              Date de début *
              <input type="date" value={form.dateStart} onChange={set("dateStart")} required />
            </label>
            <label className="field-row">
              Date de fin *
              <input type="date" value={form.dateEnd} onChange={set("dateEnd")} required
                min={form.dateStart || undefined} />
            </label>
          </div>
        </section>

        {/* ── Section 2 : Format & compétition ── */}
        <section className="panel" style={{ flex: "0 1 420px", display: "grid", gap: 14, padding: "20px 24px" }}>
          <h3 style={{ margin: "0 0 4px", fontFamily: "var(--font-display)", fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>
            2 — Format & compétition
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <label className="field-row">
              Équipes max *
              <input type="number" min={2} max={64} value={form.maxTeams} onChange={setNum("maxTeams")} required />
            </label>
            <label className="field-row">
              Terrains *
              <input type="number" min={1} max={20} value={form.courtsCount} onChange={setNum("courtsCount")} required />
            </label>
            <label className="field-row">
              Durée match (min) *
              <input type="number" min={1} max={60} value={form.gameDurationMin} onChange={setNum("gameDurationMin")} required />
            </label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label className="field-row">
              Format samedi
              <select value={form.saturdayFormat} onChange={set("saturdayFormat")}>
                <option value="ALL_DAY">Poules toute la journée</option>
                <option value="SPLIT_POOLS">Poules matin + après-midi</option>
                <option value="SWISS">Système suisse</option>
              </select>
            </label>
            <label className="field-row">
              Format dimanche
              <select value={form.sundayFormat} onChange={set("sundayFormat")}>
                <option value="SE">Élimination simple (SE)</option>
                <option value="DE">Double élimination (DE)</option>
              </select>
            </label>
          </div>
        </section>

        {/* ── Section 3 : Inscriptions & frais ── */}
        <section className="panel" style={{ flex: "0 1 420px", display: "grid", gap: 14, padding: "20px 24px" }}>
          <h3 style={{ margin: "0 0 4px", fontFamily: "var(--font-display)", fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>
            3 — Inscriptions & frais
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label className="field-row">
              Ouverture inscriptions
              <input type="date" value={form.registrationStart} onChange={set("registrationStart")} />
            </label>
            <label className="field-row">
              Fermeture inscriptions
              <input type="date" value={form.registrationEnd} onChange={set("registrationEnd")}
                min={form.registrationStart || undefined} />
            </label>
            <label className="field-row">
              Frais d'inscription (par équipe)
              <input type="number" min={0} value={form.registrationFeePerTeam} onChange={setNum("registrationFeePerTeam")} />
            </label>
            <label className="field-row">
              Devise
              <select value={form.registrationFeeCurrency} onChange={set("registrationFeeCurrency")}>
                <option value="EUR">EUR €</option>
                <option value="USD">USD $</option>
                <option value="GBP">GBP £</option>
                <option value="CHF">CHF</option>
                <option value="CAD">CAD $</option>
                <option value="AUD">AUD $</option>
              </select>
            </label>
          </div>
          <label className="field-row">
            Email de contact
            <input type="email" value={form.contactEmail} onChange={set("contactEmail")}
              placeholder={session.user!.email ?? "contact@bikepolo.app"} />
          </label>
        </section>

        {/* ── Section 4 : Logistique ── */}
        <section className="panel" style={{ flex: "1 1 300px", display: "grid", gap: 14, padding: "20px 24px" }}>
          <h3 style={{ margin: "0 0 4px", fontFamily: "var(--font-display)", fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>
            4 — Logistique & hébergement
          </h3>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
            Ces informations aident les équipes venant de loin à planifier leur déplacement.
          </p>
          <div style={{ display: "grid", gap: 10 }}>
            {([
              { key: "accommodationAvailable", label: "🏠 Hébergement possible", desc: "Vous pouvez loger les équipes" },
              { key: "breakfastProvided", label: "🥐 Petits déjeuners organisés", desc: "Les petits déjeuners sont inclus" },
              { key: "lunchProvided", label: "🍽️ Déjeuners organisés", desc: "Les repas du midi sont inclus ou organisés" },
              { key: "dinnerProvided", label: "🌙 Dîners organisés", desc: "Les repas du soir sont inclus ou organisés" },
            ] as { key: keyof typeof form; label: string; desc: string }[]).map(({ key, label, desc }) => (
              <label key={key} style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer", padding: "10px 14px", borderRadius: 8, border: `2px solid ${form[key] ? "var(--teal)" : "var(--border)"}`, background: form[key] ? "color-mix(in srgb, var(--teal) 8%, var(--surface))" : "var(--surface)", transition: "border-color 0.15s, background 0.15s" }}>
                <input type="checkbox" checked={!!form[key]} onChange={setBool(key)} style={{ marginTop: 2, accentColor: "var(--teal)", width: 16, height: 16, flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{label}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{desc}</div>
                </div>
              </label>
            ))}
          </div>
        </section>

        {/* ── Section 5 : Co-organisateurs ── */}
        <section className="panel" style={{ flex: "1 0 100%", display: "grid", gap: 14, padding: "20px 24px" }}>
          <h3 style={{ margin: "0 0 4px", fontFamily: "var(--font-display)", fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>
            5 — Co-organisateurs <span style={{ fontWeight: 400, fontSize: 12 }}>(optionnel)</span>
          </h3>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
            Les co-organisateurs peuvent gérer le tournoi avec toi (édition, équipes, scores).
          </p>

          {coOrganizers.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {coOrganizers.map((c) => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 20, border: "2px solid var(--teal)", background: "color-mix(in srgb, var(--teal) 10%, var(--surface))", fontSize: 13 }}>
                  <strong>{c.name}</strong>
                  <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{c.city ? `${c.city}, ` : ""}{c.country}</span>
                  <button type="button" onClick={() => removeCoOrg(c.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 0, lineHeight: 1, fontSize: 14 }}>✕</button>
                </div>
              ))}
            </div>
          )}

          <div ref={coOrgRef} style={{ position: "relative" }}>
            <input
              value={coOrgQuery}
              onChange={(e) => { setCoOrgQuery(e.target.value); searchCoOrgs(e.target.value); }}
              onFocus={() => coOrgResults.length > 0 && setShowCoOrgResults(true)}
              placeholder="Rechercher un joueur…"
            />
            {showCoOrgResults && coOrgResults.length > 0 && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--surface)", border: "2px solid var(--border)", borderRadius: 8, zIndex: 50, maxHeight: 200, overflowY: "auto", boxShadow: "var(--shadow-lg)" }}>
                {coOrgResults.map((p) => (
                  <button key={p.id} type="button"
                    style={{ width: "100%", textAlign: "left", padding: "8px 12px", background: "none", border: "none", cursor: "pointer", borderBottom: "1px solid var(--border-light)" }}
                    onMouseDown={() => addCoOrg(p)}>
                    <strong style={{ fontSize: 13 }}>{p.name}</strong>
                    <span style={{ color: "var(--text-muted)", marginLeft: 8, fontSize: 12 }}>{p.city ? `${p.city}, ` : ""}{p.country}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        {error && <p className="error" style={{ flex: "1 0 100%" }}>{error}</p>}

        <button className="primary" type="submit" disabled={submitting} style={{ flex: "1 0 100%", justifyContent: "center" }}>
          {submitting ? "Création…" : "Soumettre le tournoi →"}
        </button>

      </form>
    </div>
  );
}
