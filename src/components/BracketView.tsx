"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Match, Team } from "@prisma/client";
import { MatchEditPanel, type MatchForEdit } from "./MatchEditPanel";

export type MatchWithTeams = Match & { teamA?: Team | null; teamB?: Team | null; referee?: { id: string; name: string } | null; coReferee?: { id: string; name: string } | null };

type TeamOption = { id: string; name: string; bracketNumber?: number };

const CARD_W = 170;
const FIRST_COL_CARD_W = 146;
const CARD_H = 64;
const COL_GAP = 48;
const FIRST_COL_GAP = 28;
const CELL_BASE = 76;
const CARD_OFFSET_X = 0;

function getDERoundLabel(side: string, roundIndex: number, maxUpperRound: number, maxLowerRound: number, crossPool = false): string {
  if (side === "G") return roundIndex === 2 ? "Bracket Reset" : "Finale";
  if (side === "W") {
    // Cross-pool: round 1 of W side is SE elimination, DE upper starts at round 2
    if (crossPool && roundIndex === 1) return "Élimination";
    if (roundIndex === maxUpperRound) return "Finale WB";
    if (roundIndex === maxUpperRound - 1) return "Demi-Finales";
    // Shift tour label for cross-pool so DE R2 shows "Tour 1" not "Tour 2"
    const displayRound = crossPool ? roundIndex - 1 : roundIndex;
    return `Tour ${displayRound}`;
  }
  if (maxLowerRound <= 1) return "Manche des perdants";
  return `Manche des perdants ${roundIndex}`;
}

function getColumnMetrics(count: number) {
  const metrics: Array<{ x: number; cardWidth: number; gap: number }> = [];
  let x = 0;

  for (let index = 0; index < count; index += 1) {
    const cardWidth = index === 0 ? FIRST_COL_CARD_W : CARD_W;
    const gap = index === 0 ? FIRST_COL_GAP : COL_GAP;
    metrics.push({ x, cardWidth, gap });
    x += cardWidth + gap;
  }

  const last = metrics[metrics.length - 1];
  return {
    metrics,
    totalWidth: last ? last.x + last.cardWidth : 0,
  };
}

function BracketCard({
  match,
  onEdit,
  isSelected,
  matchNumber,
  teamANumber,
  teamBNumber,
  compact = false,
}: {
  match: MatchWithTeams;
  onEdit: () => void;
  isSelected?: boolean;
  matchNumber?: number;
  teamANumber?: number;
  teamBNumber?: number;
  compact?: boolean;
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
      className={["bracket-match-btn", compact ? "bracket-match-btn--compact" : ""].join(" ")}
      onClick={onEdit}
    >
      <div
        className={[
          "bracket-match-card",
          compact ? "bracket-match-card--compact" : "",
          isLive ? "bracket-match-card--live" : "",
          isFinished ? "bracket-match-card--finished" : "",
          isSelected ? "bracket-match-card--selected" : "",
        ].join(" ")}
      >
        {matchNumber !== undefined && <div className="bracket-match-number">#{matchNumber}</div>}
        {isLive && <span className="bracket-live-indicator">LIVE</span>}
        <div className={`bracket-team ${winA ? "bracket-team-row--winner" : ""}`}>
          <span className="bracket-team-seed">{teamANumber ?? ""}</span>
          <span className="bracket-team-name">{teamA}</span>
          <strong className="bracket-score">{isFinished || isLive ? match.scoreA : "–"}</strong>
        </div>
        <div className={`bracket-team ${winB ? "bracket-team-row--winner" : ""}`}>
          <span className="bracket-team-seed">{teamBNumber ?? ""}</span>
          <span className="bracket-team-name">{teamB}</span>
          <strong className="bracket-score">{isFinished || isLive ? match.scoreB : "–"}</strong>
        </div>
        {(match.referee || match.coReferee) && (
          <div className="bracket-match-referees">
            🦓 {[match.referee?.name, match.coReferee?.name].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>
    </button>
  );
}

function FitWrapper({ children }: { children: React.ReactNode }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const content = contentRef.current;
    if (!frame || !content) return;

    const update = () => {
      const frameWidth = frame.clientWidth;
      const contentWidth = content.scrollWidth;
      const contentHeight = content.scrollHeight;
      const nextScale = contentWidth > 0 ? Math.min(1, frameWidth / contentWidth) : 1;
      setScale(nextScale);
      setHeight(contentHeight * nextScale);
    };

    update();

    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(frame);
    resizeObserver.observe(content);
    window.addEventListener("resize", update);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [children]);

  return (
    <div className="bracket-fit-frame" ref={frameRef} style={height ? { height } : undefined}>
      <div className="bracket-fit-content" ref={contentRef} style={{ transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}

export function BracketView({
  matches: initialMatches,
  tournamentId,
  teams,
  isOrganizer,
  isLive = false,
  crossPool = false,
}: {
  matches: MatchWithTeams[];
  tournamentId: string;
  teams?: TeamOption[];
  isOrganizer?: boolean;
  isLive?: boolean;
  crossPool?: boolean;
}) {
  const t = useTranslations("tournament");
  const [matches, setMatches] = useState<MatchWithTeams[]>(initialMatches);
  const [editMatch, setEditMatch] = useState<MatchForEdit | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!isLive) return;
    const es = new EventSource(`/api/sse?tournamentId=${tournamentId}`);
    es.addEventListener("match", (event) => {
      const payload = JSON.parse((event as MessageEvent).data);
      const updated: Partial<MatchWithTeams> =
        payload?.data?.match ?? (payload?.data?.id ? payload.data : null);
      if (updated?.id) {
        setMatches((prev) => prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)));
      }
    });
    return () => es.close();
  }, [tournamentId, isLive]);

  const bracketMatches = matches.filter((m) => m.phase === "BRACKET");
  // SWISS_SPLIT_SE: detect by presence of B/BG/BL bracket sides
  const isSplitSE = bracketMatches.some((m) => m.bracketSide === "B" || m.bracketSide === "BG" || m.bracketSide === "BL");
  // DE has multiple L matches; SE 3rd place has exactly one L or BL match
  const lMatches = bracketMatches.filter((m) => m.bracketSide === "L" || m.bracketSide === "BL");
  const isDE = !isSplitSE && bracketMatches.some((m) => m.bracketSide === "L") && lMatches.length > 1;
  const has3rdPlace = !isDE && lMatches.length === 1;
  const teamNumberById = new Map((teams ?? []).map((team) => [team.id, team.bracketNumber]));

  const openEdit = (m: MatchWithTeams) => {
    if (selectedId === m.id) {
      setSelectedId(null);
      setEditMatch(null);
      return;
    }
    setSelectedId(m.id);
    setEditMatch({
      id: m.id,
      teamAId: m.teamAId,
      teamBId: m.teamBId,
      teamAName: m.teamA?.name ?? (m.teamAId ? "???" : "TBD"),
      teamBName: m.teamB?.name ?? (m.teamBId ? "???" : "TBD"),
      scoreA: m.scoreA,
      scoreB: m.scoreB,
      status: m.status,
      phase: m.phase,
      roundIndex: m.roundIndex,
      courtName: m.courtName,
      nextMatchWinId: m.nextMatchWinId,
      nextSlotWin: m.nextSlotWin,
      refereePlayerId: m.refereePlayerId,
      coRefereePlayerId: m.coRefereePlayerId,
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
        const patched: MatchWithTeams = {
          ...m,
          scoreA: updated.scoreA,
          scoreB: updated.scoreB,
          status: updated.status as Match["status"],
        };
        if (updated.teamAId !== undefined) {
          patched.teamAId = updated.teamAId;
          patched.teamA = (teams?.find((t) => t.id === updated.teamAId) as Team | undefined) ?? null;
        }
        if (updated.teamBId !== undefined) {
          patched.teamBId = updated.teamBId;
          patched.teamB = (teams?.find((t) => t.id === updated.teamBId) as Team | undefined) ?? null;
        }
        return patched;
      });

      if (updated.advance) {
        const advance = updated.advance;
        const source = next.find((m) => m.id === updated.id);
        const winnerTeam = source
          ? advance.winnerTeamId === source.teamAId
            ? source.teamA
            : advance.winnerTeamId === source.teamBId
              ? source.teamB
              : null
          : null;

        const target = next.find((m) => m.id === advance.nextMatchId);
        if (target) {
          if (advance.slot === "A") {
            target.teamAId = advance.winnerTeamId;
            target.teamA = (teams?.find((t) => t.id === advance.winnerTeamId) as Team | undefined) ?? winnerTeam ?? target.teamA;
          } else {
            target.teamBId = advance.winnerTeamId;
            target.teamB = (teams?.find((t) => t.id === advance.winnerTeamId) as Team | undefined) ?? winnerTeam ?? target.teamB;
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
    return <div className="empty-state"><p>{t("bracket_not_generated")}</p></div>;
  }

  return (
    <div>
      <FitWrapper>
        {isSplitSE
          ? <SplitSEBracket matches={bracketMatches} onEdit={openEdit} selectedId={selectedId} teamNumberById={teamNumberById} />
          : isDE
          ? <DEBracket matches={bracketMatches} onEdit={openEdit} selectedId={selectedId} teamNumberById={teamNumberById} crossPool={crossPool} />
          : <SEBracket matches={bracketMatches} onEdit={openEdit} selectedId={selectedId} teamNumberById={teamNumberById} />}
      </FitWrapper>
      <MatchEditPanel
        match={editMatch}
        onClose={() => { setSelectedId(null); setEditMatch(null); }}
        onSaved={handleSaved}
        isOrganizer={isOrganizer}
        teams={teams}
      />
    </div>
  );
}

function SEBracket({ matches, onEdit, selectedId, teamNumberById }: {
  matches: MatchWithTeams[];
  onEdit: (m: MatchWithTeams) => void;
  selectedId: string | null;
  teamNumberById: Map<string, number | undefined>;
}) {
  const rounds = new Map<number, MatchWithTeams[]>();
  matches.forEach((m) => {
    const list = rounds.get(m.roundIndex) ?? [];
    list.push(m);
    rounds.set(m.roundIndex, list);
  });

  const sortedRounds = Array.from(rounds.entries()).sort(([a], [b]) => a - b);
  const maxRound = Math.max(...rounds.keys());
  const headerOffset = 28;
  const { metrics: colMetrics, totalWidth } = getColumnMetrics(sortedRounds.length);

  // Compute the "virtual" R1 slot count: the round with the most matches defines the base
  // For standard power-of-2 brackets this equals 2^(maxRound-1)
  // For non-power-of-2 (e.g. 9 teams: R1 has 1 match, R2 has 4), we need to find the
  // round that has the most matches and use positionInRound to compute the virtual grid size
  const virtualR1Slots = (() => {
    // Find the largest positionInRound across all matches to derive the grid height
    let maxPos = 0;
    for (const [roundIdx, roundMatches] of rounds) {
      const r = roundIdx - 1;
      const divisor = Math.pow(2, r);
      for (const m of roundMatches) {
        const virtualPos = (m.positionInRound ?? 0) * divisor + divisor - 1;
        if (virtualPos > maxPos) maxPos = virtualPos;
      }
    }
    return maxPos + 1;
  })();

  const totalHeight = virtualR1Slots * CELL_BASE;

  const matchNumbers = new Map<string, number>();
  let matchCounter = 1;
  for (const [, roundMatches] of sortedRounds) {
    const sorted = [...roundMatches].sort((a, b) => (a.positionInRound ?? 0) - (b.positionInRound ?? 0));
    for (const m of sorted) matchNumbers.set(m.id, matchCounter++);
  }

  const matchPositions = new Map<string, { colIdx: number; y: number }>();
  sortedRounds.forEach(([roundIdx, roundMatches], colIdx) => {
    // Always relative to round 1 so spacing is correct even when R1 is absent (BYEs)
    const r = roundIdx - 1;
    const cellH = CELL_BASE * Math.pow(2, r);
    const sorted = [...roundMatches].sort((a, b) => (a.positionInRound ?? 0) - (b.positionInRound ?? 0));
    sorted.forEach((m) => {
      const pos = m.positionInRound ?? 0;
      const top = pos * cellH + (cellH - CARD_H) / 2;
      matchPositions.set(m.id, { colIdx, y: top });
    });
  });

  const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  matches.forEach((m) => {
    if (!m.nextMatchWinId) return;
    const src = matchPositions.get(m.id);
    const dst = matchPositions.get(m.nextMatchWinId);
    if (!src || !dst) return;
    lines.push({
      x1: colMetrics[src.colIdx].x + colMetrics[src.colIdx].cardWidth,
      y1: src.y + CARD_H / 2 + headerOffset,
      x2: colMetrics[dst.colIdx].x,
      y2: dst.y + CARD_H / 2 + headerOffset,
    });
  });

  return (
    <div className="bracket-tree" style={{ position: "relative", width: totalWidth, minHeight: totalHeight + headerOffset }}>
      <svg width={totalWidth} height={totalHeight + headerOffset} style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}>
        {lines.map((line, index) => {
          const elbowX = line.x1 + 14;
          return (
            <path
              key={index}
              d={`M ${line.x1} ${line.y1} H ${elbowX} V ${line.y2} H ${line.x2}`}
              fill="none"
              stroke="var(--text-muted)"
              strokeWidth="1.8"
            />
          );
        })}
      </svg>

      {sortedRounds.map(([roundIdx, roundMatches], colIdx) => {
        const r = roundIdx - 1;
        const cellH = CELL_BASE * Math.pow(2, r);
        const x = colMetrics[colIdx].x;
        const cardWidth = colMetrics[colIdx].cardWidth;
        const label = roundIdx === maxRound ? "Finales" : roundIdx === maxRound - 1 ? "Demi-Finales" : `Tour ${roundIdx}`;
        const sorted = [...roundMatches].sort((a, b) => (a.positionInRound ?? 0) - (b.positionInRound ?? 0));

        return (
          <div key={roundIdx} style={{ position: "absolute", left: x, top: 0, width: cardWidth }}>
            <div className="bracket-round-header">{label}</div>
            {sorted.map((m) => {
              const pos = m.positionInRound ?? 0;
              const top = pos * cellH + (cellH - CARD_H) / 2 + headerOffset;
              return (
                <div key={m.id} style={{ position: "absolute", top, left: CARD_OFFSET_X, width: cardWidth }}>
                  <BracketCard
                    match={m}
                    onEdit={() => onEdit(m)}
                    isSelected={selectedId === m.id}
                    matchNumber={matchNumbers.get(m.id)}
                    teamANumber={m.teamAId ? teamNumberById.get(m.teamAId) : undefined}
                    teamBNumber={m.teamBId ? teamNumberById.get(m.teamBId) : undefined}
                    compact={colIdx === 0}
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

function SplitSEBracket({ matches, onEdit, selectedId, teamNumberById }: {
  matches: MatchWithTeams[];
  onEdit: (m: MatchWithTeams) => void;
  selectedId: string | null;
  teamNumberById: Map<string, number | undefined>;
}) {
  const top10 = matches.filter((m) => m.bracketSide === "W" || m.bracketSide === "G" || m.bracketSide === "L");
  const bottom8 = matches.filter((m) => m.bracketSide === "B" || m.bracketSide === "BG" || m.bracketSide === "BL");

  return (
    <div className="de-bracket">
      {top10.length > 0 && (
        <div className="de-section de-section--upper">
          <h4 className="de-section-title">Top 10</h4>
          <SEBracket matches={top10} onEdit={onEdit} selectedId={selectedId} teamNumberById={teamNumberById} />
        </div>
      )}
      {bottom8.length > 0 && (
        <div className="de-section de-section--lower">
          <h4 className="de-section-title">Bottom 8</h4>
          <SEBracket matches={bottom8} onEdit={onEdit} selectedId={selectedId} teamNumberById={teamNumberById} />
        </div>
      )}
    </div>
  );
}

function DEBracket({ matches, onEdit, selectedId, teamNumberById, crossPool = false }: {
  matches: MatchWithTeams[];
  onEdit: (m: MatchWithTeams) => void;
  selectedId: string | null;
  teamNumberById: Map<string, number | undefined>;
  crossPool?: boolean;
}) {
  const upper = matches.filter((m) => m.bracketSide === "W");
  const lower = matches.filter((m) => m.bracketSide === "L");
  const grand = matches.filter((m) => m.bracketSide === "G");
  const maxUpperRound = upper.length > 0 ? Math.max(...upper.map((m) => m.roundIndex)) : 1;
  const minUpperRound = upper.length > 0 ? Math.min(...upper.map((m) => m.roundIndex)) : 1;
  const maxLowerRound = lower.length > 0 ? Math.max(...lower.map((m) => m.roundIndex)) : 1;

  const matchNumbers = new Map<string, number>();
  let matchCounter = 1;
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
    const numberRound = (section: MatchWithTeams[]) => {
      for (const m of section) matchNumbers.set(m.id, matchCounter++);
    };

    numberRound(upperByRound.get(1) ?? []);
    numberRound(upperByRound.get(2) ?? []);
    numberRound(lowerByRound.get(1) ?? []);
    numberRound(lowerByRound.get(2) ?? []);
    for (let k = 3; k <= numUpper; k += 1) {
      numberRound(upperByRound.get(k) ?? []);
      numberRound(lowerByRound.get(2 * k - 3) ?? []);
      numberRound(lowerByRound.get(2 * k - 2) ?? []);
    }
    for (const m of grand) matchNumbers.set(m.id, matchCounter++);
  }

  const renderTreeSection = (
    title: string,
    sectionMatches: MatchWithTeams[],
    accentClass: string,
    useTreeSpacing: boolean,
  ) => {
    const rounds = new Map<number, MatchWithTeams[]>();
    sectionMatches.forEach((m) => {
      const list = rounds.get(m.roundIndex) ?? [];
      list.push(m);
      rounds.set(m.roundIndex, list);
    });
    if (rounds.size === 0) return null;

    const sortedRounds = Array.from(rounds.entries()).sort(([a], [b]) => a - b);
    const side = sectionMatches[0]?.bracketSide ?? "W";
    const { metrics: colMetrics, totalWidth } = getColumnMetrics(sortedRounds.length);

    const firstRoundCount = (rounds.get(sortedRounds[0][0]) ?? []).length;
    const sectionHeight = useTreeSpacing
      ? firstRoundCount * CELL_BASE * Math.pow(2, sortedRounds.length - 1)
      : Math.max(...sectionMatches.map((m) => (m.positionInRound ?? 0) + 1)) * CELL_BASE;
    const cappedHeight = Math.min(sectionHeight, firstRoundCount * CELL_BASE * 4);
    const effectiveHeight = useTreeSpacing ? cappedHeight : sectionHeight;
    const headerOffset = 28;

    const matchPositions = new Map<string, { colIdx: number; y: number }>();
    const roundCols: Array<{ x: number; matches: Array<{ y: number; nextY: number | null; nextCol: number | null }> }> = [];

    sortedRounds.forEach(([roundIdx, roundMatches], colIdx) => {
      const sorted = [...roundMatches].sort((a, b) => (a.positionInRound ?? 0) - (b.positionInRound ?? 0));
      const colData = { x: colMetrics[colIdx].x, matches: [] as Array<{ y: number; nextY: number | null; nextCol: number | null }> };

      if (useTreeSpacing) {
        const cellH = effectiveHeight / Math.max(sorted.length, 1);
        sorted.forEach((m, index) => {
          const top = index * cellH + (cellH - CARD_H) / 2;
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

    sectionMatches.forEach((m) => {
      if (!m.nextMatchWinId) return;
      const srcPos = matchPositions.get(m.id);
      const dstPos = matchPositions.get(m.nextMatchWinId);
      if (!srcPos || !dstPos) return;

      const colMatch = roundCols[srcPos.colIdx]?.matches.find((candidate) => Math.abs(candidate.y - srcPos.y) < 1);
      if (colMatch) {
        colMatch.nextY = dstPos.y;
        colMatch.nextCol = dstPos.colIdx;
      }
    });

    return (
      <div className={`de-section ${accentClass}`}>
        <h4 className="de-section-title">{title}</h4>
        <div style={{ position: "relative", width: totalWidth, minHeight: effectiveHeight + headerOffset }}>
          <svg width={totalWidth} height={effectiveHeight + headerOffset} style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}>
            {roundCols.map((col, colIdx) =>
              col.matches.map((matchCol, matchIdx) => {
                if (matchCol.nextY === null || matchCol.nextCol === null) return null;
                const nextCol = roundCols[matchCol.nextCol];
                if (!nextCol) return null;

                const x1 = col.x + colMetrics[colIdx].cardWidth;
                const y1 = matchCol.y + CARD_H / 2 + headerOffset;
                const x2 = nextCol.x;
                const y2 = matchCol.nextY + CARD_H / 2 + headerOffset;
                const elbowX = x1 + 14;

                return (
                  <path
                    key={`${colIdx}-${matchIdx}`}
                    d={`M ${x1} ${y1} H ${elbowX} V ${y2} H ${x2}`}
                    fill="none"
                    stroke="var(--text-muted)"
                    strokeWidth="1.8"
                  />
                );
              })
            )}
          </svg>

          {sortedRounds.map(([roundIdx, roundMatches], colIdx) => {
            const label = getDERoundLabel(side, roundIdx, maxUpperRound, maxLowerRound, crossPool);
            const sorted = [...roundMatches].sort((a, b) => (a.positionInRound ?? 0) - (b.positionInRound ?? 0));
            const x = colMetrics[colIdx].x;
            const cardWidth = colMetrics[colIdx].cardWidth;

            return (
              <div key={roundIdx} style={{ position: "absolute", left: x, top: 0, width: cardWidth }}>
                <div className="bracket-round-header">{label}</div>
                {sorted.map((m) => {
                  const pos = matchPositions.get(m.id);
                  if (!pos) return null;
                  return (
                    <div key={m.id} style={{ position: "absolute", top: pos.y + headerOffset, left: CARD_OFFSET_X, width: cardWidth }}>
                      <BracketCard
                        match={m}
                        onEdit={() => onEdit(m)}
                        isSelected={selectedId === m.id}
                        matchNumber={matchNumbers.get(m.id)}
                        teamANumber={m.teamAId ? teamNumberById.get(m.teamAId) : undefined}
                        teamBNumber={m.teamBId ? teamNumberById.get(m.teamBId) : undefined}
                        compact={colIdx === 0}
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
      {renderTreeSection("Tableau principal", upper, "de-section--upper", false)}
      {renderTreeSection("Tableau repêchage", lower, "de-section--lower", false)}
      {renderTreeSection("Finale", grand, "de-section--grand", false)}
    </div>
  );
}
