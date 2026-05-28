"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { TournamentChat } from "./TournamentChat";
import { LiveMatchTile } from "./LiveMatchTile";
import type { MatchWithTeams } from "./ScheduleBoard";

type OverlayMode = "clean" | "scores" | "chat" | "scores_chat";

const OVERLAY_LABELS: Record<OverlayMode, string> = {
  clean: "🎥 Clean",
  scores: "🏒 Scores",
  chat: "💬 Chat",
  scores_chat: "🏒+💬 Scores & Chat",
};

interface Props {
  streamUrl: string | null;
  tournamentId: string | null;
  tournamentName: string | null;
  initialMatches: MatchWithTeams[];
  gameDurationMin: number;
  chatMode: "OPEN" | "ORG_ONLY" | "DISABLED";
  currentPlayerId: string | null;
  currentPlayerName: string | null;
  isOrga: boolean;
  creatorId: string | null;
  charterAccepted: boolean;
}

interface DragState {
  isDragging: boolean;
  startX: number;
  startY: number;
  initLeft: number;
  initTop: number;
}

export function MultiplexView({
  streamUrl,
  tournamentId,
  tournamentName,
  initialMatches,
  gameDurationMin,
  chatMode,
  currentPlayerId,
  currentPlayerName,
  isOrga,
  creatorId,
  charterAccepted,
}: Props) {
  const [overlayMode, setOverlayMode] = useState<OverlayMode>("scores_chat");
  const [chatMinimized, setChatMinimized] = useState(false);

  // Draggable chat position
  const [chatPos, setChatPos] = useState({ left: -1, top: -1 }); // -1 = default corner
  const dragRef = useRef<DragState | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const showScores = overlayMode === "scores" || overlayMode === "scores_chat";
  const showChat = (overlayMode === "chat" || overlayMode === "scores_chat") && chatMode !== "DISABLED" && !!tournamentId;

  // Reset chat position when switching overlay modes
  useEffect(() => {
    if (!showChat) setChatPos({ left: -1, top: -1 });
  }, [showChat]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (!chatRef.current) return;
    const rect = chatRef.current.getBoundingClientRect();
    dragRef.current = {
      isDragging: true,
      startX: e.clientX,
      startY: e.clientY,
      initLeft: rect.left,
      initTop: rect.top,
    };
    e.preventDefault();
  }, []);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragRef.current?.isDragging || !containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const newLeft = dragRef.current.initLeft + dx - containerRect.left;
    const newTop = dragRef.current.initTop + dy - containerRect.top;
    setChatPos({ left: Math.max(0, newLeft), top: Math.max(0, newTop) });
  }, []);

  const onMouseUp = useCallback(() => {
    if (dragRef.current) dragRef.current.isDragging = false;
  }, []);

  useEffect(() => {
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  // Touch drag support
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (!chatRef.current) return;
    const rect = chatRef.current.getBoundingClientRect();
    const touch = e.touches[0];
    dragRef.current = {
      isDragging: true,
      startX: touch.clientX,
      startY: touch.clientY,
      initLeft: rect.left,
      initTop: rect.top,
    };
  }, []);

  const onTouchMove = useCallback((e: TouchEvent) => {
    if (!dragRef.current?.isDragging || !containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const touch = e.touches[0];
    const dx = touch.clientX - dragRef.current.startX;
    const dy = touch.clientY - dragRef.current.startY;
    const newLeft = dragRef.current.initLeft + dx - containerRect.left;
    const newTop = dragRef.current.initTop + dy - containerRect.top;
    setChatPos({ left: Math.max(0, newLeft), top: Math.max(0, newTop) });
    e.preventDefault();
  }, []);

  const onTouchEnd = useCallback(() => {
    if (dragRef.current) dragRef.current.isDragging = false;
  }, []);

  useEffect(() => {
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd);
    return () => {
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [onTouchMove, onTouchEnd]);

  // Chat default position: bottom-right of container
  const chatStyle: React.CSSProperties =
    chatPos.left >= 0
      ? { position: "absolute", left: chatPos.left, top: chatPos.top, zIndex: 20 }
      : { position: "absolute", right: 12, bottom: 12, zIndex: 20 };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 16px",
        background: "#111",
        borderBottom: "1px solid #222",
        flexWrap: "wrap",
      }}>
        <span style={{ fontWeight: 700, color: "#fff", fontSize: 15 }}>
          📡 QCQC Multiplex
          {tournamentName && <span style={{ color: "#888", fontWeight: 400, marginLeft: 8, fontSize: 13 }}>— {tournamentName}</span>}
        </span>

        {/* Overlay switcher — orga only */}
        {isOrga && (
          <div style={{ display: "flex", gap: 6, marginLeft: "auto", flexWrap: "wrap" }}>
            {(Object.keys(OVERLAY_LABELS) as OverlayMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setOverlayMode(mode)}
                style={{
                  padding: "5px 12px",
                  fontSize: 12,
                  borderRadius: 6,
                  border: "1px solid",
                  cursor: "pointer",
                  fontWeight: overlayMode === mode ? 700 : 400,
                  background: overlayMode === mode ? "#7c3aed" : "#1e1e1e",
                  borderColor: overlayMode === mode ? "#7c3aed" : "#333",
                  color: overlayMode === mode ? "#fff" : "#aaa",
                  transition: "all 0.15s",
                }}
              >
                {OVERLAY_LABELS[mode]}
              </button>
            ))}
          </div>
        )}

        {!isOrga && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{
              padding: "4px 10px",
              borderRadius: 6,
              background: "#1e1e1e",
              color: "#aaa",
              fontSize: 12,
            }}>
              {OVERLAY_LABELS[overlayMode]}
            </span>
          </div>
        )}
      </div>

      {/* Main: video + overlay */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {/* Video + overlay container */}
        <div
          ref={containerRef}
          style={{ position: "relative", width: "100%", aspectRatio: "16/9", background: "#000" }}
        >
          {/* Video iframe */}
          {streamUrl ? (
            <iframe
              src={streamUrl}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title="QCQC Multiplex Stream"
              style={{ width: "100%", height: "100%", border: "none", display: "block", position: "absolute", inset: 0 }}
            />
          ) : (
            <div style={{
              width: "100%", height: "100%",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexDirection: "column", gap: 12, color: "#555",
            }}>
              <span style={{ fontSize: 48 }}>📡</span>
              <p style={{ margin: 0, fontSize: 14 }}>
                Aucun flux configuré — ajouter <code style={{ color: "#888" }}>?stream=URL</code> dans l'URL
              </p>
            </div>
          )}

          {/* Scores overlay — bottom bar */}
          {showScores && tournamentId && (
            <div style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              background: "linear-gradient(transparent, rgba(0,0,0,0.85))",
              padding: "24px 16px 12px",
              zIndex: 10,
            }}>
              <LiveMatchTile
                tournamentId={tournamentId}
                initialMatches={initialMatches}
                gameDurationMin={gameDurationMin}
                isLive
              />
            </div>
          )}

          {/* Draggable Chat overlay */}
          {showChat && tournamentId && (
            <div
              ref={chatRef}
              style={{
                ...chatStyle,
                width: chatMinimized ? 180 : 300,
                maxHeight: chatMinimized ? 40 : 400,
                overflow: "hidden",
                borderRadius: 10,
                boxShadow: "0 4px 24px rgba(0,0,0,0.7)",
                background: "rgba(15,15,15,0.92)",
                border: "1px solid #333",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Chat drag handle */}
              <div
                onMouseDown={onMouseDown}
                onTouchStart={onTouchStart}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "6px 10px",
                  cursor: "grab",
                  background: "rgba(124,58,237,0.8)",
                  borderRadius: chatMinimized ? 10 : "10px 10px 0 0",
                  userSelect: "none",
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>💬 Chat live</span>
                <button
                  type="button"
                  onClick={() => setChatMinimized((v) => !v)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#fff",
                    cursor: "pointer",
                    fontSize: 14,
                    padding: "0 2px",
                    lineHeight: 1,
                  }}
                >
                  {chatMinimized ? "▲" : "▼"}
                </button>
              </div>

              {/* Chat body */}
              {!chatMinimized && (
                <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                  <TournamentChat
                    tournamentId={tournamentId}
                    chatMode={chatMode}
                    currentPlayerId={currentPlayerId}
                    currentPlayerName={currentPlayerName}
                    isOrga={isOrga}
                    creatorId={creatorId}
                    charterAccepted={charterAccepted}
                    fullPage={false}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
