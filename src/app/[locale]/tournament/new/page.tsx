"use client";

import { useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import cityCoords from "@/data/polo-city-coords.json";
import { CURRENCIES, COUNTRY_TO_CURRENCY } from "@/lib/currencies";

type CityEntry = { lat: number; lng: number; country: string; continent: string };

type PlayerResult = { id: string; name: string; city: string | null; country: string };

export default function NewTournamentPage() {
  const t = useTranslations("tournament");
  const tt = useTranslations("tournaments");
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();

  const CONTINENTS = [
    { code: "EU", label: tt("continent_eu") },
    { code: "NA", label: tt("continent_na") },
    { code: "SA", label: tt("continent_sa") },
    { code: "AS", label: tt("continent_as") },
    { code: "AF", label: tt("continent_af") },
    { code: "OC", label: tt("continent_oc") },
  ];

  const [form, setForm] = useState({
    name: "",
    continentCode: "EU",
    country: "",
    city: "",
    lat: "" as string | number,
    lng: "" as string | number,
    dateStart: "",
    dateEnd: "",
    registrationStart: "",
    registrationEnd: "",
    contactEmail: "",
    format: "3v3",
    gameDurationMin: 12,
    maxTeams: 12,
    maxSoloPlayers: "" as string | number,
    courtsCount: 1,
    registrationFeePerTeam: 0,
    registrationFeeCurrency: "EUR",
    saturdayFormat: "ALL_DAY",
    sundayFormat: "SE",
    rushRegistration: false,
  });

  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);
  const cityRef = useRef<HTMLDivElement>(null);

  const handleCityInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setForm((f) => ({ ...f, city: val, lat: "", lng: "" }));
    if (val.length >= 2) {
      const lower = val.toLowerCase();
      const matches = Object.keys(cityCoords).filter((c) =>
        c.toLowerCase().startsWith(lower)
      ).slice(0, 8);
      setCitySuggestions(matches);
      setShowCitySuggestions(matches.length > 0);
    } else {
      setCitySuggestions([]);
      setShowCitySuggestions(false);
    }
  };

  const selectCity = (cityName: string) => {
    const entry = (cityCoords as Record<string, CityEntry>)[cityName];
    setForm((f) => ({
      ...f,
      city: cityName,
      lat: entry?.lat ?? "",
      lng: entry?.lng ?? "",
    }));
    setCitySuggestions([]);
    setShowCitySuggestions(false);
  };

  const handleCountryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const country = e.target.value;
    const currency = COUNTRY_TO_CURRENCY[country];
    setForm((f) => ({
      ...f,
      country,
      ...(currency ? { registrationFeeCurrency: currency } : {}),
    }));
  };

  const [coOrganizers, setCoOrganizers] = useState<PlayerResult[]>([]);
  const [coOrgQuery, setCoOrgQuery] = useState("");
  const [coOrgResults, setCoOrgResults] = useState<PlayerResult[]>([]);
  const [showCoOrgResults, setShowCoOrgResults] = useState(false);
  const coOrgDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const coOrgRef = useRef<HTMLDivElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (authStatus === "loading") return <div className="page"><p>{t("new_loading")}</p></div>;
  if (!session?.user?.playerId) {
    return (
      <div className="page">
        <div className="panel" style={{ textAlign: "center", padding: 48 }}>
          <h2>{t("new_auth_title")}</h2>
          <p style={{ color: "var(--text-muted)" }}>{t("new_auth_desc")}</p>
          <Link href="/login?next=/tournament/new" className="primary" style={{ marginTop: 16, display: "inline-block" }}>{t("new_auth_btn")}</Link>
        </div>
      </div>
    );
  }

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const setNum = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: Number(e.target.value) }));

  const searchCoOrgs = useCallback((q: string) => {
    if (q.length < 2) { setCoOrgResults([]); setShowCoOrgResults(false); return; }
    if (coOrgDebounce.current) clearTimeout(coOrgDebounce.current);
    coOrgDebounce.current = setTimeout(async () => {
      const res = await fetch(`/api/players?search=${encodeURIComponent(q)}&hasAccount=true`);
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
      return t("error_date_end");
    if (form.registrationStart && form.registrationEnd && form.registrationEnd < form.registrationStart)
      return t("error_reg_end");
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
        lat: form.lat !== "" ? Number(form.lat) : undefined,
        lng: form.lng !== "" ? Number(form.lng) : undefined,
        maxSoloPlayers: form.maxSoloPlayers !== "" ? Number(form.maxSoloPlayers) : undefined,
        contactEmail: form.contactEmail || session.user!.email || "contact@bikepolo.app",
        coOrganizerIds: coOrganizers.map((c) => c.id),
      })
    });

    if (res.ok) {
      const data = await res.json();
      router.push(`/tournament/${data.slug ?? data.id}/edit?created=true`);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? t("error_create"));
    }
    setSubmitting(false);
  };

  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <h1>{t("create_title")}</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: 24 }}>
        {t("new_subtitle")}
      </p>

      <form onSubmit={submit} className="tnew-form">

        {/* ── Section 1 : Infos de base ── */}
        <section className="panel" style={{ display: "grid", gap: 14, padding: "20px 24px" }}>
          <h3 style={{ margin: "0 0 4px", fontFamily: "var(--font-display)", fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>
            {t("section_basics")}
          </h3>
          <label className="field-row">
            {t("field_name_tournament")}
            <input value={form.name} onChange={set("name")} required placeholder="Paris Open 2026" />
          </label>
          <div className="tnew-grid-2">
            <label className="field-row">
              {t("field_continent")}
              <select value={form.continentCode} onChange={set("continentCode")}>
                {CONTINENTS.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
            </label>
            <label className="field-row">
              {t("field_format")}
              <select value={form.format} onChange={set("format")}>
                <option value="2v2">2v2</option>
                <option value="3v3">3v3</option>
                <option value="4v4">4v4</option>
                <option value="5v5">5v5</option>
                <option value="ABC">ABC</option>
                <option value="ABC Chapeau">ABC Chapeau</option>
              </select>
            </label>
            <label className="field-row">
              {t("field_country")}
              <input value={form.country} onChange={handleCountryChange} required placeholder="France" />
            </label>
            <div className="field-row" ref={cityRef} style={{ position: "relative" }}>
              <span>{t("field_city")}</span>
              <input
                value={form.city}
                onChange={handleCityInput}
                onFocus={() => citySuggestions.length > 0 && setShowCitySuggestions(true)}
                onBlur={() => setTimeout(() => setShowCitySuggestions(false), 150)}
                required
                placeholder="Paris"
                autoComplete="off"
              />
              {showCitySuggestions && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--surface)", border: "2px solid var(--border)", borderRadius: 8, zIndex: 200, maxHeight: 200, overflowY: "auto", boxShadow: "var(--shadow-lg)" }}>
                  {citySuggestions.map((city) => (
                    <button
                      key={city}
                      type="button"
                      style={{ width: "100%", textAlign: "left", padding: "8px 12px", background: "none", border: "none", cursor: "pointer", borderBottom: "1px solid var(--border-light)", fontSize: 13 }}
                      onMouseDown={() => selectCity(city)}
                    >
                      <strong>{city}</strong>
                      <span style={{ color: "var(--text-muted)", marginLeft: 8, fontSize: 11 }}>
                        {(cityCoords as Record<string, CityEntry>)[city]?.country}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <input type="hidden" name="lat" value={form.lat} />
              <input type="hidden" name="lng" value={form.lng} />
            </div>
          </div>
          <div className="tnew-grid-2">
            <label className="field-row">
              {t("field_date_start")}
              <input type="date" value={form.dateStart} onChange={set("dateStart")} required />
            </label>
            <label className="field-row">
              {t("field_date_end")}
              <input type="date" value={form.dateEnd} onChange={set("dateEnd")} required
                min={form.dateStart || undefined} />
            </label>
          </div>
        </section>

        {/* ── Section 2 : Format & compétition ── */}
        <section className="panel" style={{ display: "grid", gap: 14, padding: "20px 24px" }}>
          <h3 style={{ margin: "0 0 4px", fontFamily: "var(--font-display)", fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>
            {t("section_format")}
          </h3>
          <div className="tnew-grid-3">
            <label className="field-row">
              {t("field_max_teams")}
              <input type="number" min={2} max={64} value={form.maxTeams} onChange={setNum("maxTeams")} required />
            </label>
            <label className="field-row">
              {t("field_courts")}
              <input type="number" min={1} max={20} value={form.courtsCount} onChange={setNum("courtsCount")} required />
            </label>
            <label className="field-row">
              {t("field_game_duration")}
              <input type="number" min={1} max={60} value={form.gameDurationMin} onChange={setNum("gameDurationMin")} required />
            </label>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", padding: "10px 14px", background: "color-mix(in srgb, var(--accent) 8%, var(--surface))", borderRadius: "var(--radius-sm)", border: "1px solid color-mix(in srgb, var(--accent) 20%, transparent)" }}>
            💡 {t("format_hint")}
          </p>
        </section>

        {/* ── Section 3 : Inscriptions & frais ── */}
        <section className="panel" style={{ gridColumn: "1 / -1", display: "grid", gap: 14, padding: "20px 24px" }}>
          <h3 style={{ margin: "0 0 4px", fontFamily: "var(--font-display)", fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>
            {t("section_registration")}
          </h3>
          <div className="tnew-grid-2">
            <label className="field-row">
              {t("field_reg_start")}
              <input type="datetime-local" value={form.registrationStart} onChange={set("registrationStart")} />
            </label>
            <label className="field-row">
              {t("field_reg_end")}
              <input type="datetime-local" value={form.registrationEnd} onChange={set("registrationEnd")}
                min={form.registrationStart || undefined} />
            </label>
            <label className="field-row">
              {t("field_fee")}
              <input type="number" min={0} value={form.registrationFeePerTeam} onChange={setNum("registrationFeePerTeam")} />
            </label>
            <label className="field-row">
              {t("field_currency")}
              <select value={form.registrationFeeCurrency} onChange={set("registrationFeeCurrency")}>
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="field-row">
            {t("field_contact_email")}
            <input type="email" value={form.contactEmail} onChange={set("contactEmail")}
              placeholder={session.user!.email ?? "contact@bikepolo.app"} />
          </label>

          {/* Rush registration */}
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13 }}>
            <input
              type="checkbox"
              checked={form.rushRegistration}
              onChange={(e) => setForm((f) => ({ ...f, rushRegistration: e.target.checked }))}
            />
            <span>
              <strong>{t("rush_registration_label")}</strong>
              <span style={{ color: "var(--text-muted)", marginLeft: 6 }}>{t("rush_registration_desc")}</span>
            </span>
          </label>
          <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", marginTop: -8 }}>
            {t("rush_registration_unchecked")}
          </p>

          {/* Max solo players for ABC Chapeau */}
          {form.format === "ABC Chapeau" && (
            <label className="field-row">
              {t("max_solo_players_label")} <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: 11 }}>{t("max_solo_players_hint")}</span>
              <input
                type="number"
                min={3}
                value={form.maxSoloPlayers}
                onChange={(e) => setForm((f) => ({ ...f, maxSoloPlayers: e.target.value }))}
                placeholder="Ex: 30"
              />
            </label>
          )}
        </section>

        {/* ── Section 4 : Co-organisateurs ── */}
        <section className="panel" style={{ gridColumn: "1 / -1", display: "grid", gap: 14, padding: "20px 24px" }}>
          <h3 style={{ margin: "0 0 4px", fontFamily: "var(--font-display)", fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>
            {t("section_co_organizers")} <span style={{ fontWeight: 400, fontSize: 12 }}>{t("co_organizer_optional")}</span>
          </h3>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
            {t("co_organizer_desc")}
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
              placeholder={t("co_organizer_search")}
            />
            {showCoOrgResults && coOrgResults.length > 0 && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--surface)", border: "2px solid var(--border)", borderRadius: 8, zIndex: 200, maxHeight: 200, overflowY: "auto", boxShadow: "var(--shadow-lg)" }}>
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

        {error && <p className="error" style={{ gridColumn: "1 / -1" }}>{error}</p>}

        <button className="primary" type="submit" disabled={submitting} style={{ gridColumn: "1 / -1", justifyContent: "center" }}>
          {submitting ? t("btn_submit_creating") : t("btn_submit_new")}
        </button>

      </form>
    </div>
  );
}
