"use client";

import { useEffect, useState } from "react";
import { Match, Team } from "@prisma/client";
import { MatchEditPanel, type MatchForEdit } from "./MatchEditPanel";

export type MatchWithTeams = Match & { teamA?: Team | null; teamB?: Team | null };

const ROUND_LABELS: Record<number, Record<number, string>> = {
  // SE   roundIndex → label
  0: { 1: "R1", 2: "R2", 3: "R3", 4: "R4" },
};

const SE_ROUND_NAMES: Record<number, string> = {
  1: "Quarts", 2: "Demies", 3: "Finale", 4: "Finale",
};

const DE_ROUND_NAMES: Record<string, string> = {
  "W1": "UB Quarts", "W2": "UB Demies", "W3": "UB Finale",
  "L1": "LB R1", "L2": "LB R2", "L3": "LB Finale",
  "G4": "Grande Finale", "G3": "Grande Finale",
};

function roundLabel(match: MatchWithTeams, isDE: boolean) {
  if (!isDE) return SE_ROUND_NAMES[match.roundIndex] ?? `R${match.roundIndex}`;
  const key = `${match.bracketSide ?? "?"}${match.roundIndex}`;
  return DE_ROUND_NAMES[key] ?? key;
}

// ── Single match card ──────────────────────────────────────────────────────

function BracketMatch({
  match,
  onEdit,
  cellHeight,
  offsetTop,
  isSelected,
}: {
  match: MatchWithTeams;
  onEdit: () => void;
  cellHeight: number;
  offsetTop: number;
  isSelected?: boolean;
}) {
  const teamA = match.teamA?.name ?? (match.teamAId ? "???" : "TBD");
  const teamB = match.teamB?.name ?? (match.teamBId ? "???" : "TBD");
  const isFinished = match.status === "FINISHED";
  const isLive = match.status === "LIVE";
  const winA = isFinished && match.scoreA > match.scoreB;
  const winB = isFinished && match.scoreB > match.scoreA;

  return (
    <div
      className="bracket-slot"
      style={{ height: cellHeight, paddingTop: offsetTop }}
    >
      {/* Connector – left vertical bar + horizontal arm */}
      <div className="bracket-connector-left" />

      <button
        type="button"
        className={`bracket-match-btn`}
        onClick={onEdit}
      >
        <div className={`bracket-match-card${isLive ? " bracket-match-card--live" : ""}${isFinished ? " bracket-match-card--finished" : ""}${isSelected ? " bracket-match-card--selected" : ""}`}>
        <div className={`bracket-team ${winA ? "bracket-team--winner" : ""}`}>
          <span className="bracket-team-name">{teamA}</span>
          <strong className="bracket-score">{isFinished || isLive ? match.scoreA : "–"}</strong>
        </div>
        <div className={`bracket-team ${winB ? "bracket-team--winner" : ""}`}>
          <span className="bracket-team-name">{teamB}</span>
          <strong className="bracket-score">{isFinished || isLive ? match.scoreB : "–"}</strong>
        </div>
        {isLive && <span className="bracket-live-indicator">LIVE</span>}
        </div>
      </button>

      {/* Connector – right arm going to next round */}
      <div className="bracket-connector-right" />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function BracketView({
  matches: initialMatches,
  tournamentId,
}: {
  matches: MatchWithTeams[];
  tournamentId: string;
}) {
  const [matches, setMatches] = useState<MatchWithTeams[]>(initialMatches);
  const [editMatch, setEditMatch] = useState<MatchForEdit | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const es = new EventSource(`/api/sse?tournamentId=${tournamentId}`);
    es.addEventListener("match", (event) => {
      const payload = JSON.parse((event as MessageEvent).data);
      if (payload?.data?.match) {
        setMatches((prev) =>
          prev.map((m) => (m.id === payload.data.match.id ? { ...m, ...payload.data.match } : m))
        );
      }
    });
    return () => es.close();
  }, [tournamentId]);

  const bracketMatches = matches.filter((m) => m.phase === "BRACKET");
  const isDE = bracketMatches.some((m) => m.bracketSide === "L");

  const openEdit = (m: MatchWithTeams) => {
    if (selectedId === m.id) {
      setSelectedId(null);
      setEditMatch(null);
      return;
    }
    setSelectedId(m.id);
    setEditMatch({
      id: m.id,
      teamAName: m.teamA?.name ?? (m.teamAId ? "???" : "TBD"),
      teamBName: m.teamB?.name ?? (m.teamBId ? "???" : "TBD"),
      scoreA: m.scoreA,
      scoreB: m.scoreB,
      status: m.status,
      phase: m.phase,
      roundIndex: m.roundIndex,
      courtName: m.courtName,
    });
  };

  const handleSaved = (updated: { id: string; scoreA: number; scoreB: number; status: string }) => {
    setMatches((prev) =>
      prev.map((m) =>
        m.id === updated.id
          ? { ...m, scoreA: updated.scoreA, scoreB: updated.scoreB, status: updated.status as Match["status"] }
          : m
      )
    );
    setEditMatch((prev) =>
      prev?.id === updated.id
        ? { ...prev, scoreA: updated.scoreA, scoreB: updated.scoreB, status: updated.status }
        : prev
    );
  };

  const closePanel = () => {
    setSelectedId(null);
    setEditMatch(null);
  };

  if (bracketMatches.length === 0) {
    return <div className="empty-state"><p>Bracket non encore généré.</p></div>;
  }

  const panel = (
    <MatchEditPanel
      match={editMatch}
      onClose={closePanel}
      onSaved={handleSaved}
    />
  );

  if (isDE) {
    return (
      <div style={{ paddingBottom: editMatch ? 220 : 0 }}>
        <DEBracket matches={bracketMatches} onEdit={openEdit} selectedId={selectedId} />
        {panel}
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: editMatch ? 220 : 0 }}>
      <SEBracket matches={bracketMatches} onEdit={openEdit} selectedId={selectedId} />
      {panel}
    </div>
  );
}

// ── Single Elimination ─────────────────────────────────────────────────────

const CELL_BASE = 96; // px – height of a R1 match slot (including gap)
const CARD_HEIGHT = 72; // px – visual height of the match card

function SEBracket({
  matches,
  onEdit,
  selectedId,
}: {
  matches: MatchWithTeams[];
  onEdit: (m: MatchWithTeams) => void;
  selectedId: string | null;
}) {
  const rounds = new Map<number, MatchWithTeams[]>();
  matches.forEach((m) => {
    const list = rounds.get(m.roundIndex) ?? [];
    list.push(m);
    rounds.set(m.roundIndex, list);
  });

  const maxRound = Math.max(...rounds.keys());
  const r1Count = rounds.get(1)?.length ?? 1;

  return (
    <div className="bracket-tree">
      {Array.from(rounds.entries())
        .sort(([a], [b]) => a - b)
        .map(([roundIdx, roundMatches]) => {
          const r = roundIdx - 1; // 0-indexed
          // Each slot at round r occupies 2^r cells of the base unit
          const slotsPerMatch = Math.pow(2, r);
          const cellH = CELL_BASE * slotsPerMatch;
          // First match offset: half a slot minus half a match
          const firstOffset = (CELL_BASE * slotsPerMatch - CARD_HEIGHT) / 2;

          const label =
            roundIdx === maxRound
              ? "🏆 Finale"
              : roundIdx === maxRound - 1
              ? "Demi-finales"
              : roundIdx === maxRound - 2
              ? "Quarts de finale"
              : `Round ${roundIdx}`;

          return (
            <div key={roundIdx} className="bracket-col">
              <div className="bracket-round-header">{label}</div>
              <div className="bracket-col-body" style={{ height: r1Count * CELL_BASE }}>
                {roundMatches
                  .sort((a, b) => (a.positionInRound ?? 0) - (b.positionInRound ?? 0))
                  .map((m) => (
                    <BracketMatch
                      key={m.id}
                      match={m}
                      onEdit={() => onEdit(m)}
                      cellHeight={cellH}
                      offsetTop={firstOffset}
                      isSelected={selectedId === m.id}
                    />
                  ))}
              </div>
            </div>
          );
        })}
    </div>
  );
}

// ── Double Elimination ─────────────────────────────────────────────────────

function DEBracket({
  matches,
  onEdit,
  selectedId,
}: {
  matches: MatchWithTeams[];
  onEdit: (m: MatchWithTeams) => void;
  selectedId: string | null;
}) {
  const upper = matches.filter((m) => m.bracketSide === "W");
  const lower = matches.filter((m) => m.bracketSide === "L");
  const grand = matches.filter((m) => m.bracketSide === "G");

  const renderSection = (title: string, sectionMatches: MatchWithTeams[], accentClass: string) => {
    const rounds = new Map<number, MatchWithTeams[]>();
    sectionMatches.forEach((m) => {
      const list = rounds.get(m.roundIndex) ?? [];
      list.push(m);
      rounds.set(m.roundIndex, list);
    });
    if (rounds.size === 0) return null;
    const r1Count = Math.max(...Array.from(rounds.values()).map((r) => r.length));

    return (
      <div className={`de-section ${accentClass}`}>
        <h4 className="de-section-title">{title}</h4>
        <div className="bracket-tree">
          {Array.from(rounds.entries())
            .sort(([a], [b]) => a - b)
            .map(([roundIdx, roundMatches]) => {
              const r = roundIdx - 1;
              const slotsPerMatch = Math.pow(2, r);
              const cellH = CELL_BASE * slotsPerMatch;
              const firstOffset = (CELL_BASE * slotsPerMatch - CARD_HEIGHT) / 2;

              return (
                <div key={roundIdx} className="bracket-col">
                  <div className="bracket-round-header">R{roundIdx}</div>
                  <div className="bracket-col-body" style={{ height: r1Count * CELL_BASE }}>
                    {roundMatches
                      .sort((a, b) => (a.positionInRound ?? 0) - (b.positionInRound ?? 0))
                      .map((m) => (
                        <BracketMatch
                          key={m.id}
                          match={m}
                          onEdit={() => onEdit(m)}
                          cellHeight={cellH}
                          offsetTop={firstOffset}
                          isSelected={selectedId === m.id}
                        />
                      ))}
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    );
  };

  return (
    <div className="de-bracket">
      {renderSection("🏅 Upper Bracket", upper, "de-section--upper")}
      {renderSection("🔁 Lower Bracket", lower, "de-section--lower")}
      {renderSection("🏆 Grande Finale", grand, "de-section--grand")}
    </div>
  );
}

