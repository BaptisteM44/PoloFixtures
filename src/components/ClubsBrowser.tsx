"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams, useRouter } from "next/navigation";
import { ClubCard } from "@/components/ClubCard";

type Club = {
  id: string;
  name: string;
  city: string;
  country: string;
  continentCode: string;
  logoPath?: string | null;
  memberCount: number;
};

const CONTINENT_CODES = ["", "EU", "NA", "SA", "AS", "OC", "AF"] as const;

export function ClubsBrowser({ clubs, userContinent }: { clubs: Club[]; userContinent?: string }) {
  const t = useTranslations("club");
  const tClubs = useTranslations("clubs");
  const searchParams = useSearchParams();
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [continent, setContinent] = useState(searchParams.get("continent") ?? userContinent ?? "");

  // Countries available for current continent filter
  const countries = useMemo(() => {
    const src = continent ? clubs.filter((c) => c.continentCode === continent) : clubs;
    return Array.from(new Set(src.map((c) => c.country))).sort();
  }, [clubs, continent]);

  const [country, setCountry] = useState("");

  const filtered = useMemo(() => {
    return clubs.filter((c) => {
      if (continent && c.continentCode !== continent) return false;
      if (country && c.country !== country) return false;
      if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !c.city.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [clubs, continent, country, search]);

  // Group by continent for display
  const grouped = useMemo(() => {
    if (continent) {
      // Single continent — group by country
      const byCountry: Record<string, Club[]> = {};
      for (const c of filtered) {
        if (!byCountry[c.country]) byCountry[c.country] = [];
        byCountry[c.country].push(c);
      }
      return [{ label: tClubs(`continent_${continent.toLowerCase()}` as any), subgroups: Object.entries(byCountry).map(([k, v]) => ({ label: k, clubs: v })) }];
    }
    // All continents — group by continent, then country
    const byCont: Record<string, Record<string, Club[]>> = {};
    for (const c of filtered) {
      if (!byCont[c.continentCode]) byCont[c.continentCode] = {};
      if (!byCont[c.continentCode][c.country]) byCont[c.continentCode][c.country] = [];
      byCont[c.continentCode][c.country].push(c);
    }
    const order = ["EU", "NA", "SA", "AS", "OC", "AF"];
    return order
      .filter((code) => byCont[code])
      .map((code) => ({
        label: tClubs(`continent_${code.toLowerCase()}` as any),
        subgroups: Object.entries(byCont[code]).map(([k, v]) => ({ label: k, clubs: v })),
      }));
  }, [filtered, continent, tClubs]);

  function handleContinentChange(val: string) {
    setContinent(val);
    setCountry("");
    if (val) {
      router.replace(`?continent=${val}`, { scroll: false });
    } else {
      router.replace(`?`, { scroll: false });
    }
  }

  return (
    <div className="clubs-browser">
      {/* Filters */}
      <div className="clubs-browser__filters">
        <input
          className="clubs-browser__search"
          type="text"
          placeholder={tClubs("search_placeholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="clubs-browser__select"
          value={continent}
          onChange={(e) => handleContinentChange(e.target.value)}
        >
          {CONTINENT_CODES.map((code) => (
            <option key={code} value={code}>
              {code === "" ? tClubs("all_continents") : tClubs(`continent_${code.toLowerCase()}` as any)}
            </option>
          ))}
        </select>
        {countries.length > 1 && (
          <select
            className="clubs-browser__select"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          >
            <option value="">{tClubs("all_countries")}</option>
            {countries.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
      </div>

      {/* Stats */}
      <p className="clubs-browser__count">
        {tClubs("club_count", { count: filtered.length })}
      </p>

      {/* Groups */}
      {grouped.length === 0 ? (
        <div className="empty-state">
          <p>{t("no_clubs_found")}</p>
        </div>
      ) : (
        grouped.map((group) => (
          <div key={group.label} className="clubs-continent-group">
            <h2 className="clubs-continent-group__title">{group.label}</h2>
            {group.subgroups.map((sub) => (
              <div key={sub.label} className="clubs-country-group">
                <h3 className="clubs-country-group__title">{sub.label}</h3>
                <div className="clubs-grid">
                  {sub.clubs.map((club) => (
                    <ClubCard
                      key={club.id}
                      id={club.id}
                      name={club.name}
                      city={club.city}
                      country={club.country}
                      logoPath={club.logoPath}
                      memberCount={club.memberCount}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}
