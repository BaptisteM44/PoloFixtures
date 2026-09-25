"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ISO_COUNTRIES } from "@/lib/iso-countries";

export type TargetingValue = { clubIds: string[]; countries: string[]; continents: string[] };
export type ClubOption = { id: string; name: string; city: string };

const CONTINENTS = ["EU", "NA", "SA", "AS", "AF", "OC"] as const;

type Audience = {
  count: number;
  isAdmin: boolean;
  ownClubs: { id: string; name: string }[];
  ownCountry: string | null;
  needsApproval: {
    clubs: { id: string; name: string }[];
    admin: { countries: string[]; continents: string[]; global: boolean } | null;
  };
};

/** Sélection multiple avec recherche : puces des éléments choisis + suggestions. */
export function ChipPicker({
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
 * « Qui peut voter ? » — raccourcis vers ses clubs/son pays (ciblables sans
 * validation), recherche libre, aperçu du nombre de joueurs touchés et des
 * cibles qui partiront en validation. `pollId` : édition d'un sondage existant
 * (ses cibles déjà en place ne redemandent pas de validation).
 */
export function PollTargetingEditor({
  value, onChange, visibleToAll, onVisibleToAllChange, clubs, pollId, lockedTargets,
}: {
  value: TargetingValue;
  onChange: (next: TargetingValue) => void;
  visibleToAll: boolean;
  onVisibleToAllChange: (v: boolean) => void;
  clubs: ClubOption[];
  pollId?: string;
  /** Sondage ouvert : cibles actuelles non retirables (on élargit seulement). */
  lockedTargets?: TargetingValue;
}) {
  const t = useTranslations("poll_manage");
  const tHome = useTranslations("home");
  const continentLabel = (code: string) => tHome(`continent_${code.toLowerCase()}` as never);
  const [audience, setAudience] = useState<Audience | null>(null);

  const clubItems = useMemo(() => clubs.map((c) => ({ value: c.id, label: `${c.name} — ${c.city}` })), [clubs]);
  const countryItems = useMemo(() => ISO_COUNTRIES.map((c) => ({ value: c.name, label: c.name })), []);
  const restricted = value.clubIds.length + value.countries.length + value.continents.length > 0;

  const key = `${value.clubIds.join(",")}|${value.countries.join(",")}|${value.continents.join(",")}`;
  useEffect(() => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      const qs = new URLSearchParams({
        clubs: value.clubIds.join(","), countries: value.countries.join(","), continents: value.continents.join(","),
        ...(pollId ? { pollId } : {}),
      });
      fetch(`/api/polls/audience?${qs}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setAudience(d))
        .catch(() => {});
    }, 300);
    return () => { clearTimeout(timer); ctrl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, pollId]);

  // Retrait interdit des cibles en place sur un sondage ouvert.
  const guard = (field: keyof TargetingValue, next: string[]) => {
    const locked = lockedTargets?.[field] ?? [];
    onChange({ ...value, [field]: [...new Set([...locked, ...next])] });
  };
  const add = (field: keyof TargetingValue, v: string) => {
    if (!value[field].includes(v)) onChange({ ...value, [field]: [...value[field], v] });
  };

  const na = audience?.needsApproval;
  const needsApproval = !!na && (na.clubs.length > 0 || !!na.admin);

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 600 }}>{t("eligibility_title")}</span>
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>{t("eligibility_hint")}</p>

      {/* Raccourcis : ce que le joueur peut cibler sans validation */}
      {audience && !audience.isAdmin && (audience.ownClubs.length > 0 || audience.ownCountry) && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("own_scope_label")}</span>
          {audience.ownClubs.map((c) => (
            <button key={c.id} type="button" className="ghost" style={{ fontSize: 12 }}
              disabled={value.clubIds.includes(c.id)} onClick={() => add("clubIds", c.id)}>
              + {c.name}
            </button>
          ))}
          {audience.ownCountry && (
            <button type="button" className="ghost" style={{ fontSize: 12 }}
              disabled={value.countries.includes(audience.ownCountry)} onClick={() => add("countries", audience.ownCountry!)}>
              + {audience.ownCountry}
            </button>
          )}
        </div>
      )}

      <span style={{ fontSize: 12, fontWeight: 600 }}>{t("eligibility_clubs")}</span>
      <ChipPicker items={clubItems} selected={value.clubIds} onChange={(n) => guard("clubIds", n)} placeholder={t("search_club_ph")} />
      <span style={{ fontSize: 12, fontWeight: 600 }}>{t("eligibility_countries")}</span>
      <ChipPicker items={countryItems} selected={value.countries} onChange={(n) => guard("countries", n)} placeholder={t("search_country_ph")} />
      <span style={{ fontSize: 12, fontWeight: 600 }}>{t("eligibility_continents")}</span>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {CONTINENTS.map((code) => (
          <label key={code} style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={value.continents.includes(code)}
              disabled={lockedTargets?.continents.includes(code)}
              onChange={(e) => guard("continents", e.target.checked ? [...value.continents, code] : value.continents.filter((c) => c !== code))} />
            {continentLabel(code)}
          </label>
        ))}
      </div>

      {/* Aperçu */}
      {audience && (
        <p style={{ fontSize: 12, fontWeight: 600, margin: "4px 0 0", color: "var(--teal)" }}>
          👥 {restricted ? t("audience_count", { count: audience.count }) : t("audience_everyone", { count: audience.count })}
        </p>
      )}
      {needsApproval && (
        <div style={{ fontSize: 12, background: "color-mix(in srgb, var(--yellow) 25%, var(--surface))", borderRadius: 8, padding: "8px 12px", display: "grid", gap: 2 }}>
          <strong>⏳ {t("approval_needed_title")}</strong>
          {na!.clubs.map((c) => <span key={c.id}>• {t("approval_needed_club", { club: c.name })}</span>)}
          {na!.admin && (
            <span>• {na!.admin.global
              ? t("approval_needed_global")
              : t("approval_needed_admin", { list: [...na!.admin.countries, ...na!.admin.continents.map(continentLabel)].join(", ") })}
            </span>
          )}
          <span style={{ color: "var(--text-muted)" }}>{t("approval_needed_hint")}</span>
        </div>
      )}

      {restricted && (
        <>
          <p style={{ fontSize: 12, color: "var(--teal)", fontWeight: 600, margin: 0 }}>🎯 {t("eligibility_guests_note")}</p>
          <label style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={visibleToAll} onChange={(e) => onVisibleToAllChange(e.target.checked)} />
            {t("visible_to_all")}
          </label>
        </>
      )}
    </div>
  );
}
