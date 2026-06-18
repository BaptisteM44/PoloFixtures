"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { PokemonCard } from "@/components/PokemonCard";

type Player = {
  id: string;
  name: string;
  country: string;
  city?: string | null;
  slug?: string | null;
  photoPath?: string | null;
  badges: string[];
  pinnedBadges: string[];
  startYear?: number | null;
  hand?: string | null;
  gender?: "MALE" | "FEMALE" | "NON_BINARY" | "PREFER_NOT_SAY" | null;
  showGender: boolean;
  clubLogoPath?: string | null;
  clubName?: string | null;
};

const CONTINENT_CODES = ["", "EU", "NA", "SA", "AS", "OC", "AF"] as const;

export function PlayersBrowser({ userContinent }: { userContinent?: string }) {
  const tClubs = useTranslations("clubs");
  const [search, setSearch] = useState("");
  const [continent, setContinent] = useState(userContinent ?? "");
  const [country, setCountry] = useState("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchPlayers();
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, continent, country]);

  async function fetchPlayers() {
    setLoading(true);
    const params = new URLSearchParams({ browse: "true", hasAccount: "true" });
    if (search) params.set("search", search);
    if (continent) params.set("continent", continent);
    if (country) params.set("country", country);
    const res = await fetch(`/api/players?${params}`);
    const data = await res.json();
    setPlayers(data);
    setLoading(false);
  }

  function handleContinentChange(val: string) {
    setContinent(val);
    setCountry("");
  }

  return (
    <div className="clubs-browser">
      {/* Filters */}
      <div className="clubs-browser__filters">
        <input
          className="clubs-browser__search"
          type="text"
          placeholder={tClubs("search_players_placeholder")}
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
        <input
          className="clubs-browser__search"
          type="text"
          placeholder={tClubs("filter_by_country")}
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          style={{ maxWidth: 180 }}
        />
      </div>

      {/* Count */}
      <p className="clubs-browser__count">
        {loading ? tClubs("loading") : tClubs("player_count", { count: players.length })}
      </p>

      {/* Grid */}
      {players.length === 0 && !loading ? (
        <div className="empty-state">
          <p>{tClubs("no_players_found")}</p>
        </div>
      ) : (
        <div className="players-browser__grid">
          {players.map((p) =>
            p.slug ? (
              <Link key={p.id} href={`/player/${p.slug}`} style={{ textDecoration: "none", display: "contents" }}>
                <PokemonCard
                  name={p.name}
                  country={p.country}
                  city={p.city}
                  photoPath={p.photoPath}
                  badges={p.badges}
                  pinnedBadges={p.pinnedBadges}
                  startYear={p.startYear}
                  hand={p.hand}
                  gender={p.gender ?? undefined}
                  showGender={p.showGender}
                  clubLogoPath={p.clubLogoPath}
                  clubName={p.clubName}
                />
              </Link>
            ) : (
              <PokemonCard
                key={p.id}
                name={p.name}
                country={p.country}
                city={p.city}
                photoPath={p.photoPath}
                badges={p.badges}
                pinnedBadges={p.pinnedBadges}
                startYear={p.startYear}
                hand={p.hand}
                gender={p.gender ?? undefined}
                showGender={p.showGender}
                clubLogoPath={p.clubLogoPath}
                clubName={p.clubName}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}
