"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { COUNTRIES } from "@/lib/countries";

type Club = {
  id: string;
  name: string;
  city: string;
  country: string;
  logoPath: string | null;
  _count?: { members: number };
};

type Props = {
  country: string;
  onJoin: (clubId: string) => Promise<void>;
  onCreate: (data: { name: string; city: string; country: string }) => Promise<void>;
  namespace?: string;
};

export function ClubPicker({ country, onJoin, onCreate, namespace = "account" }: Props) {
  const t = useTranslations(namespace);

  // Normalize country: accept code ("FR") or full name ("France")
  const countryName = useMemo(() => {
    if (!country) return "";
    // If it's a 2-letter code, resolve to full name
    if (country.length === 2) {
      return COUNTRIES.find((c) => c.code === country.toUpperCase())?.name ?? country;
    }
    return country;
  }, [country]);

  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Club[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", city: "" });
  const [creating, setCreating] = useState(false);
  const [createSuccess, setCreateSuccess] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);
  const [joined, setJoined] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Load clubs for this country on mount + when country changes
  useEffect(() => {
    if (!countryName) { setResults([]); return; }
    setLoading(true);
    fetch(`/api/clubs?country=${encodeURIComponent(countryName)}`)
      .then((r) => r.json())
      .then((data) => setResults(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, [countryName]);

  // Search with debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!countryName) return;
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({ country: countryName });
      if (search.trim()) params.set("search", search.trim());
      fetch(`/api/clubs?${params.toString()}`)
        .then((r) => r.json())
        .then((data) => setResults(Array.isArray(data) ? data : []))
        .finally(() => setLoading(false));
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, countryName]);

  const handleJoin = async (clubId: string) => {
    setJoining(clubId);
    await onJoin(clubId);
    setJoined(clubId);
    setJoining(null);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.name.trim() || !createForm.city.trim()) return;
    setCreating(true);
    await onCreate({ name: createForm.name.trim(), city: createForm.city.trim(), country: countryName });
    setCreating(false);
    setCreateSuccess(true);
  };

  if (createSuccess) {
    return (
      <div style={{ padding: "12px 16px", background: "color-mix(in srgb, var(--teal) 10%, var(--surface))", border: "2px solid var(--teal)", borderRadius: 8, fontSize: 13 }}>
        {t("club_create_success")}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {/* Search input */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("club_search_placeholder")}
        style={{ fontSize: 13 }}
      />

      {/* Results */}
      {loading ? (
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>{t("loading")}</p>
      ) : results.length > 0 ? (
        <div style={{ maxHeight: 200, overflowY: "auto", display: "grid", gap: 4 }}>
          {results.map((club) => (
            <div
              key={club.id}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 12px", borderRadius: 8,
                border: "1px solid var(--border-light)",
                background: joined === club.id ? "color-mix(in srgb, var(--teal) 10%, var(--surface))" : "var(--surface)",
                fontSize: 13,
              }}
            >
              {club.logoPath ? (
                <Image src={club.logoPath} alt="" width={28} height={28} style={{ borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
              ) : (
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--surface-2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>🏒</div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ fontSize: 13 }}>{club.name}</strong>
                <span style={{ color: "var(--text-muted)", fontSize: 11, marginLeft: 6 }}>{club.city}</span>
                {club._count?.members != null && (
                  <span style={{ color: "var(--text-muted)", fontSize: 11, marginLeft: 4 }}>· {club._count.members}</span>
                )}
              </div>
              {joined === club.id ? (
                <span style={{ fontSize: 11, color: "var(--teal)", fontWeight: 700 }}>✓</span>
              ) : (
                <button
                  type="button"
                  className="ghost"
                  style={{ fontSize: 11, padding: "3px 10px", flexShrink: 0 }}
                  disabled={joining === club.id}
                  onClick={() => handleJoin(club.id)}
                >
                  {joining === club.id ? "…" : t("club_join")}
                </button>
              )}
            </div>
          ))}
        </div>
      ) : search.trim() ? (
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>{t("club_no_results")}</p>
      ) : null}

      {/* Create club toggle */}
      {!showCreate ? (
        <button
          type="button"
          className="ghost"
          style={{ fontSize: 12, justifySelf: "start" }}
          onClick={() => setShowCreate(true)}
        >
          + {t("club_create_title")}
        </button>
      ) : (
        <div style={{ padding: "12px 16px", border: "2px solid var(--border)", borderRadius: 8, display: "grid", gap: 10 }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 13 }}>{t("club_create_title")}</p>
          <label className="field-row" style={{ marginBottom: 0 }}>
            {t("club_create_name")}
            <input
              value={createForm.name}
              onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
              required
              style={{ fontSize: 13 }}
            />
          </label>
          <label className="field-row" style={{ marginBottom: 0 }}>
            {t("club_create_city")}
            <input
              value={createForm.city}
              onChange={(e) => setCreateForm((f) => ({ ...f, city: e.target.value }))}
              required
              style={{ fontSize: 13 }}
            />
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="primary"
              style={{ fontSize: 12 }}
              disabled={creating || !createForm.name.trim() || !createForm.city.trim()}
              onClick={handleCreate}
            >
              {creating ? "…" : t("club_create_btn")}
            </button>
            <button type="button" className="ghost" style={{ fontSize: 12 }} onClick={() => setShowCreate(false)}>
              {t("btn_cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
