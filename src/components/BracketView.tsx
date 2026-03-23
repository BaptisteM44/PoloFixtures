"use client";

import { useEffect, useRef, useState } from "react";
import { Match, Team } from "@prisma/client";
import { MatchEditPanel, type MatchForEdit } from "./MatchEditPanel";

export type MatchWithTeams = Match & { teamA?: Team | null; teamB?: Team | null };

const SE_ROUND_NAMES: Record<number, string> = {
  1: "Quarts", 2: "Demies", 3: "Finale", 4: "Finale",
};

const DE_ROUND_NAMES: Record<string, string> = {
  "W1": "UB Quarts", "W2": "UB Demies", "W3": "UB Finale",
  "L1": "LB R1", "L2": "LB R2", "L3": "LB Finale",
  "G4": "Grande Finale", "G3": "Grande Finale",
};

// ── Single match card ─────────────────────────────────────────────────────

const CARD_W = 180;
const COL_W = 220;
const CELL_BASE = 96;
const CARD_H = 72;
const CARD_OFFSET_X = (COL_W - CARD_W) / 2; // 20px centré dans la colonne

function BracketCard({
  match,
  onEdit,
  isSelected,
  matchNumber,
}: {
  match: MatchWithTeams;
  onEdit: () => void;
  isSelected?: boolean;
  matchNumber?: number;
}) {
  const teamA = match.teamA?.name ?? (match.teamAId ? "???" : "TBD");
  const teamB = match.teamB?.name ?? (match.teamBId ? "???" : "TBD");
  const isFinished = match.status === "FINISHED";
  const isLive = match.status === "LIVE";
  const winA = isFinished && match.scoreA > match.scoreB;
  const winB = isFinished && match.scoreB > match.scoreA;

  return (
    <button
      type="button"
      className={`bracket-match-btn`}
      onClick={onEdit}
    >
      <div className={[
        "bracket-match-card",
        isLive ? "bracket-match-card--live" : "",
        isFinished ? "bracket-match-card--finished" : "",
        isSelected ? "bracket-match-card--selected" : "",
      ].join(" ")}>
        {matchNumber !== undefined && (
          <div className="bracket-match-number">#{matchNumber}</div>
        )}
        {isLive && <span className="bracket-live-indicator">LIVE</span>}
        <div className={`bracket-team ${winA ? "bracket-team-row--winner" : ""}`}>
          <span className="bracket-team-name">{teamA}</span>
          <strong className="bracket-score">{isFinished || isLive ? match.scoreA : "–"}</strong>
        </div>
        <div className={`bracket-team ${winB ? "bracket-team-row--winner" : ""}`}>
          <span className="bracket-team-name">{teamB}</span>
          <strong className="bracket-score">{isFinished || isLive ? match.scoreB : "–"}</strong>
        </div>
      </div>
    </button>
  );
}

// ── Scroll wrapper with fade indicator ────────────────────────────────────

function ScrollWrapper({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      setCanScrollLeft(el.scrollLeft > 4);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    };
    check();
    el.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => { el.removeEventListener("scroll", check); window.removeEventListener("resize", check); };
  }, []);

  return (
    <div className="bracket-scroll-wrapper">
      {canScrollLeft && <div className="bracket-scroll-fade bracket-scroll-fade--left" />}
      <div className="bracket-scroll-inner" ref={ref}>
        {children}
      </div>
      {canScrollRight && <div className="bracket-scroll-fade bracket-scroll-fade--right" />}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

type TeamOption = { id: string; name: string };

export function BracketView({
  matches: initialMatches,
  tournamentId,
  teams,
}: {
  matches: MatchWithTeams[];
  tournamentId: string;
  teams?: TeamOption[];
}) {
  const [matches, setMatches] = useState<MatchWithTeams[]>(initialMatches);
  const [editMatch, setEditMatch] = useState<MatchForEdit | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const es = new EventSource(`/api/sse?tournamentId=${tournamentId}`);
    es.addEventListener("match", (event) => {
      const payload = JSON.parse((event as MessageEvent).data);
      // Match update depuis events route: payload.data.match
      // Match update depuis PUT route: payload.data directement
      const updated: Partial<MatchWithTeams> =
        payload?.data?.match ?? (payload?.data?.id ? payload.data : null);
      if (updated?.id) {
        setMatches((prev) =>
          prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m))
        );
      }
    });
    return () => es.close();
  }, [tournamentId]);

  const bracketMatches = matches.filter((m) => m.phase === "BRACKET");
  const isDE = bracketMatches.some((m) => m.bracketSide === "L");

  const openEdit = (m: MatchWithTeams) => {
    if (selectedId === m.id) { setSelectedId(null); setEditMatch(null); return; }
    setSelectedId(m.id);
    setEditMatch({
      id: m.id,
      teamAId: m.teamAId, teamBId: m.teamBId,
      teamAName: m.teamA?.name ?? (m.teamAId ? "???" : "TBD"),
      teamBName: m.teamB?.name ?? (m.teamBId ? "???" : "TBD"),
      scoreA: m.scoreA, scoreB: m.scoreB, status: m.status,
      phase: m.phase, roundIndex: m.roundIndex, courtName: m.courtName,
    });
  };

  const handleSaved = (updated: { id: string; scoreA: number; scoreB: number; status: string; teamAId?: string | null; teamBId?: string | null }) => {
    setMatches((prev) =>
      prev.map((m) => {
        if (m.id !== updated.id) return m;
        const patched: MatchWithTeams = { ...m, scoreA: updated.scoreA, scoreB: updated.scoreB, status: updated.status as Match["status"] };
        if (updated.teamAId !== undefined) {
          patched.teamAId = updated.teamAId;
          patched.teamA = teams?.find((t) => t.id === updated.teamAId) as Team | undefined ?? null;
        }
        if (updated.teamBId !== undefined) {
          patched.teamBId = updated.teamBId;
          patched.teamB = teams?.find((t) => t.id === updated.teamBId) as Team | undefined ?? null;
        }
        return patched;
      })
    );
    setEditMatch((prev) =>
      prev?.id === updated.id ? { ...prev, scoreA: updated.scoreA, scoreB: updated.scoreB, status: updated.status } : prev
    );
  };

  if (bracketMatches.length === 0) {
    return <div className="empty-state"><p>Bracket non encore généré.</p></div>;
  }

  const panel = <MatchEditPanel match={editMatch} onClose={() => { setSelectedId(null); setEditMatch(null); }} onSaved={handleSaved} teams={teams} />;

  return (
    <div>
      <ScrollWrapper>
        {isDE
          ? <DEBracket matches={bracketMatches} onEdit={openEdit} selectedId={selectedId} />
          : <SEBracket matches={bracketMatches} onEdit={openEdit} selectedId={selectedId} />
        }
      </ScrollWrapper>
      {panel}
    </div>
  );
}

// ── Single Elimination ─────────────────────────────────────────────────────

function SEBracket({ matches, onEdit, selectedId }: {
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

  const sortedRounds = Array.from(rounds.entries()).sort(([a], [b]) => a - b);
  const maxRound = Math.max(...rounds.keys());
  // Total height based on the full bracket size (2^(maxRound-1) slots in R1)
  const fullR1Slots = Math.pow(2, maxRound - 1);
  const totalHeight = fullR1Slots * CELL_BASE;

  // Numérotation séquentielle des matchs R1→finale
  let matchCounter = 1;
  const matchNumbers = new Map<string, number>();
  for (const [, roundMatches] of sortedRounds) {
    const sorted = [...roundMatches].sort((a, b) => (a.positionInRound ?? 0) - (b.positionInRound ?? 0));
    for (const m of sorted) {
      matchNumbers.set(m.id, matchCounter++);
    }
  }

  return (
    <div className="bracket-tree">
      {sortedRounds.map(([roundIdx, roundMatches]) => {
        const r = roundIdx - sortedRounds[0][0];
        // Taille de slot : chaque match "représente" 2^r matchs du premier round
        const slotsPerMatch = Math.pow(2, r);
        const cellH = CELL_BASE * slotsPerMatch;

        const label = roundIdx === maxRound ? "🏆 Finale"
          : roundIdx === maxRound - 1 ? "Demi-finales"
          : roundIdx === maxRound - 2 ? "Quarts"
          : `Round ${roundIdx}`;

        const sorted = [...roundMatches].sort((a, b) => (a.positionInRound ?? 0) - (b.positionInRound ?? 0));

        return (
          <div key={roundIdx} className="bracket-col">
            <div className="bracket-round-header">{label}</div>
            <div className="bracket-col-body" style={{ height: totalHeight, position: "relative" }}>
              {sorted.map((m) => {
                // Use positionInRound for placement (not index) to handle skipped BYEs
                const pos = m.positionInRound ?? 0;
                const top = pos * cellH + (cellH - CARD_H) / 2;
                return (
                  <div key={m.id} style={{ position: "absolute", top, left: CARD_OFFSET_X, width: CARD_W }}>
                    <BracketCard
                      match={m}
                      onEdit={() => onEdit(m)}
                      isSelected={selectedId === m.id}
                      matchNumber={matchNumbers.get(m.id)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Double Elimination ─────────────────────────────────────────────────────

function DEBracket({ matches, onEdit, selectedId }: {
  matches: MatchWithTeams[];
  onEdit: (m: MatchWithTeams) => void;
  selectedId: string | null;
}) {
  const upper = matches.filter((m) => m.bracketSide === "W");
  const lower = matches.filter((m) => m.bracketSide === "L");
  const grand = matches.filter((m) => m.bracketSide === "G");

  let matchCounter = 1;
  const matchNumbers = new Map<string, number>();
  for (const group of [upper, lower, grand]) {
    const sorted = [...group].sort((a, b) => (a.roundIndex - b.roundIndex) || (a.positionInRound ?? 0) - (b.positionInRound ?? 0));
    for (const m of sorted) matchNumbers.set(m.id, matchCounter++);
  }

  const renderSection = (title: string, sectionMatches: MatchWithTeams[], accentClass: string) => {
    const rounds = new Map<number, MatchWithTeams[]>();
    sectionMatches.forEach((m) => {
      const list = rounds.get(m.roundIndex) ?? [];
      list.push(m);
      rounds.set(m.roundIndex, list);
    });
    if (rounds.size === 0) return null;
    const sortedR = Array.from(rounds.entries()).sort(([a], [b]) => a - b);
    // Height based on max positionInRound across all rounds (handles skipped BYEs)
    const maxPos = Math.max(...sectionMatches.map((m) => (m.positionInRound ?? 0) + 1));
    const totalH = maxPos * CELL_BASE;

    return (
      <div className={`de-section ${accentClass}`}>
        <h4 className="de-section-title">{title}</h4>
        <div className="bracket-tree">
          {sortedR.map(([roundIdx, roundMatches]) => {
            const rKey = `${sectionMatches[0]?.bracketSide ?? ""}${roundIdx}`;
            const label = DE_ROUND_NAMES[rKey] ?? `R${roundIdx}`;
            const sorted = [...roundMatches].sort((a, b) => (a.positionInRound ?? 0) - (b.positionInRound ?? 0));

            return (
              <div key={roundIdx} className="bracket-col">
                <div className="bracket-round-header">{label}</div>
                {/* Position absolue : chaque carte centrée dans son slot CELL_BASE */}
                <div className="bracket-col-body" style={{ height: totalH, position: "relative" }}>
                  {sorted.map((m) => {
                    const pos = m.positionInRound ?? 0;
                    const top = pos * CELL_BASE + (CELL_BASE - CARD_H) / 2;
                    return (
                      <div key={m.id} style={{ position: "absolute", top, left: CARD_OFFSET_X, width: CARD_W }}>
                        <BracketCard
                          match={m}
                          onEdit={() => onEdit(m)}
                          isSelected={selectedId === m.id}
                          matchNumber={matchNumbers.get(m.id)}
                        />
                      </div>
                    );
                  })}
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
