"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ClubsBrowser } from "@/components/ClubsBrowser";
import { PlayersBrowser } from "@/components/PlayersBrowser";

type Club = {
  id: string;
  name: string;
  city: string;
  country: string;
  continentCode: string;
  logoPath?: string | null;
  memberCount: number;
};

export function ClubsPageTabs({ clubs, userContinent }: { clubs: Club[]; userContinent?: string }) {
  const tClubs = useTranslations("clubs");
  const [tab, setTab] = useState<"clubs" | "players">("clubs");

  return (
    <div>
      <div className="clubs-page__tabs">
        <button
          className={`clubs-page__tab${tab === "clubs" ? " clubs-page__tab--active" : ""}`}
          onClick={() => setTab("clubs")}
        >
          {tClubs("tab_clubs")}
        </button>
        <button
          className={`clubs-page__tab${tab === "players" ? " clubs-page__tab--active" : ""}`}
          onClick={() => setTab("players")}
        >
          {tClubs("tab_players")}
        </button>
      </div>

      {tab === "clubs" ? (
        <ClubsBrowser clubs={clubs} userContinent={userContinent} />
      ) : (
        <PlayersBrowser userContinent={userContinent} />
      )}
    </div>
  );
}
