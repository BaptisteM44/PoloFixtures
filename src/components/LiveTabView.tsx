"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { LiveMatchTile } from "./LiveMatchTile";
import { TournamentChat } from "./TournamentChat";
import { Link } from "@/i18n/navigation";
import { type MatchWithTeams } from "./ScheduleBoard";

type OverlayChannel = { id: string; slug: string; label: string; court: string; activeCourt?: string; showChat?: boolean };

export function LiveTabView({
  tournamentId,
  tournamentSlug,
  matches,
  gameDurationMin,
  isLive,
  tournamentStatus,
  dateStart,
  courtsCount,
  youtubeEmbed,
  court1Embed,
  court2Embed,
  multiplexEmbed,
  overlayChannels,
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
  tournamentStatus: "UPCOMING" | "LIVE" | "COMPLETED";
  dateStart: string;
  courtsCount: number;
  youtubeEmbed: string | null;
  court1Embed: string | null;
  court2Embed: string | null;
  multiplexEmbed: string | null;
  overlayChannels: OverlayChannel[];
  chatMode: "OPEN" | "ORG_ONLY" | "DISABLED";
  currentPlayerId: string | null;
  currentPlayerName: string | null;
  isOrga: boolean;
  creatorId: string | null;
  charterAccepted: boolean;
  canEdit: boolean;
}) {
  const t = useTranslations("tournament");
  const locale = useLocale();

  // "multiplex" | "court-1" | "court-2" | ...
  type TabId = "multiplex" | `court-${number}`;
  const [activeTab, setActiveTab] = useState<TabId>("multiplex");

  // Overlay toggle per tab: null = aucun, sinon slug du channel
  const [activeOverlay, setActiveOverlay] = useState<string | null>(null);

  // Multiplex overlay switcher state (orga only)
  const multiplexChannel = overlayChannels.find((ch) => ch.court === "multiplex" || ch.slug.includes("multiplex")) ?? null;
  const [muxActiveCourt, setMuxActiveCourt] = useState(multiplexChannel ? (multiplexChannel as any).activeCourt ?? "1" : "1");
  const [muxShowChat, setMuxShowChat] = useState(multiplexChannel ? (multiplexChannel as any).showChat ?? false : false);
  const [muxSwitching, setMuxSwitching] = useState(false);

  const switchMuxCourt = async (court: string) => {
    if (!multiplexChannel || muxSwitching) return;
    setMuxSwitching(true);
    setMuxActiveCourt(court);
    await fetch(`/api/overlay/channels/${multiplexChannel.slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activeCourt: court, showChat: muxShowChat }),
    });
    setMuxSwitching(false);
  };

  const toggleMuxChat = async () => {
    if (!multiplexChannel || muxSwitching) return;
    const next = !muxShowChat;
    setMuxShowChat(next);
    await fetch(`/api/overlay/channels/${multiplexChannel.slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activeCourt: muxActiveCourt, showChat: next }),
    });
  };

  // Drag for overlay iframe
  const [overlayPos, setOverlayPos] = useState<{ left: number; top: number } | null>(null);
  const dragRef = useRef<{ isDragging: boolean; startX: number; startY: number; initLeft: number; initTop: number } | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLDivElement>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (!overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    dragRef.current = { isDragging: true, startX: e.clientX, startY: e.clientY, initLeft: rect.left, initTop: rect.top };
    e.preventDefault();
  }, []);
  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragRef.current?.isDragging || !videoRef.current) return;
    const cr = videoRef.current.getBoundingClientRect();
    setOverlayPos({
      left: Math.max(0, dragRef.current.initLeft + (e.clientX - dragRef.current.startX) - cr.left),
      top: Math.max(0, dragRef.current.initTop + (e.clientY - dragRef.current.startY) - cr.top),
    });
  }, []);
  const onMouseUp = useCallback(() => { if (dragRef.current) dragRef.current.isDragging = false; }, []);

  useEffect(() => {
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  // Reset overlay position when switching tab
  useEffect(() => { setOverlayPos(null); setActiveOverlay(null); }, [activeTab]);

  // Compute which stream URL and matches to show for active tab
  const getStreamEmbed = (): string | null => {
    if (activeTab === "multiplex") return multiplexEmbed ?? youtubeEmbed;
    if (activeTab === "court-1") return court1Embed ?? youtubeEmbed;
    if (activeTab === "court-2") return court2Embed ?? youtubeEmbed;
    return youtubeEmbed;
  };

  const getCourtNumber = (): number | null => {
    if (activeTab === "multiplex") return null;
    const m = activeTab.match(/^court-(\d+)$/);
    return m ? parseInt(m[1]) : null;
  };

  const courtNumber = getCourtNumber();
  const filteredMatches = courtNumber !== null
    ? matches.filter((m) => m.courtName === `Court ${courtNumber}`)
    : matches;

  const streamEmbed = getStreamEmbed();
  // Un stream est-il configuré (sur au moins un onglet) ? Sert à décider si on
  // affiche le bloc vidéo ou si on met les scores live en avant.
  const hasAnyStream = !!(youtubeEmbed || court1Embed || court2Embed || multiplexEmbed);

  // Overlay channels for the active tab
  const tabOverlayChannels = activeTab === "multiplex"
    ? overlayChannels // show all overlays for multiplex
    : overlayChannels.filter((ch) => ch.court === String(courtNumber));

  const overlayStyle: React.CSSProperties = overlayPos
    ? { position: "absolute", left: overlayPos.left, top: overlayPos.top }
    : { position: "absolute", bottom: 0, left: 0, right: 0 };

  // Build tabs: QCQC Multiplex first, then courts
  const tabs: { id: TabId; label: string }[] = [
    { id: "multiplex", label: "📡 QCQC Multiplex" },
    ...Array.from({ length: courtsCount }, (_, i) => ({
      id: `court-${i + 1}` as TabId,
      label: `Court ${i + 1}`,
    })),
  ];

  const startLabel = new Date(dateStart).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Bandeau d'état selon le statut du tournoi */}
      {tournamentStatus === "UPCOMING" && (
        <div className="panel" style={{ textAlign: "center", padding: "20px 16px" }}>
          <div style={{ fontSize: 32 }} aria-hidden>⏳</div>
          <p style={{ fontWeight: 700, margin: "6px 0 2px" }}>{t("live_not_started_title")}</p>
          <p className="meta" style={{ margin: 0 }}>{t("live_not_started_desc", { date: startLabel })}</p>
        </div>
      )}
      {tournamentStatus === "COMPLETED" && (
        <div className="panel" style={{ textAlign: "center", padding: "20px 16px" }}>
          <div style={{ fontSize: 32 }} aria-hidden>🏁</div>
          <p style={{ fontWeight: 700, margin: "6px 0 2px" }}>{t("live_finished_title")}</p>
          <Link href={`/tournament/${tournamentSlug}?tab=bracket`} className="ghost" style={{ fontSize: 13, display: "inline-block", marginTop: 8 }}>
            {t("live_finished_results")}
          </Link>
        </div>
      )}

      {/* Tabs: QCQC Multiplex | Court 1 | Court 2 */}
      <div className="tabs-bar" style={{ marginTop: 0 }}>
        <div className="tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`tab${activeTab === tab.id ? " active" : ""}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Overlay toggles (orga only, si des channels existent) */}
      {isOrga && tabOverlayChannels.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span className="meta" style={{ fontSize: 12 }}>Overlay :</span>
          <button
            type="button"
            onClick={() => setActiveOverlay(null)}
            className={`ghost${activeOverlay === null ? " active" : ""}`}
            style={{ fontSize: 12, padding: "4px 10px" }}
          >
            ✕ Off
          </button>
          {tabOverlayChannels.map((ch) => (
            <button
              key={ch.slug}
              type="button"
              onClick={() => setActiveOverlay(activeOverlay === ch.slug ? null : ch.slug)}
              className={`ghost${activeOverlay === ch.slug ? " active" : ""}`}
              style={{ fontSize: 12, padding: "4px 10px" }}
            >
              {ch.label}
            </button>
          ))}
        </div>
      )}

      {/* Multiplex overlay switcher (orga only, onglet QCQC uniquement) */}
      {isOrga && activeTab === "multiplex" && multiplexChannel && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "var(--surface-alt, #1e1e2e)", borderRadius: 10, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>📡 OBS Overlay actif :</span>
          {Array.from({ length: courtsCount }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              disabled={muxSwitching}
              onClick={() => switchMuxCourt(String(n))}
              className={`ghost${muxActiveCourt === String(n) ? " active" : ""}`}
              style={{ fontSize: 13, padding: "5px 14px" }}
            >
              Court {n}
            </button>
          ))}
          <div style={{ width: 1, height: 20, background: "var(--border-color, #333)", margin: "0 4px" }} />
          <button
            type="button"
            onClick={toggleMuxChat}
            className={`ghost${muxShowChat ? " active" : ""}`}
            style={{ fontSize: 13, padding: "5px 14px" }}
          >
            💬 Chat {muxShowChat ? "ON" : "OFF"}
          </button>
          <span className="meta" style={{ fontSize: 11, marginLeft: "auto" }}>
            URL OBS fixe : <code style={{ fontSize: 11 }}>/overlay/{multiplexChannel.slug}</code>
          </span>
        </div>
      )}

      {/* Video + overlay iframe — affiché seulement s'il y a un stream, OU si
          l'orga peut en ajouter un (CTA). Un spectateur sans stream ne voit pas
          d'encart vide : les scores live passent en avant à la place. */}
      {(streamEmbed || (!hasAnyStream && canEdit)) && (
      <div ref={videoRef} style={{ position: "relative", borderRadius: 8, overflow: "hidden" }}>
        {streamEmbed ? (
          <iframe
            src={streamEmbed}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title="Stream live"
            style={{ width: "100%", aspectRatio: "16/9", height: "auto", display: "block", border: "none" }}
          />
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

        {/* Overlay iframe transparent par-dessus la vidéo */}
        {activeOverlay && streamEmbed && (
          <div
            ref={overlayRef}
            style={{
              ...overlayStyle,
              zIndex: 10,
              pointerEvents: "none",
              width: "100%",
              aspectRatio: "16/9",
            }}
          >
            {/* Drag handle (orga seulement) */}
            {isOrga && (
              <div
                onMouseDown={onMouseDown}
                style={{
                  pointerEvents: "all",
                  position: "absolute",
                  top: 4,
                  right: 4,
                  background: "rgba(0,0,0,0.6)",
                  borderRadius: 6,
                  padding: "3px 8px",
                  cursor: "grab",
                  fontSize: 11,
                  color: "#aaa",
                  zIndex: 11,
                  userSelect: "none",
                }}
              >
                ⠿ déplacer
              </div>
            )}
            <iframe
              src={`/${locale}/overlay/${activeOverlay}`}
              title="Overlay"
              style={{ width: "100%", height: "100%", border: "none", background: "transparent" }}
              allowTransparency
            />
          </div>
        )}
      </div>
      )}

      {/* Scores live + Chat. Le chat n'apparaît que sur l'onglet multiplex OU si
          chatMode ≠ DISABLED — sinon les scores prennent toute la largeur (pas
          de colonne "chat désactivé" qui gâche l'espace). */}
      {(() => {
        const showChat = activeTab === "multiplex" || chatMode !== "DISABLED";
        return (
      <div className={showChat ? "live-grid" : undefined}>
        <div>
          {activeTab === "multiplex" && courtsCount >= 2 ? (
            /* Multiplex: 1 panel par terrain côte à côte (colonne sur mobile) */
            <div className="live-mux-courts">
              {Array.from({ length: courtsCount }, (_, i) => i + 1).map((n) => (
                <div key={n} className="panel" style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 13 }}>🏟 Court {n}</div>
                  <LiveMatchTile
                    tournamentId={tournamentId}
                    initialMatches={matches.filter((m) => m.courtName === `Court ${n}`)}
                    gameDurationMin={gameDurationMin}
                    isLive={isLive}
                    maxLive={1}
                    maxUpcoming={1}
                    courtName={`Court ${n}`}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="panel">
              <LiveMatchTile
                tournamentId={tournamentId}
                initialMatches={filteredMatches}
                gameDurationMin={gameDurationMin}
                isLive={isLive}
                courtName={courtNumber !== null ? `Court ${courtNumber}` : undefined}
              />
            </div>
          )}
        </div>

        {showChat && (
        <div className="panel" style={{ minHeight: 400, maxHeight: 600, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {activeTab === "multiplex" ? (
            /* Chat dédié multiplex — toujours ouvert, stocké séparément */
            <TournamentChat
              tournamentId={tournamentId}
              chatMode="OPEN"
              context="MULTIPLEX"
              currentPlayerId={currentPlayerId}
              currentPlayerName={currentPlayerName}
              isOrga={isOrga}
              creatorId={creatorId}
              charterAccepted={charterAccepted}
              fullPage
            />
          ) : (
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
          )}
        </div>
        )}
      </div>
        );
      })()}
    </div>
  );
}


