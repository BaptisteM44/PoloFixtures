"use client";

import { useEffect, useRef, useState } from "react";
import { Match, Team } from "@prisma/client";
import { MatchEditPanel, type MatchForEdit } from "./MatchEditPanel";

export type MatchWithTeams = Match & { teamA?: Team | null; teamB?: Team | null };

function getDERoundLabel(side: string, roundIndex: number, maxUpperRound: number, maxLowerRound: number): string {
  if (side === "G") return "Grande Finale";
  if (side === "W") {
    if (roundIndex === maxUpperRound) return "WB Finale";
    if (roundIndex === maxUpperRound - 1) return "WB Demies";
    if (roundIndex === maxUpperRound - 2) return "WB Quarts";
    return `WB R${roundIndex}`;
  }
  if (roundIndex === maxLowerRound) return "LB Finale";
  return `LB R${roundIndex}`;
}

// ── Layout constants ────────────────────────────────────────────────────

const CARD_W = 170;
const CARD_H = 64;
const COL_GAP = 48;    // horizontal gap between round columns (space for lines)
const COL_W = CARD_W + COL_GAP;
const CELL_BASE = 76;  // vertical slot height per match in R1
const CARD_OFFSET_X = 0;

// ── Single match card ─────────────────────────────────────────────────────

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
    <button type="button" className="bracket-match-btn" onClick={onEdit}>
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
      nextMatchWinId: m.nextMatchWinId,
      nextSlotWin: m.nextSlotWin,
    });
  };

  const handleSaved = (updated: {
    id: string;
    scoreA: number;
    scoreB: number;
    status: string;
    teamAId?: string | null;
    teamBId?: string | null;
    advance?: { nextMatchId: string; slot: "A" | "B"; winnerTeamId: string };
  }) => {
    setMatches((prev) => {
      const next = prev.map((m) => {
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
      });

      if (updated.advance) {
        const source = next.find((m) => m.id === updated.id);
        const winnerTeam = source
          ? (updated.advance.winnerTeamId === source.teamAId ? source.teamA : updated.advance.winnerTeamId === source.teamBId ? source.teamB : null)
          : null;

        const target = next.find((m) => m.id === updated.advance?.nextMatchId);
        if (target) {
          if (updated.advance.slot === "A") {
            target.teamAId = updated.advance.winnerTeamId;
            target.teamA = (teams?.find((t) => t.id === updated.advance?.winnerTeamId) as Team | undefined) ?? winnerTeam ?? target.teamA;
          } else {
            target.teamBId = updated.advance.winnerTeamId;
            target.teamB = (teams?.find((t) => t.id === updated.advance?.winnerTeamId) as Team | undefined) ?? winnerTeam ?? target.teamB;
          }
        }
      }

      return next;
    });
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
  const fullR1Slots = Math.pow(2, maxRound - 1);
  const totalHeight = fullR1Slots * CELL_BASE;
  const headerOffset = 28;

  // Numbering
  let matchCounter = 1;
  const matchNumbers = new Map<string, number>();
  for (const [, roundMatches] of sortedRounds) {
    const sorted = [...roundMatches].sort((a, b) => (a.positionInRound ?? 0) - (b.positionInRound ?? 0));
    for (const m of sorted) matchNumbers.set(m.id, matchCounter++);
  }

  // Compute positions
  const matchPositions = new Map<string, { colIdx: number; y: number }>();
  sortedRounds.forEach(([roundIdx, roundMatches], colIdx) => {
    const r = roundIdx - sortedRounds[0][0];
    const cellH = CELL_BASE * Math.pow(2, r);
    const sorted = [...roundMatches].sort((a, b) => (a.positionInRound ?? 0) - (b.positionInRound ?? 0));
    sorted.forEach((m) => {
      const pos = m.positionInRound ?? 0;
      const top = pos * cellH + (cellH - CARD_H) / 2;
      matchPositions.set(m.id, { colIdx, y: top });
    });
  });

  // Build SVG lines using nextMatchWinId
  const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  matches.forEach((m) => {
    if (!m.nextMatchWinId) return;
    const src = matchPositions.get(m.id);
    const dst = matchPositions.get(m.nextMatchWinId);
    if (!src || !dst) return;
    lines.push({
      x1: src.colIdx * COL_W + CARD_W,
      y1: src.y + CARD_H / 2 + headerOffset,
      x2: dst.colIdx * COL_W,
      y2: dst.y + CARD_H / 2 + headerOffset,
    });
  });

  const totalWidth = sortedRounds.length * COL_W;

  return (
    <div className="bracket-tree" style={{ position: "relative", width: totalWidth, minHeight: totalHeight + headerOffset }}>
      <svg
        width={totalWidth}
        height={totalHeight + headerOffset}
        style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
      >
        {lines.map((l, i) => {
          const midX = (l.x1 + l.x2) / 2;
          return (
            <path
              key={i}
              d={`M ${l.x1} ${l.y1} H ${midX} V ${l.y2} H ${l.x2}`}
              fill="none"
              stroke="var(--border-light)"
              strokeWidth="1.5"
            />
          );
        })}
      </svg>

      {sortedRounds.map(([roundIdx, roundMatches], colIdx) => {
        const r = roundIdx - sortedRounds[0][0];
        const cellH = CELL_BASE * Math.pow(2, r);
        const x = colIdx * COL_W;

        const label = roundIdx === maxRound ? "Finale"
          : roundIdx === maxRound - 1 ? "Demies"
          : roundIdx === maxRound - 2 ? "Quarts"
          : `R${roundIdx}`;

        const sorted = [...roundMatches].sort((a, b) => (a.positionInRound ?? 0) - (b.positionInRound ?? 0));

        return (
          <div key={roundIdx} style={{ position: "absolute", left: x, top: 0, width: CARD_W }}>
            <div className="bracket-round-header">{label}</div>
            {sorted.map((m) => {
              const pos = m.positionInRound ?? 0;
              const top = pos * cellH + (cellH - CARD_H) / 2 + headerOffset;
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

  const maxUpperRound = upper.length > 0 ? Math.max(...upper.map((m) => m.roundIndex)) : 1;
  const maxLowerRound = lower.length > 0 ? Math.max(...lower.map((m) => m.roundIndex)) : 1;

  // Interleaved match numbering
  let matchCounter = 1;
  const matchNumbers = new Map<string, number>();
  {
    const upperByRound = new Map<number, MatchWithTeams[]>();
    const lowerByRound = new Map<number, MatchWithTeams[]>();
    for (const m of upper) {
      if (!upperByRound.has(m.roundIndex)) upperByRound.set(m.roundIndex, []);
      upperByRound.get(m.roundIndex)!.push(m);
    }
    for (const m of lower) {
      if (!lowerByRound.has(m.roundIndex)) lowerByRound.set(m.roundIndex, []);
      lowerByRound.get(m.roundIndex)!.push(m);
    }
    for (const arr of [...upperByRound.values(), ...lowerByRound.values()]) {
      arr.sort((a, b) => (a.positionInRound ?? 0) - (b.positionInRound ?? 0));
    }

    const numUpper = upperByRound.size > 0 ? Math.max(...upperByRound.keys()) : 0;
    const numberRound = (ms: MatchWithTeams[]) => {
      for (const m of ms) matchNumbers.set(m.id, matchCounter++);
    };

    numberRound(upperByRound.get(1) ?? []);
    numberRound(upperByRound.get(2) ?? []);
    numberRound(lowerByRound.get(1) ?? []);
    numberRound(lowerByRound.get(2) ?? []);
    for (let k = 3; k <= numUpper; k++) {
      numberRound(upperByRound.get(k) ?? []);
      numberRound(lowerByRound.get(2 * k - 3) ?? []);
      numberRound(lowerByRound.get(2 * k - 2) ?? []);
    }
    for (const m of grand) matchNumbers.set(m.id, matchCounter++);
  }

  // Render a bracket section (UB / LB / GF) with connector lines
  const renderTreeSection = (
    title: string,
    sectionMatches: MatchWithTeams[],
    accentClass: string,
    useTreeSpacing: boolean, // true for UB (exponential), false for LB (flat)
  ) => {
    const rounds = new Map<number, MatchWithTeams[]>();
    sectionMatches.forEach((m) => {
      const list = rounds.get(m.roundIndex) ?? [];
      list.push(m);
      rounds.set(m.roundIndex, list);
    });
    if (rounds.size === 0) return null;
    const sortedR = Array.from(rounds.entries()).sort(([a], [b]) => a - b);
    const side = sectionMatches[0]?.bracketSide ?? "W";

    // Compute positions
    const firstRoundCount = (rounds.get(sortedR[0][0]) ?? []).length;
    const sectionHeight = useTreeSpacing
      ? firstRoundCount * CELL_BASE * Math.pow(2, sortedR.length - 1)
      : (Math.max(...sectionMatches.map(m => (m.positionInRound ?? 0) + 1)) * CELL_BASE);
    const cappedH = Math.min(sectionHeight, firstRoundCount * CELL_BASE * 4);
    const effectiveH = useTreeSpacing ? cappedH : sectionHeight;

    const matchPositions = new Map<string, { colIdx: number; y: number }>();
    const roundCols: Array<{ x: number; matches: Array<{ y: number; nextY: number | null; nextCol: number | null }> }> = [];

    sortedR.forEach(([roundIdx, roundMatches], colIdx) => {
      const sorted = [...roundMatches].sort((a, b) => (a.positionInRound ?? 0) - (b.positionInRound ?? 0));
      const x = colIdx * COL_W;
      const colData: typeof roundCols[0] = { x, matches: [] };

      if (useTreeSpacing) {
        const cellH = effectiveH / Math.max(sorted.length, 1);
        sorted.forEach((m, i) => {
          const top = i * cellH + (cellH - CARD_H) / 2;
          matchPositions.set(m.id, { colIdx, y: top });
          colData.matches.push({ y: top, nextY: null, nextCol: null });
        });
      } else {
        sorted.forEach((m) => {
          const pos = m.positionInRound ?? 0;
          const top = pos * CELL_BASE + (CELL_BASE - CARD_H) / 2;
          matchPositions.set(m.id, { colIdx, y: top });
          colData.matches.push({ y: top, nextY: null, nextCol: null });
        });
      }

      roundCols.push(colData);
    });

    // Compute lines: connect via nextMatchWinId
    sectionMatches.forEach((m) => {
      if (!m.nextMatchWinId) return;
      const srcPos = matchPositions.get(m.id);
      const dstPos = matchPositions.get(m.nextMatchWinId);
      if (!srcPos || !dstPos) return;

      const colMatch = roundCols[srcPos.colIdx]?.matches.find(cm => Math.abs(cm.y - srcPos.y) < 1);
      if (colMatch) {
        colMatch.nextY = dstPos.y;
        colMatch.nextCol = dstPos.colIdx;
      }
    });

    const totalWidth = sortedR.length * COL_W;
    const headerOffset = 28;

    return (
      <div className={`de-section ${accentClass}`}>
        <h4 className="de-section-title">{title}</h4>
        <div style={{ position: "relative", width: totalWidth, minHeight: effectiveH + headerOffset }}>
          <svg
            width={totalWidth}
            height={effectiveH + headerOffset}
            style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
          >
            {roundCols.map((col, colIdx) =>
              col.matches.map((cm, mIdx) => {
                if (cm.nextY === null || cm.nextCol === null) return null;
                const nextCol = roundCols[cm.nextCol];
                if (!nextCol) return null;

                const x1 = col.x + CARD_W;
                const y1 = cm.y + CARD_H / 2 + headerOffset;
                const x2 = nextCol.x;
                const y2 = cm.nextY + CARD_H / 2 + headerOffset;
                const midX = (x1 + x2) / 2;

                return (
                  <path
                    key={`${colIdx}-${mIdx}`}
                    d={`M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`}
                    fill="none"
                    stroke="var(--border-light)"
                    strokeWidth="1.5"
                  />
                );
              })
            )}
          </svg>

          {sortedR.map(([roundIdx, roundMatches], colIdx) => {
            const label = getDERoundLabel(side, roundIdx, maxUpperRound, maxLowerRound);
            const sorted = [...roundMatches].sort((a, b) => (a.positionInRound ?? 0) - (b.positionInRound ?? 0));
            const x = colIdx * COL_W;

            return (
              <div key={roundIdx} style={{ position: "absolute", left: x, top: 0, width: CARD_W }}>
                <div className="bracket-round-header">{label}</div>
                {sorted.map((m) => {
                  const pos = matchPositions.get(m.id);
                  if (!pos) return null;
                  const top = pos.y + headerOffset;
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
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="de-bracket">
      {renderTreeSection("Upper Bracket", upper, "de-section--upper", true)}
      {renderTreeSection("Lower Bracket", lower, "de-section--lower", false)}
      {renderTreeSection("Grande Finale", grand, "de-section--grand", false)}
    </div>
  );
}
