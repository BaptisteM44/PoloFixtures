"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ISO_COUNTRIES } from "@/lib/iso-countries";

type GuestField = { key: string; label: string; required: boolean; type: "text" | "club" };
type ResultsMode = "IMMEDIATE" | "AT_DATE" | "AT_CLOSE" | "HIDDEN";
type Report = { reason: string; createdAt: string; reporter: { name: string; slug: string | null } };
type PollListItem = {
  id: string; question: string; status: "DRAFT" | "OPEN" | "CLOSED";
  options: string[]; allowGuests: boolean; multipleChoice: boolean;
  showResults: ResultsMode; openAt: string | null; closeAt: string | null; resultsAt: string | null;
  eligibleClubIds: string[]; eligibleCountries: string[]; eligibleContinents: string[];
  blockedAt: string | null; blockedReason: string | null;
  createdBy: { id: string; name: string; slug: string | null } | null;
  _count: { ballots: number; voters: number; reports: number };
  reports?: Report[];
};
type ClubOption = { id: string; name: string; city: string };

const RESULTS_MODES: ResultsMode[] = ["IMMEDIATE", "AT_DATE", "AT_CLOSE", "HIDDEN"];
const CONTINENTS = ["EU", "NA", "SA", "AS", "AF", "OC"] as const;
const STATUS_COLOR: Record<string, string> = {
  DRAFT: "var(--text-muted)", OPEN: "var(--teal)", CLOSED: "var(--danger)", BLOCKED: "var(--danger)",
};

// Convertit un input <input type="datetime-local"> (heure locale, sans fuseau)
// en ISO UTC pour l'API.
function localToIso(local: string): string | null {
  if (!local) return null;
  return new Date(local).toISOString();
}

/** Sélection multiple avec recherche : puces des éléments choisis + suggestions. */
function ChipPicker({
  items, selected, onChange, placeholder,
}: {
  items: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const [query, setQuery] = useState("");
  const labelOf = (v: string) => items.find((i) => i.value === v)?.label ?? v;
  const suggestions = query.trim()
    ? items
        .filter((i) => !selected.includes(i.value) && i.label.toLowerCase().includes(query.trim().toLowerCase()))
        .slice(0, 8)
    : [];
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {selected.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {selected.map((v) => (
            <button key={v} type="button" className="ghost" style={{ fontSize: 12, padding: "2px 10px" }}
              onClick={() => onChange(selected.filter((s) => s !== v))}>
              {labelOf(v)} ✕
            </button>
          ))}
        </div>
      )}
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={placeholder} style={{ maxWidth: 320 }} />
      {suggestions.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", border: "1px solid var(--border-light)", borderRadius: 8, maxWidth: 320 }}>
          {suggestions.map((s) => (
            <button key={s.value} type="button" className="ghost"
              style={{ textAlign: "left", border: "none", borderRadius: 0, fontSize: 13 }}
              onClick={() => { onChange([...selected, s.value]); setQuery(""); }}>
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Création + gestion des sondages.
 *  - mode "admin" : tous les sondages, avec créateur, signalements et blocage ;
 *  - mode "mine"  : les sondages créés par le joueur connecté.
 */
export function PollManager({ mode }: { mode: "admin" | "mine" }) {
  const t = useTranslations("poll_manage");
  const tPoll = useTranslations("poll");
  const tHome = useTranslations("home");
  const isAdminView = mode === "admin";
  const continentLabel = (code: string) => tHome(`continent_${code.toLowerCase()}` as never);

  const [polls, setPolls] = useState<PollListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [clubs, setClubs] = useState<ClubOption[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // --- Formulaire de création ---
  const [question, setQuestion] = useState("");
  const [description, setDescription] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [multipleChoice, setMultipleChoice] = useState(false);
  const [minChoices, setMinChoices] = useState("");
  const [maxChoices, setMaxChoices] = useState("");
  const [allowComment, setAllowComment] = useState(false);
  const [allowGuests, setAllowGuests] = useState(true);
  const [guestFields, setGuestFields] = useState<GuestField[]>([]);
  const [eligibleClubIds, setEligibleClubIds] = useState<string[]>([]);
  const [eligibleCountries, setEligibleCountries] = useState<string[]>([]);
  const [eligibleContinents, setEligibleContinents] = useState<string[]>([]);
  const [openAt, setOpenAt] = useState("");
  const [closeAt, setCloseAt] = useState("");
  const [showResults, setShowResults] = useState<ResultsMode>("IMMEDIATE");
  const [resultsAt, setResultsAt] = useState("");
  const [creating, setCreating] = useState(false);
  // Mode joueur (page /polls) : formulaire replié derrière un bouton.
  const [formOpen, setFormOpen] = useState(isAdminView);
  const [error, setError] = useState<string | null>(null);

  const restricted = eligibleClubIds.length > 0 || eligibleCountries.length > 0 || eligibleContinents.length > 0;
  const clubItems = useMemo(() => clubs.map((c) => ({ value: c.id, label: `${c.name} — ${c.city}` })), [clubs]);
  const countryItems = useMemo(() => ISO_COUNTRIES.map((c) => ({ value: c.name, label: c.name })), []);
  const clubName = (id: string) => clubs.find((c) => c.id === id)?.name ?? "?";

  const load = async () => {
    setLoading(true);
    const res = await fetch(isAdminView ? "/api/polls" : "/api/polls?mine=1");
    if (res.ok) setPolls((await res.json()).polls);
    setLoading(false);
  };
  useEffect(() => {
    load();
    fetch("/api/clubs")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setClubs(Array.isArray(data) ? data : []))
      .catch(() => setClubs([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = async () => {
    setError(null);
    const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
    if (question.trim().length < 3) { setError(t("err_question_short")); return; }
    if (cleanOptions.length < 2) { setError(t("err_options_min")); return; }
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
          minChoices: multipleChoice && minChoices ? Number(minChoices) : null,
          maxChoices: multipleChoice && maxChoices ? Number(maxChoices) : null,
          allowComment,
          allowGuests: restricted ? false : allowGuests,
          guestFields: restricted ? [] : guestFields
            .filter((f) => f.key.trim() && f.label.trim())
            .map((f) => ({ key: f.key.trim(), label: f.label.trim(), required: f.required, type: f.type })),
          eligibleClubIds,
          eligibleCountries,
          eligibleContinents,
          openAt: localToIso(openAt),
          closeAt: localToIso(closeAt),
          showResults,
          resultsAt: showResults === "AT_DATE" ? localToIso(resultsAt) : null,
        }),
      });
      if (res.status === 429) { setError(t("err_rate_limited")); return; }
      if (!res.ok) { setError(t("err_create")); return; }
      setQuestion(""); setDescription(""); setOptions(["", ""]);
      setGuestFields([]); setMultipleChoice(false); setAllowGuests(true);
      setMinChoices(""); setMaxChoices(""); setAllowComment(false);
      setEligibleClubIds([]); setEligibleCountries([]); setEligibleContinents([]);
      setOpenAt(""); setCloseAt(""); setShowResults("IMMEDIATE"); setResultsAt("");
      if (!isAdminView) setFormOpen(false);
      await load();
    } finally {
      setCreating(false);
    }
  };

  const patch = async (id: string, body: Record<string, unknown>) => {
    setActionError(null);
    const res = await fetch(`/api/polls/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) setActionError(t("err_generic"));
    load();
  };

  const remove = async (id: string) => {
    if (!confirm(t("confirm_delete"))) return;
    setActionError(null);
    const res = await fetch(`/api/polls/${id}`, { method: "DELETE" });
    if (!res.ok) setActionError(t("err_generic"));
    load();
  };

  const block = (id: string) => {
    const reason = window.prompt(t("block_prompt"));
    if (reason === null) return;
    patch(id, { blocked: true, blockedReason: reason });
  };

  const dismissReports = (id: string) => {
    if (!confirm(t("confirm_dismiss"))) return;
    patch(id, { dismissReports: true });
  };

  const copyLink = (id: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/poll/${id}`);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const eligibilitySummary = (p: PollListItem): string | null => {
    const parts = [
      ...p.eligibleClubIds.map(clubName),
      ...p.eligibleCountries,
      ...p.eligibleContinents.map(continentLabel),
    ];
    return parts.length > 0 ? t("eligibility_summary", { list: parts.join(", ") }) : null;
  };

  const sectionStyle = { display: "grid", gap: 6, borderTop: "1px solid var(--border-light)", paddingTop: 10 } as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, marginTop: 16 }}>
      {/* ── Création ── */}
      {!formOpen ? (
        <button className="primary" onClick={() => setFormOpen(true)} style={{ alignSelf: "start" }}>
          {tPoll("create_btn")}
        </button>
      ) : (
      <div className="panel" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h3 style={{ margin: 0 }}>{t("title_new")}</h3>
          {!isAdminView && (
            <button className="ghost" onClick={() => setFormOpen(false)} style={{ fontSize: 12 }}>✕</button>
          )}
        </div>
        <label style={{ fontSize: 13, display: "grid", gap: 4 }}>
          {t("field_question")}
          <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={t("placeholder_question")} />
        </label>
        <label style={{ fontSize: 13, display: "grid", gap: 4 }}>
          {t("field_description")}
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </label>

        {/* Réponses */}
        <div style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{t("field_options")}</span>
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
            {t("add_option")}
          </button>
        </div>

        <label style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={multipleChoice} onChange={(e) => setMultipleChoice(e.target.checked)} />
          {t("multiple_choice")}
        </label>
        {multipleChoice && (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", paddingLeft: 24 }}>
            <label style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center" }}>
              {t("min_choices")}
              <input type="number" min={1} max={20} value={minChoices} onChange={(e) => setMinChoices(e.target.value)} style={{ width: 60 }} placeholder="—" />
            </label>
            <label style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center" }}>
              {t("max_choices")}
              <input type="number" min={1} max={20} value={maxChoices} onChange={(e) => setMaxChoices(e.target.value)} style={{ width: 60 }} placeholder="—" />
            </label>
            <span style={{ fontSize: 11, color: "var(--text-muted)", alignSelf: "center" }}>{t("minmax_hint")}</span>
          </div>
        )}
        <label style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={allowComment} onChange={(e) => setAllowComment(e.target.checked)} />
          {t("allow_comment")}
        </label>

        {/* Qui peut voter ? */}
        <div style={sectionStyle}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{t("eligibility_title")}</span>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>{t("eligibility_hint")}</p>
          <span style={{ fontSize: 12, fontWeight: 600 }}>{t("eligibility_continents")}</span>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {CONTINENTS.map((code) => (
              <label key={code} style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
                <input type="checkbox" checked={eligibleContinents.includes(code)}
                  onChange={(e) => setEligibleContinents((prev) => e.target.checked ? [...prev, code] : prev.filter((c) => c !== code))} />
                {continentLabel(code)}
              </label>
            ))}
          </div>
          <span style={{ fontSize: 12, fontWeight: 600 }}>{t("eligibility_countries")}</span>
          <ChipPicker items={countryItems} selected={eligibleCountries} onChange={setEligibleCountries} placeholder={t("search_country_ph")} />
          <span style={{ fontSize: 12, fontWeight: 600 }}>{t("eligibility_clubs")}</span>
          <ChipPicker items={clubItems} selected={eligibleClubIds} onChange={setEligibleClubIds} placeholder={t("search_club_ph")} />
          {restricted && (
            <p style={{ fontSize: 12, color: "var(--teal)", fontWeight: 600, margin: 0 }}>🎯 {t("eligibility_guests_note")}</p>
          )}
        </div>

        {/* Non-inscrits — sans objet pour un sondage ciblé */}
        {!restricted && (
          <label style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={allowGuests} onChange={(e) => setAllowGuests(e.target.checked)} />
            {t("allow_guests")}
          </label>
        )}
        {!restricted && allowGuests && (
          <div style={sectionStyle}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{t("guest_fields_title")}</span>
            {guestFields.map((f, i) => (
              <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <input placeholder={t("guest_field_key_ph")} value={f.key}
                  onChange={(e) => setGuestFields((p) => p.map((x, idx) => idx === i ? { ...x, key: e.target.value } : x))}
                  style={{ width: 120 }} />
                <input placeholder={t("guest_field_label_ph")} value={f.label}
                  onChange={(e) => setGuestFields((p) => p.map((x, idx) => idx === i ? { ...x, label: e.target.value } : x))}
                  style={{ flex: 1, minWidth: 140 }} />
                <select value={f.type} title={t("field_type_title")}
                  onChange={(e) => setGuestFields((p) => p.map((x, idx) => idx === i ? { ...x, type: e.target.value as "text" | "club" } : x))}
                  style={{ fontSize: 12, flexShrink: 0 }}>
                  <option value="text">{t("field_type_text")}</option>
                  <option value="club">{t("field_type_club")}</option>
                </select>
                <label style={{ fontSize: 12, display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
                  <input type="checkbox" checked={f.required}
                    onChange={(e) => setGuestFields((p) => p.map((x, idx) => idx === i ? { ...x, required: e.target.checked } : x))} />
                  {t("required_short")}
                </label>
                <button className="ghost" onClick={() => setGuestFields((p) => p.filter((_, idx) => idx !== i))}>✕</button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("quick_add")}</span>
              {([
                { key: "name", label: t("preset_name"), type: "text" as const },
                { key: "city", label: t("preset_city"), type: "text" as const },
                { key: "club", label: t("preset_club"), type: "club" as const },
                { key: "country", label: t("preset_country"), type: "text" as const },
              ]).map((preset) => (
                <button key={preset.key} type="button" className="ghost" style={{ fontSize: 12 }}
                  disabled={guestFields.some((f) => f.key === preset.key)}
                  onClick={() => setGuestFields((p) => [...p, { ...preset, required: false }])}>
                  + {preset.label}
                </button>
              ))}
              <button type="button" className="ghost" style={{ fontSize: 12 }}
                onClick={() => setGuestFields((p) => [...p, { key: "", label: "", required: false, type: "text" }])}>
                {t("free_field")}
              </button>
            </div>
          </div>
        )}

        {/* Planification */}
        <div style={sectionStyle}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{t("schedule_title")}</span>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <label style={{ fontSize: 12, display: "grid", gap: 4 }}>
              {t("open_at")}
              <input type="datetime-local" value={openAt} onChange={(e) => setOpenAt(e.target.value)} />
            </label>
            <label style={{ fontSize: 12, display: "grid", gap: 4 }}>
              {t("close_at")}
              <input type="datetime-local" value={closeAt} onChange={(e) => setCloseAt(e.target.value)} />
            </label>
          </div>
        </div>

        {/* Visibilité des résultats pour les votants */}
        <div style={sectionStyle}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{t("results_title")}</span>
          <select value={showResults} onChange={(e) => setShowResults(e.target.value as ResultsMode)} style={{ maxWidth: 320 }}>
            {RESULTS_MODES.map((m) => <option key={m} value={m}>{t(`results_${m}`)}</option>)}
          </select>
          {showResults === "AT_DATE" && (
            <label style={{ fontSize: 12, display: "grid", gap: 4, maxWidth: 220 }}>
              {t("results_at")}
              <input type="datetime-local" value={resultsAt} onChange={(e) => setResultsAt(e.target.value)} />
            </label>
          )}
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>{t("results_hint")}</p>
        </div>

        {error && <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{error}</p>}
        <button className="primary" onClick={create} disabled={creating} style={{ alignSelf: "start" }}>
          {creating ? "…" : t("create_btn")}
        </button>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>{t("draft_hint")}</p>
      </div>
      )}

      {/* ── Liste ── (en mode joueur, masquée tant qu’il n’a créé aucun sondage) */}
      {(isAdminView || polls.length > 0) && (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h3 style={{ margin: 0 }}>{isAdminView ? t("list_title_admin") : t("list_title_mine")}</h3>
        {actionError && <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{actionError}</p>}
        {loading ? <p className="meta">{t("loading")}</p> : polls.length === 0 ? (
          <p className="meta">{t("empty_admin")}</p>
        ) : polls.map((p) => {
          const blocked = !!p.blockedAt;
          const summary = eligibilitySummary(p);
          const statusKey = blocked ? "BLOCKED" : p.status;
          return (
            <div key={p.id} className="panel" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8, ...(blocked ? { borderColor: "var(--danger)" } : {}) }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <strong>{p.question}</strong>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                    {p.options.join(" · ")} · {t("counts", { voters: p._count.voters, ballots: p._count.ballots })}
                    {isAdminView && p.createdBy && <> · {t("created_by", { name: p.createdBy.name })}</>}
                  </div>
                  {summary && <div style={{ fontSize: 12, color: "var(--teal)", fontWeight: 600, marginTop: 2 }}>🎯 {summary}</div>}
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: STATUS_COLOR[statusKey], flexShrink: 0 }}>
                  {t(`status_${statusKey}`)}
                </span>
              </div>

              {blocked && (
                <div style={{ fontSize: 13, background: "color-mix(in srgb, var(--danger) 10%, var(--surface))", borderRadius: 8, padding: "8px 12px" }}>
                  <strong>{t("blocked_banner")}</strong>
                  {p.blockedReason && <div>{t("blocked_reason", { reason: p.blockedReason })}</div>}
                  {!isAdminView && <div style={{ color: "var(--text-muted)", marginTop: 4 }}>{t("blocked_frozen")}</div>}
                </div>
              )}

              {isAdminView && p._count.reports > 0 && (
                <details style={{ fontSize: 13 }}>
                  <summary style={{ cursor: "pointer", color: "var(--danger)", fontWeight: 700 }}>
                    ⚠️ {t("reports_count", { count: p._count.reports })}
                  </summary>
                  <ul style={{ margin: "6px 0", paddingLeft: 18, display: "grid", gap: 4 }}>
                    {(p.reports ?? []).map((r, i) => (
                      <li key={i}>
                        <strong>{r.reporter.name}</strong> — {r.reason}
                      </li>
                    ))}
                  </ul>
                  <button className="ghost" style={{ fontSize: 12 }} onClick={() => dismissReports(p.id)}>{t("btn_dismiss_reports")}</button>
                </details>
              )}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {(!blocked || isAdminView) && (
                  <>
                    {p.status === "DRAFT" && <button className="primary" style={{ fontSize: 12 }} onClick={() => patch(p.id, { status: "OPEN" })}>{t("btn_open")}</button>}
                    {p.status === "OPEN" && <button className="ghost" style={{ fontSize: 12 }} onClick={() => patch(p.id, { status: "CLOSED" })}>{t("btn_close")}</button>}
                    {p.status === "CLOSED" && <button className="ghost" style={{ fontSize: 12 }} onClick={() => patch(p.id, { status: "OPEN" })}>{t("btn_reopen")}</button>}
                  </>
                )}
                <button className="ghost" style={{ fontSize: 12 }} onClick={() => copyLink(p.id)}>
                  {copiedId === p.id ? t("btn_copied") : t("btn_copy")}
                </button>
                <a className="ghost" style={{ fontSize: 12 }} href={`/poll/${p.id}`} target="_blank" rel="noopener noreferrer">{t("btn_view")}</a>
                <Link className="primary" style={{ fontSize: 12 }} href={isAdminView ? `/admin/polls/${p.id}` : `/poll/${p.id}/results`}>
                  {t("btn_results")}
                </Link>
                {(!blocked || isAdminView) && (
                  <select
                    value={p.showResults}
                    onChange={(e) => patch(p.id, { showResults: e.target.value })}
                    style={{ fontSize: 12 }}
                    title={t("results_mode_title")}
                  >
                    {RESULTS_MODES.map((m) => <option key={m} value={m}>{t(`results_${m}`)}</option>)}
                  </select>
                )}
                {isAdminView && (blocked
                  ? <button className="ghost" style={{ fontSize: 12 }} onClick={() => patch(p.id, { blocked: false })}>{t("btn_unblock")}</button>
                  : <button className="danger" style={{ fontSize: 12 }} onClick={() => block(p.id)}>{t("btn_block")}</button>)}
                {(!blocked || isAdminView) && (
                  <button className="danger" style={{ fontSize: 12 }} onClick={() => remove(p.id)}>{t("btn_delete")}</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
