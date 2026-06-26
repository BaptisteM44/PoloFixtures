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
const CELL_BASE = 88;
const CARD_OFFSET_X = 0;

// Returns a translation key + params instead of a hardcoded string
function getDERoundLabelKey(side: string, roundIndex: number, maxUpperRound: number, maxLowerRound: number, crossPool = false): { key: string; params?: Record<string, string | number> } {
  if (side === "G" || side === "BG") return side === "BG" ? { key: "bracket_reset" } : { key: "bracket_final" };
  if (side === "W") {
    if (crossPool && roundIndex === 1) return { key: "bracket_elim" };
    if (roundIndex === maxUpperRound) return { key: "bracket_wb_final" };
    if (roundIndex === maxUpperRound - 1) return { key: "bracket_semifinal" };
    const displayRound = crossPool ? roundIndex - 1 : roundIndex;
    return { key: "bracket_round", params: { n: displayRound } };
  }
  if (maxLowerRound <= 1) return { key: "bracket_losers" };
  return { key: "bracket_losers_round", params: { n: roundIndex } };
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
            {match.referee && <span>🏁 {match.referee.name}</span>}
            {match.coReferee && <span>📱 {match.coReferee.name}</span>}
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

  const bracketMatches = matches.filter((m) => m.phase === "BRACKET" || m.phase === "GRAZ_SE" || m.phase === "MTP_DE" || m.phase === "KIOSQUE_SE" || m.phase === "TOP32" || m.phase === "BOTTOM16");
  // SWISS_SPLIT_SE: detect by presence of B/BG/BL bracket sides (only for BRACKET phase, not MTP_DE which also uses BG for reset)
  // A DE with gfReset also has a "BG" match but always has "W" matches too — SPLIT_SE never has "W" matches
  const isSplitSE = bracketMatches.some((m) => m.phase === "BRACKET" && (m.bracketSide === "B" || m.bracketSide === "BG" || m.bracketSide === "BL"))
    && !bracketMatches.some((m) => m.phase === "BRACKET" && m.bracketSide === "W");
  // DE has multiple L matches AND W matches; SE 3rd place has exactly one L or BL match
  // SPLIT_SE losers bracket: only L/LG/LL matches (no W) → treat as SEBracket not DEBracket
  const lMatches = bracketMatches.filter((m) => m.bracketSide === "L" || m.bracketSide === "BL");
  const hasWMatches = bracketMatches.some((m) => m.bracketSide === "W" || m.bracketSide === "G");
  const isDE = !isSplitSE && hasWMatches && bracketMatches.some((m) => m.bracketSide === "L") && lMatches.length > 1;
  const has3rdPlace = !isDE && lMatches.length === 1;
  const teamNumberById = new Map((teams ?? []).map((team) => [team.id, team.seed]));

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
  const t = useTranslations("tournament");

  // Separate 3rd place match from main bracket
  const hasGFinal = matches.some((m) => m.bracketSide === "G");
  const hasLGFinal = matches.some((m) => m.bracketSide === "LG");
  const hasWLThird = matches.some((m) => m.bracketSide === "WL");
  const hasLLThird = matches.some((m) => m.bracketSide === "LL");
  // WL = Winners bracket 3rd place, LL = Losers bracket 3rd place
  // L alone (no LG) = standard SE 3rd place
  const thirdPlaceMatch =
    hasWLThird ? matches.find((m) => m.bracketSide === "WL") :
    hasLLThird ? matches.find((m) => m.bracketSide === "LL") :
    (!hasLGFinal && hasGFinal) ? matches.find((m) => m.bracketSide === "L") :
    undefined;
  const mainMatches = (() => {
    let ms = matches.filter((m) => m.bracketSide !== "WL" && m.bracketSide !== "LL");
    if (thirdPlaceMatch?.bracketSide === "L") ms = ms.filter((m) => m.bracketSide !== "L");
    // For SPLIT_SE losers bracket: treat LG as final (G), L as normal rounds
    ms = ms.map((m) => m.bracketSide === "LG" ? { ...m, bracketSide: "G" as const } : m);
    return ms;
  })();

  const rounds = new Map<number, MatchWithTeams[]>();
  mainMatches.forEach((m) => {
    const list = rounds.get(m.roundIndex) ?? [];
    list.push(m);
    rounds.set(m.roundIndex, list);
  });

  const sortedRounds = Array.from(rounds.entries()).sort(([a], [b]) => a - b);
  const maxRound = rounds.size > 0 ? Math.max(...rounds.keys()) : 0;
  const headerOffset = 28;
  const { metrics: colMetrics, totalWidth: mainWidth } = getColumnMetrics(sortedRounds.length);

  const matchNumbers = new Map<string, number>();
  let matchCounter = 1;
  for (const [, roundMatches] of sortedRounds) {
    const sorted = [...roundMatches].sort((a, b) => (a.positionInRound ?? 0) - (b.positionInRound ?? 0));
    for (const m of sorted) matchNumbers.set(m.id, matchCounter++);
  }
  if (thirdPlaceMatch) matchNumbers.set(thirdPlaceMatch.id, matchCounter++);

  // Position matches using tree-based formula derived from positionInRound.
  // R1 has spacing CELL_BASE. Each subsequent round doubles the cell height.
  // This ensures R2 matches are always visually centered between their two R1 feeders,
  // even when some slots are byes (positionInRound must be set correctly in the DB).
  const matchPositions = new Map<string, { colIdx: number; y: number }>();

  sortedRounds.forEach(([, roundMatches], colIdx) => {
    // Cell height doubles each round: R1=CELL_BASE, R2=2*CELL_BASE, R3=4*CELL_BASE, ...
    const cellH = CELL_BASE * Math.pow(2, colIdx);
    const sorted = [...roundMatches].sort((a, b) => (a.positionInRound ?? 0) - (b.positionInRound ?? 0));
    sorted.forEach((m) => {
      const pos = m.positionInRound ?? 0;
      const y = pos * cellH + (cellH - CARD_H) / 2;
      matchPositions.set(m.id, { colIdx, y });
    });
  });

  // Compute actual used height from positioned matches
  let maxY = 0;
  matchPositions.forEach(({ y }) => { if (y + CARD_H > maxY) maxY = y + CARD_H; });
  const mainHeight = Math.max(maxY, CELL_BASE);

  // Build connector lines using nextMatchWinId
  const feedersOf = new Map<string, MatchWithTeams[]>();
  mainMatches.forEach((m) => {
    if (!m.nextMatchWinId) return;
    const list = feedersOf.get(m.nextMatchWinId) ?? [];
    list.push(m);
    feedersOf.set(m.nextMatchWinId, list);
  });

  const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  mainMatches.forEach((m) => {
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

  // The 3rd place match goes in the same column as the final (last col),
  // but rendered below with a gap to distinguish it visually
  const finalColIdx = sortedRounds.length - 1;
  const finalColMetric = colMetrics[finalColIdx];
  const thirdPlaceGap = 24; // gap between main bracket and 3rd place section
  const thirdPlaceTopOffset = mainHeight + headerOffset + thirdPlaceGap;
  const totalHeight = thirdPlaceMatch
    ? thirdPlaceTopOffset + CARD_H + headerOffset + thirdPlaceGap
    : mainHeight + headerOffset;

  return (
    <div className="bracket-tree" style={{ position: "relative", width: mainWidth, minHeight: totalHeight }}>
      <svg width={mainWidth} height={totalHeight} style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}>
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

      {/* Main bracket rounds */}
      {sortedRounds.map(([roundIdx, roundMatches], colIdx) => {
        const x = colMetrics[colIdx].x;
        const cardWidth = colMetrics[colIdx].cardWidth;
        let label: string;
        if (roundIdx === maxRound) label = t("bracket_final");
        else if (roundIdx === maxRound - 1) label = t("bracket_semifinal");
        else label = t("bracket_round", { n: roundIdx });
        const sorted = [...roundMatches].sort((a, b) => (a.positionInRound ?? 0) - (b.positionInRound ?? 0));

        return (
          <div key={roundIdx} style={{ position: "absolute", left: x, top: 0, width: cardWidth }}>
            <div className="bracket-round-header">{label}</div>
            {sorted.map((m) => {
              const pos = matchPositions.get(m.id);
              const top = (pos?.y ?? 0) + headerOffset;
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

      {/* 3rd place match — aligned with final column, positioned below main bracket */}
      {thirdPlaceMatch && finalColMetric && (
        <div style={{ position: "absolute", left: finalColMetric.x, top: thirdPlaceTopOffset - headerOffset, width: finalColMetric.cardWidth }}>
          <div className="bracket-round-header bracket-round-header--3rd">{t("bracket_3rd_place")}</div>
          <div style={{ position: "absolute", top: headerOffset, left: CARD_OFFSET_X, width: finalColMetric.cardWidth }}>
            <BracketCard
              match={thirdPlaceMatch}
              onEdit={() => onEdit(thirdPlaceMatch)}
              isSelected={selectedId === thirdPlaceMatch.id}
              matchNumber={matchNumbers.get(thirdPlaceMatch.id)}
              teamANumber={thirdPlaceMatch.teamAId ? teamNumberById.get(thirdPlaceMatch.teamAId) : undefined}
              teamBNumber={thirdPlaceMatch.teamBId ? teamNumberById.get(thirdPlaceMatch.teamBId) : undefined}
            />
          </div>
        </div>
      )}
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
  const t = useTranslations("tournament");
  const upper = matches.filter((m) => m.bracketSide === "W");
  const lower = matches.filter((m) => m.bracketSide === "L");
  // Hide BG (reset) match if it has no teams yet (GF hasn't triggered a reset)
  const grand = matches.filter((m) => m.bracketSide === "G" || (m.bracketSide === "BG" && (m.teamAId || m.teamBId)));
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
    numberRound(lowerByRound.get(1) ?? []);
    numberRound(upperByRound.get(2) ?? []);
    numberRound(lowerByRound.get(2) ?? []);
    for (let k = 3; k <= numUpper; k += 1) {
      // MTP Open order: LB consolidation, WB R(k), LB injection
      numberRound(lowerByRound.get(2 * k - 3) ?? []);
      numberRound(upperByRound.get(k) ?? []);
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
            const effectiveSide = roundMatches[0]?.bracketSide ?? side;
            const { key, params } = getDERoundLabelKey(effectiveSide, roundIdx, maxUpperRound, maxLowerRound, crossPool);
            const label = t(key as any, params);
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
      {renderTreeSection(t("de_upper"), upper, "de-section--upper", false)}
      {renderTreeSection(t("de_lower"), lower, "de-section--lower", false)}
      {renderTreeSection(t("de_grand"), grand, "de-section--grand", false)}
    </div>
  );
}
