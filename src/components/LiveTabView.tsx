"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { LiveMatchTile } from "./LiveMatchTile";
import { TournamentChat } from "./TournamentChat";
import { Link } from "@/i18n/navigation";
import { type MatchWithTeams } from "./ScheduleBoard";

export function LiveTabView({
  tournamentId,
  tournamentSlug,
  matches,
  gameDurationMin,
  isLive,
  courtsCount,
  youtubeEmbed,
  chatMode,
  currentPlayerId,
  currentPlayerName,
  isOrga,
  creatorId,
  charterAccepted,
  canEdit,
}: {
  tournamentId: string;
  tournamentSlug: string;
  matches: MatchWithTeams[];
  gameDurationMin: number;
  isLive: boolean;
  courtsCount: number;
  youtubeEmbed: string | null;
  chatMode: "OPEN" | "ORG_ONLY" | "DISABLED";
  currentPlayerId: string | null;
  currentPlayerName: string | null;
  isOrga: boolean;
  creatorId: string | null;
  charterAccepted: boolean;
  canEdit: boolean;
}) {
  const t = useTranslations("tournament");
  const [activeCourt, setActiveCourt] = useState<number | null>(null); // null = all courts

  // Filter matches by court if a specific court is selected
  const filteredMatches = activeCourt !== null
    ? matches.filter((m) => m.courtName === `Court ${activeCourt + 1}`)
    : matches;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Court sub-tabs (only if multiple courts) */}
      {courtsCount > 1 && (
        <div className="tabs-bar" style={{ marginTop: 0 }}>
          <div className="tabs">
            <button
              type="button"
              onClick={() => setActiveCourt(null)}
              className={`tab${activeCourt === null ? " active" : ""}`}
            >
              {t("live_all_courts")}
            </button>
            {Array.from({ length: courtsCount }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActiveCourt(i)}
                className={`tab${activeCourt === i ? " active" : ""}`}
              >
                Court {i + 1}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Stream */}
      {youtubeEmbed ? (
        <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
          <iframe
            src={youtubeEmbed}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title="Stream live"
            style={{ width: "100%", aspectRatio: "16/9", height: "auto", display: "block", border: "none" }}
          />
        </div>
      ) : (
        <div className="panel" style={{ textAlign: "center", padding: "32px 0" }}>
          <p className="meta">{t("stream_empty")}</p>
          {canEdit && (
            <Link href={`/tournament/${tournamentSlug}/edit#streamYoutubeUrl`} className="ghost" style={{ fontSize: 13, marginTop: 10, display: "inline-block" }}>
              {t("stream_add")}
            </Link>
          )}
        </div>
      )}

      {/* Scores live + Chat */}
      <div className="two-col-grid">
        <div className="panel">
          <LiveMatchTile
            tournamentId={tournamentId}
            initialMatches={filteredMatches}
            gameDurationMin={gameDurationMin}
            isLive={isLive}
          />
        </div>

        {chatMode !== "DISABLED" ? (
          <div className="panel" style={{ minHeight: 400 }}>
            <TournamentChat
              tournamentId={tournamentId}
              chatMode={chatMode}
              currentPlayerId={currentPlayerId}
              currentPlayerName={currentPlayerName}
              isOrga={isOrga}
              creatorId={creatorId}
              charterAccepted={charterAccepted}
              fullPage
            />
          </div>
        ) : (
          <div className="panel" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200 }}>
            <p className="meta" style={{ textAlign: "center" }}>{t("chat_disabled")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
