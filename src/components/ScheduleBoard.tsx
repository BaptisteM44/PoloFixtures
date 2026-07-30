"use client";

import { useEffect, useMemo, useState } from "react";
import { Match, MatchEvent, Team } from "@prisma/client";
import { useTranslations } from "next-intl";
import { formatTime } from "@/lib/utils";
import { MatchEditPanel, type MatchForEdit } from "./MatchEditPanel";
import { MatchRecapModal } from "./MatchRecapModal";

function computeClockFromEvents(events: MatchEvent[]): { clockSec: number; paused: boolean } {
  let clockSec = 0;
  let lastStartSec = 0;
  let lastStartReal = 0;
  let paused = true;
  for (const e of events) {
    const t = new Date(e.createdAt as unknown as string).getTime();
    if (e.type === "START") { lastStartSec = e.matchClockSec; lastStartReal = t; paused = false; }
    else if (e.type === "PAUSE") { clockSec = e.matchClockSec; paused = true; }
    else if (e.type === "END") { clockSec = e.matchClockSec; paused = true; }
  }
  if (!paused && lastStartReal > 0) {
    clockSec = lastStartSec + Math.floor((Date.now() - lastStartReal) / 1000);
  }
  return { clockSec, paused };
}

function LiveTimer({ events, gameDurationMin }: { events: MatchEvent[]; gameDurationMin: number }) {
  const gameDurSec = gameDurationMin * 60;
  const lastEvtId = events[events.length - 1]?.id;

  const [clockSec, setClockSec] = useState(() => computeClockFromEvents(events).clockSec);
  const [paused, setPaused] = useState(() => computeClockFromEvents(events).paused);

  useEffect(() => {
    const { clockSec: c, paused: p } = computeClockFromEvents(events);
    setClockSec(c);
    setPaused(p);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEvtId]);

  useEffect(() => {
    if (paused) return;
    const interval = setInterval(() => setClockSec((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [paused]);

  const remaining = gameDurSec - clockSec;
  const isOvertime = remaining < 0;
  const display = Math.abs(remaining);
  const mm = String(Math.floor(display / 60)).padStart(2, "0");
  const ss = String(display % 60).padStart(2, "0");

  return (
    <span style={{ fontVariantNumeric: "tabular-nums", color: isOvertime ? "var(--color-red, #e53)" : "inherit", fontWeight: 600 }}>
      {isOvertime ? "+" : ""}{mm}:{ss}
    </span>
  );
}

export type MatchWithTeams = Match & {
  teamA?: Team | null;
  teamB?: Team | null;
  events?: MatchEvent[];
  referee?: { id: string; name: string } | null;
  coReferee?: { id: string; name: string } | null;
};

const PHASE_LABEL: Record<string, string> = {
  POOL: "Poule", SWISS: "Swiss", CROSS_POOL: "Cross-pool", BRACKET: "Tableau",
  GRAZ_RR: "RR", GRAZ_REGROUP: "Regroup", GRAZ_SE: "SE",
  MTP_POOL_A: "Pool A", MTP_POOL_B: "Pool B", MTP_BARRAGE: "Barrage", MTP_DE: "DE",
  KIOSQUE_POOL: "J1", KIOSQUE_TOP4: "Top 4", KIOSQUE_BOTTOM12: "Bottom 12", KIOSQUE_SE: "SE",
  BIG_APPLE_RR: "RR", BIG_APPLE_SWISS: "Swiss", BIG_APPLE_PLACEMENT: "Placement", BIG_APPLE_SE: "SE",
};

// « Suivant » / « In the hole » : position dans la file GLOBALE du terrain
// (tous blocs confondus) — sinon le 1er match de chaque bloc affiche
// « Suivant » et tout semble se lancer en même temps.
function positionLabel(match: MatchWithTeams, courtQueuePos: Map<string, number>) {
  if (match.status === "FINISHED") return "Terminé";
  if (match.status === "LIVE") return "Sur court";
  const idx = courtQueuePos.get(match.id);
  if (idx === 0) return "Suivant";
  if (idx === 1) return "In the hole";
  return "En attente";
}

/** Check if a round is fully finished */
function isRoundFinished(matches: MatchWithTeams[]) {
  return matches.length > 0 && matches.every((m) => m.status === "FINISHED");
}

/** Check if a round has any active (LIVE) match */
function isRoundActive(matches: MatchWithTeams[]) {
  return matches.some((m) => m.status === "LIVE");
}

function mazzaSequentialOrder(sessionIndex: number | undefined, roundIndex: number): number {
  const s = sessionIndex ?? 0;
  // Pool A R1-R4 → 0-3, Pool B R1-R3 → 4-6, Pool B R4-R7 → 7-10, Pool A R5-R7 → 11-13
  if (s === 0 && roundIndex <= 4) return roundIndex - 1;
  if (s === 1 && roundIndex <= 3) return 3 + roundIndex;
  if (s === 1 && roundIndex >= 4) return 4 + roundIndex;
  if (s === 0 && roundIndex >= 5) return 6 + roundIndex;
  return 99;
}

type TeamWithPlayers = Team & { players?: { player: { id: string; name: string } }[] };

export function ScheduleBoard({
  tournamentId,
  initialMatches,
  teams,
  pools,
  isOrganizer,
  poolRounds = null,
  testMode = false,
  gameDurationMin = 15,
  sundayFormat,
  stages,
}: {
  tournamentId: string;
  initialMatches: MatchWithTeams[];
  teams: TeamWithPlayers[];
  pools?: { id: string; name: string }[];
  isOrganizer?: boolean;
  poolRounds?: number | null;
  gameDurationMin?: number;
  testMode?: boolean;
  sundayFormat?: string;
  /** Pipeline (nouveau système) : nom + ordre de chaque Stage, pour libellés et tri corrects. */
  stages?: { id: string; name: string; order: number }[];
}) {
  const t = useTranslations("tournament");
  const [matches, setMatches] = useState<MatchWithTeams[]>(initialMatches);
  const [filterTeamId, setFilterTeamId] = useState("");
  const [filterDay, setFilterDay] = useState("ALL");
  const [filterPhase, setFilterPhase] = useState("ALL");
  const [editMatch, setEditMatch] = useState<MatchForEdit | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedPlayers, setExpandedPlayers] = useState<string | null>(null);
  const [loadingRound, setLoadingRound] = useState<string | null>(null);
  const [recapMatchId, setRecapMatchId] = useState<string | null>(null);

  // playerId → nom, pour résoudre buteurs/fautifs dans le récap de match
  const playerNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const team of teams) {
      for (const tp of team.players ?? []) map.set(tp.player.id, tp.player.name);
    }
    return map;
  }, [teams]);

  const STATUS_LABEL: Record<string, string> = {
    SCHEDULED: t("status_scheduled"),
    LIVE: t("status_live_icon"),
    FINISHED: t("status_finished_icon"),
  };

  useEffect(() => {
    const es = new EventSource(`/api/sse?tournamentId=${tournamentId}`);
    es.addEventListener("match", (event) => {
      const payload = JSON.parse((event as MessageEvent).data);

      // Handle new matches (e.g. auto-generated Swiss round)
      if (payload?.type === "new_matches" && Array.isArray(payload.matches)) {
        setMatches((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const newOnes = (payload.matches as MatchWithTeams[]).filter((m) => !existingIds.has(m.id));
          return newOnes.length > 0 ? [...prev, ...newOnes] : prev;
        });
        return;
      }

      // Handle match updates — payload.data can be the match directly (PUT route)
      // or { event, match } (events route from RefereePanel)
      if (payload?.data) {
        const updated: MatchWithTeams = payload.data.match ?? payload.data;
        const newEvent: MatchEvent | undefined = payload.data.event;
        if (updated.id) {
          setMatches((prev) =>
            prev.map((m) => {
              if (m.id !== updated.id) return m;
              const events = newEvent
                ? [...(m.events ?? []), newEvent]
                : (m.events ?? []);
              return { ...m, ...updated, events };
            })
          );
        }
      }
    });
    return () => es.close();
  }, [tournamentId]);

  const teamName = (id?: string | null) =>
    teams.find((tm) => tm.id === id)?.name ?? "TBD";

  const teamPlayerNames = (id?: string | null) => {
    if (!id) return null;
    const team = teams.find((tm) => tm.id === id);
    if (!team?.players?.length) return null;
    return team.players.map((tp) => tp.player.name);
  };

  const openEdit = (match: MatchWithTeams) => {
    if (selectedId === match.id) {
      setSelectedId(null);
      setEditMatch(null);
      return;
    }
    setSelectedId(match.id);
    setEditMatch({
      id: match.id,
      teamAId: match.teamAId,
      teamBId: match.teamBId,
      teamAName: teamName(match.teamAId),
      teamBName: teamName(match.teamBId),
      scoreA: match.scoreA,
      scoreB: match.scoreB,
      status: match.status,
      phase: match.phase,
      roundIndex: match.roundIndex,
      courtName: match.courtName,
      refereePlayerId: match.refereePlayerId,
      coRefereePlayerId: match.coRefereePlayerId,
    });
  };

  const closePanel = () => {
    setSelectedId(null);
    setEditMatch(null);
  };

  const handleSaved = (updated: { id: string; scoreA: number; scoreB: number; status: string; teamAId?: string | null; teamBId?: string | null }) => {
    setMatches((prev) =>
      prev.map((m) => {
        if (m.id !== updated.id) return m;
        const patched: MatchWithTeams = { ...m, scoreA: updated.scoreA, scoreB: updated.scoreB, status: updated.status as Match["status"] };
        if (updated.teamAId !== undefined) {
          patched.teamAId = updated.teamAId;
          patched.teamA = teams.find((tm) => tm.id === updated.teamAId) ?? null;
        }
        if (updated.teamBId !== undefined) {
          patched.teamBId = updated.teamBId;
          patched.teamB = teams.find((tm) => tm.id === updated.teamBId) ?? null;
        }
        return patched;
      })
    );
    closePanel();
  };

  const generateRoundScores = async (groupKey: string, groupMatches: MatchWithTeams[]) => {
    const toGenerate = groupMatches.filter((m) => m.status !== "FINISHED");
    if (toGenerate.length === 0) return;
    setLoadingRound(groupKey);
    for (const match of toGenerate) {
      let sA = Math.floor(Math.random() * 6);
      let sB = Math.floor(Math.random() * 6);
      while (sA === sB) sB = Math.floor(Math.random() * 6);
      await fetch(`/api/matches/${match.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scoreA: sA, scoreB: sB, status: "FINISHED" }),
      });
      setMatches((prev) =>
        prev.map((m) =>
          m.id === match.id ? { ...m, scoreA: sA, scoreB: sB, status: "FINISHED" as Match["status"] } : m
        )
      );
    }
    setLoadingRound(null);
  };

  const filtered = useMemo(() => {
    return matches.filter((match) => {
      // Hide GF reset match until it has teams (i.e. LB champion actually won the GF)
      if ((match as any).bracketSide === "BG" && !match.teamAId && !match.teamBId) return false;
      if (filterTeamId && match.teamAId !== filterTeamId && match.teamBId !== filterTeamId) return false;
      if (filterDay !== "ALL" && match.dayIndex !== filterDay) return false;
      if (filterPhase !== "ALL" && match.phase !== filterPhase) return false;
      return true;
    });
  }, [matches, filterTeamId, filterDay, filterPhase]);

  // Group matches by phase+round (for POOL: also by poolSessionIndex), sorted: active rounds first, then scheduled, then finished
  const roundGroups = useMemo(() => {
    const groups = new Map<string, { phase: string; roundIndex: number; poolSessionIndex?: number; bracketSide?: string | null; poolId?: string | null; stageId?: string | null; groupKey?: string | null; matches: MatchWithTeams[] }>();

    // Sort all filtered by startAt
    const sorted = [...filtered].sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
    );

    for (const match of sorted) {
      // For POOL matches, separate by poolSessionIndex (A, B, etc.)
      const sessionSuffix = match.phase === "POOL" && match.poolSessionIndex !== null ? `-S${match.poolSessionIndex}` : "";
      // For BRACKET matches, separate by bracketSide (W/L/G for standard DE/SE, B/BG/BL for Bottom 8 in SWISS_SPLIT_SE)
      const bracketSuffix = match.phase === "BRACKET" && match.bracketSide ? `-${match.bracketSide}` : "";
      // For GRAZ_RR matches, separate by pool (poolId) so Pool A and Pool B are distinct groups
      const grazPoolSuffix = match.phase === "GRAZ_RR" && match.poolId ? `-P${match.poolId}` : "";
      // For GRAZ_REGROUP matches, separate by pool (Top / Mid1 / Mid2 / Bottom)
      const grazRegroupSuffix = match.phase === "GRAZ_REGROUP" && match.poolId ? `-P${match.poolId}` : "";
      // For Kiosque pool phases, separate by poolId (Pool A vs Pool B, Top 4 vs Bottom 12)
      const kiosquePoolSuffix = (match.phase === "KIOSQUE_POOL" || match.phase === "KIOSQUE_TOP4" || match.phase === "KIOSQUE_BOTTOM12") && match.poolId ? `-P${match.poolId}` : "";
      // For Big Apple RR matches, separate by pool (Pool A vs Pool B)
      const bigAppleRRSuffix = match.phase === "BIG_APPLE_RR" && match.poolId ? `-P${match.poolId}` : "";
      // Pipeline (nouveau système) : chaque Stage est son propre groupe — sans
      // ça, toutes les étapes d'un pipeline fusionneraient sous "STAGE-R1".
      // Le groupKey (A/B/…) sépare aussi les groupes d'une même étape, et le
      // bracketSide sépare WB/LB/finale d'une étape à élimination (sinon
      // "WB R2" et "LB R2" fusionneraient sous "Round 2").
      const stageSuffix = match.phase === "STAGE" && (match as any).stageId ? `-ST${(match as any).stageId}${(match as any).groupKey ? `-G${(match as any).groupKey}` : ""}${match.bracketSide ? `-${match.bracketSide}` : ""}` : "";
      const key = `${match.phase}-R${match.roundIndex}${sessionSuffix}${bracketSuffix}${grazPoolSuffix}${grazRegroupSuffix}${kiosquePoolSuffix}${bigAppleRRSuffix}${stageSuffix}`;
      if (!groups.has(key)) {
        groups.set(key, { phase: match.phase, roundIndex: match.roundIndex, poolSessionIndex: match.poolSessionIndex ?? undefined, bracketSide: match.bracketSide ?? undefined, poolId: match.poolId ?? null, stageId: (match as any).stageId ?? null, groupKey: (match as any).groupKey ?? null, matches: [] });
      }
      groups.get(key)!.matches.push(match);
    }

    // Sort groups: active rounds first, then scheduled, then finished (at the bottom)
    const entries = [...groups.values()];
    entries.sort((a, b) => {
      const aActive = isRoundActive(a.matches);
      const bActive = isRoundActive(b.matches);
      const aFinished = isRoundFinished(a.matches);
      const bFinished = isRoundFinished(b.matches);

      // Active rounds first
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;
      // Scheduled rounds second (not finished, not active)
      if (!aFinished && bFinished) return -1;
      if (aFinished && !bFinished) return 1;
      // Finished rounds last (most recently played first)
      if (aFinished && bFinished) {
        const aLatest = Math.max(...a.matches.map(m => new Date(m.startAt).getTime()));
        const bLatest = Math.max(...b.matches.map(m => new Date(m.startAt).getTime()));
        return bLatest - aLatest;
      }
      // Both scheduled: Mazza SPLIT_SE uses fixed logical order (4/3/4/3)
      if (sundayFormat === "SPLIT_SE" && a.phase === "POOL" && b.phase === "POOL") {
        return mazzaSequentialOrder(a.poolSessionIndex, a.roundIndex) - mazzaSequentialOrder(b.poolSessionIndex, b.roundIndex);
      }
      // Otherwise: by earliest startAt in the group, then roundIndex as tiebreaker
      const aStart = Math.min(...a.matches.map(m => new Date(m.startAt).getTime()));
      const bStart = Math.min(...b.matches.map(m => new Date(m.startAt).getTime()));
      if (aStart !== bStart) return aStart - bStart;
      return a.roundIndex - b.roundIndex;
    });

    return entries;
  }, [filtered]);

  // Global match ordering for numbering — stable, based on logical order not startAt
  // so numbers don't change when new rounds are generated
  const stageOrderById = useMemo(() => new Map((stages ?? []).map((s) => [s.id, s.order])), [stages]);
  const globalOrder = useMemo(() => {
    const PHASE_ORDER: Record<string, number> = {
      POOL: 0, MTP_POOL_A: 0, MTP_POOL_B: 1,
      SWISS: 2, GRAZ_RR: 2,
      CROSS_POOL: 3, GRAZ_REGROUP: 3,
      MTP_BARRAGE: 4, GRAZ_SE: 4,
      BRACKET: 5, MTP_DE: 5,
      FRIDAY_A: 0, FRIDAY_B: 1, SATURDAY_A: 2, SATURDAY_B: 3, SUNDAY_SWISS: 4, TOP32: 5, BOTTOM16: 6,
      KIOSQUE_POOL: 0, KIOSQUE_TOP4: 1, KIOSQUE_BOTTOM12: 1, KIOSQUE_SE: 2,
      BIG_APPLE_RR: 0, BIG_APPLE_SWISS: 1, BIG_APPLE_PLACEMENT: 2, BIG_APPLE_SE: 3,
    };
    // Pipeline : ordre = Stage.order (plusieurs stages partagent phase="STAGE",
    // donc l'ordre fixe par phase ne suffit pas — on utilise l'ordre réel du pipeline)
    const stagePhaseOrder = (m: MatchWithTeams) =>
      m.phase === "STAGE" ? 10 + (stageOrderById.get((m as any).stageId ?? "") ?? 0) : (PHASE_ORDER[m.phase] ?? 99);
    const sorted = [...matches].sort((a, b) => {
      const pa = stagePhaseOrder(a);
      const pb = stagePhaseOrder(b);
      if (pa !== pb) return pa - pb;
      if (a.roundIndex !== b.roundIndex) return a.roundIndex - b.roundIndex;
      if ((a.positionInRound ?? 0) !== (b.positionInRound ?? 0)) return (a.positionInRound ?? 0) - (b.positionInRound ?? 0);
      return (a.courtName ?? "").localeCompare(b.courtName ?? "");
    });
    const map = new Map<string, number>();
    sorted.forEach((m, i) => map.set(m.id, i + 1));
    return map;
  }, [matches, stageOrderById]);

  const phases = [...new Set(matches.map((m) => m.phase))];

  // For multi-court: group matches by court within a round
  const byCourtInRound = (roundMatches: MatchWithTeams[]) => {
    const map = new Map<string, MatchWithTeams[]>();
    for (const match of roundMatches) {
      const list = map.get(match.courtName) ?? [];
      list.push(match);
      map.set(match.courtName, list);
    }
    // Ordre stable des colonnes : Court 1 à gauche, Court 2 à droite, etc.
    return new Map(
      [...map.entries()].sort(([a], [b]) =>
        a.localeCompare(b, undefined, { numeric: true })
      )
    );
  };

  // Étapes pipeline à double élimination = plusieurs matchs side "L" (une SE
  // n'a qu'une petite finale). Sert à nommer WB/LB vs Finale/3e place.
  const deStageIds = useMemo(() => {
    const lCount = new Map<string, number>();
    for (const m of matches) {
      const sid = (m as any).stageId as string | undefined;
      if (m.phase === "STAGE" && sid && m.bracketSide === "L") {
        lCount.set(sid, (lCount.get(sid) ?? 0) + 1);
      }
    }
    return new Set([...lCount.entries()].filter(([, c]) => c > 1).map(([id]) => id));
  }, [matches]);

  const stagePill = (m: MatchWithTeams): string | null => {
    if (m.phase !== "STAGE") return null;
    const side = m.bracketSide;
    if (!side) return `R${m.roundIndex}`;
    const isDE = deStageIds.has(((m as any).stageId as string | undefined) ?? "");
    if (side === "W") return isDE ? `WB R${m.roundIndex}` : `R${m.roundIndex}`;
    if (side === "L") return isDE ? `LB R${m.roundIndex}` : "3e place";
    if (side === "G") return isDE ? "Grande finale" : "Finale";
    if (side === "BG") return "Finale reset";
    return `R${m.roundIndex}`;
  };

  // File d'attente réelle par terrain (matchs planifiés, tous blocs confondus)
  const courtQueuePos = useMemo(() => {
    const rank = new Map<string, number>();
    const byCourt = new Map<string, MatchWithTeams[]>();
    for (const m of matches) {
      if (m.status !== "SCHEDULED") continue;
      const list = byCourt.get(m.courtName) ?? [];
      list.push(m);
      byCourt.set(m.courtName, list);
    }
    for (const list of byCourt.values()) {
      list.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
      list.forEach((m, i) => rank.set(m.id, i));
    }
    return rank;
  }, [matches]);

  // Provenance des slots vides (« Vainqueur #12 » / « Perdant #7 » au lieu de TBD)
  const slotSources = useMemo(() => {
    const map = new Map<string, { from: string; win: boolean }>();
    for (const m of matches) {
      const mm = m as any;
      if (mm.nextMatchWinId && mm.nextSlotWin) map.set(`${mm.nextMatchWinId}:${mm.nextSlotWin}`, { from: m.id, win: true });
      if (mm.nextMatchLoseId && mm.nextSlotLose) map.set(`${mm.nextMatchLoseId}:${mm.nextSlotLose}`, { from: m.id, win: false });
    }
    return map;
  }, [matches]);

  const slotPlaceholder = (m: MatchWithTeams, slot: "A" | "B"): string | null => {
    const src = slotSources.get(`${m.id}:${slot}`);
    if (!src) return null;
    const n = globalOrder.get(src.from);
    if (n === undefined) return null;
    return src.win ? t("bracket_winner_of", { n }) : t("bracket_loser_of", { n });
  };

  const teamSlot = (m: MatchWithTeams, slot: "A" | "B") => {
    const id = slot === "A" ? m.teamAId : m.teamBId;
    if (id) return teamName(id);
    const from = slotPlaceholder(m, slot);
    if (!from) return "TBD";
    return <span style={{ opacity: 0.55, fontStyle: "italic", fontWeight: 400 }}>{from}</span>;
  };

  const renderMatchCard = (match: MatchWithTeams, courtMatches: MatchWithTeams[]) => (
    <div key={match.id} className="dmc-v5">
      <button
        className={`match-card match-card--${match.status.toLowerCase()}${selectedId === match.id ? " match-card--selected" : ""}`}
        onClick={() => openEdit(match)}
        type="button"
      >
        <div className="match-card__corner match-card__corner--tl">
          <span className="match-card__number">{globalOrder.get(match.id)}</span>
          <span className="pill">{positionLabel(match, courtQueuePos)}</span>
        </div>
        <div className="match-card__corner match-card__corner--tr">
          {match.status === "LIVE"
            ? <LiveTimer events={match.events ?? []} gameDurationMin={gameDurationMin} />
            : <span>{formatTime(match.startAt)}</span>
          }
        </div>

        <div className="match-card__center">
          <div className={`match-card__team${match.status === "FINISHED" && match.scoreA > match.scoreB ? " match-winner" : ""}`}>
            {teamSlot(match, "A")}
          </div>
          <div className="match-card__score">
            <span>{match.scoreA}</span>
            <span style={{ opacity: 0.4, fontSize: 14 }}>–</span>
            <span>{match.scoreB}</span>
          </div>
          <div className={`match-card__team${match.status === "FINISHED" && match.scoreB > match.scoreA ? " match-winner" : ""}`}>
            {teamSlot(match, "B")}
          </div>
          {(match.referee || match.coReferee) && (
            <div className="match-card__referees">
              {match.referee && <span title="Referee">🏁 {match.referee.name}</span>}
              {match.coReferee && <span title="Co-referee">📱 {match.coReferee.name}</span>}
            </div>
          )}
        </div>

        <div className="match-card__corner match-card__corner--bl">
          <span className="pill">{stagePill(match) ?? `${PHASE_LABEL[match.phase] ?? match.phase} R${match.roundIndex}`}</span>
        </div>
        <div className={`match-card__corner match-card__corner--br match-card__status--${match.status.toLowerCase()}`}>
          <span>{STATUS_LABEL[match.status] ?? match.status}</span>
        </div>
      </button>
      {match.status === "FINISHED" && (
        <button
          className="dmc-v5__fab dmc-v5__fab--left"
          type="button"
          title={t("recap_title")}
          onClick={(e) => { e.stopPropagation(); setRecapMatchId(match.id); }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 8v4l3 3" />
            <circle cx="12" cy="12" r="9" />
          </svg>
        </button>
      )}
      {(teamPlayerNames(match.teamAId) || teamPlayerNames(match.teamBId)) && (
        <button
          className="dmc-v5__fab"
          type="button"
          onClick={(e) => { e.stopPropagation(); setExpandedPlayers(expandedPlayers === match.id ? null : match.id); }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 24" width="22" height="18" fill="currentColor">
            <circle cx="5" cy="12" r="2.5"/>
            <circle cx="15" cy="12" r="2.5"/>
            <circle cx="25" cy="12" r="2.5"/>
          </svg>
        </button>
      )}
      {expandedPlayers === match.id && (
        <div className="dmc-v5__overlay dmc-v5__overlay--card" onClick={() => setExpandedPlayers(null)}>
          <button className="dmc-v5__close" type="button" onClick={(e) => { e.stopPropagation(); setExpandedPlayers(null); }}>&times;</button>
          <div className="dmc-v5__card-team">
            <strong className="dmc-v5__card-name dmc-v5__card-name--left">{teamName(match.teamAId)}</strong>
            <div className="dmc-v5__card-players">{teamPlayerNames(match.teamAId)?.join(" · ")}</div>
          </div>
          <div className="dmc-v5__card-vs">VS</div>
          <div className="dmc-v5__card-team">
            <strong className="dmc-v5__card-name dmc-v5__card-name--right">{teamName(match.teamBId)}</strong>
            <div className="dmc-v5__card-players">{teamPlayerNames(match.teamBId)?.join(" · ")}</div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="schedule-board" style={{ paddingBottom: editMatch ? 220 : 0 }}>
      <div className="panel">
        <div className="form-grid">
          <label>
            {t("filter_team")}
            <select value={filterTeamId} onChange={(e) => setFilterTeamId(e.target.value)}>
              <option value="">Toutes</option>
              {teams.filter((tm) => (tm as any).selected !== false).map((team) => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
            </select>
          </label>
          <label>
            Jour
            <select value={filterDay} onChange={(e) => setFilterDay(e.target.value)}>
              <option value="ALL">Tous</option>
              <option value="SAT">Samedi</option>
              <option value="SUN">Dimanche</option>
            </select>
          </label>
          <label>
            Phase
            <select value={filterPhase} onChange={(e) => setFilterPhase(e.target.value)}>
              <option value="ALL">Toutes</option>
              {phases.map((p) => (
                <option key={p} value={p}>{PHASE_LABEL[p] ?? p}</option>
              ))}
            </select>
          </label>
        </div>
        <p style={{ margin: "12px 0 0", fontSize: 13, color: "var(--text-muted)" }}>
          {t("click_match")}
        </p>
      </div>

      {roundGroups.map((group) => {
        const finished = isRoundFinished(group.matches);
        const active = isRoundActive(group.matches);
        const courts = byCourtInRound(group.matches);
        const courtCount = courts.size;
        const allCourtMatches = [...group.matches].sort(
          (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
        );

        const sessionLabel = group.phase === "POOL" && group.poolSessionIndex !== undefined
          ? ` · Pool ${String.fromCharCode(65 + group.poolSessionIndex)}`
          : "";

        // For GRAZ_RR: show pool name (Pool A / Pool B)
        const grazPoolLabel = group.phase === "GRAZ_RR" && group.poolId
          ? ` · ${pools?.find((p) => p.id === group.poolId)?.name ?? "Pool"}`
          : group.phase === "GRAZ_REGROUP" && group.poolId
          ? ` · ${pools?.find((p) => p.id === group.poolId)?.name?.replace("Regroup-", "") ?? "Groupe"}`
          : (group.phase === "KIOSQUE_POOL" || group.phase === "KIOSQUE_TOP4" || group.phase === "KIOSQUE_BOTTOM12") && group.poolId
          ? ` · ${pools?.find((p) => p.id === group.poolId)?.name ?? ""}`
          : group.phase === "BIG_APPLE_RR" && group.poolId
          ? ` · ${pools?.find((p) => p.id === group.poolId)?.name ?? "Pool"}`
          : "";

        // For BRACKET phase, show which bracket + match type based on bracketSide
        const bracketSide = group.matches[0]?.bracketSide;
        let bracketLabel = "";
        let stageShowRound = true;
        if (group.phase === "STAGE" && bracketSide) {
          // Étape pipeline à élimination : nommer WB/LB/finale correctement
          const isDEStage = deStageIds.has(group.stageId ?? "");
          if (bracketSide === "W") bracketLabel = isDEStage ? " · Winners" : "";
          else if (bracketSide === "L") { bracketLabel = isDEStage ? " · Losers" : " · Petite finale"; stageShowRound = isDEStage; }
          else if (bracketSide === "G") { bracketLabel = isDEStage ? " · Grande finale" : " · Finale"; stageShowRound = false; }
          else if (bracketSide === "BG") { bracketLabel = " · Finale reset"; stageShowRound = false; }
        }
        if (group.phase === "BRACKET" && bracketSide) {
          // Detect SWISS_SPLIT_SE by presence of B/BG/BL sides
          const isSplitSE = filtered.some((m) => m.phase === "BRACKET" && (m.bracketSide === "B" || m.bracketSide === "BG" || m.bracketSide === "BL"));
          if (isSplitSE) {
            // Top 10 / Bottom 8 labels for SWISS_SPLIT_SE
            if (bracketSide === "W") bracketLabel = " · Top 10";
            else if (bracketSide === "G") bracketLabel = " · Top 10 · Finale";
            else if (bracketSide === "L") bracketLabel = " · Top 10 · Petite finale";
            else if (bracketSide === "B") bracketLabel = " · Bottom 8";
            else if (bracketSide === "BG") bracketLabel = " · Bottom 8 · Finale";
            else if (bracketSide === "BL") bracketLabel = " · Bottom 8 · Manche des perdants";
          } else {
            // SPLIT_SE sides
            if (bracketSide === "R1") bracketLabel = " · R1";
            else if (bracketSide === "W") bracketLabel = " · Winners";
            else if (bracketSide === "G") bracketLabel = " · Winners · Finale";
            else if (bracketSide === "WL") bracketLabel = " · Winners · 3ème place";
            else if (bracketSide === "L") bracketLabel = " · Losers";
            else if (bracketSide === "LG") bracketLabel = " · Losers · Finale";
            else if (bracketSide === "LL") bracketLabel = " · Losers · 3ème place";
          }
        }

        const isTruncated = poolRounds !== null && group.phase === "POOL" && group.roundIndex > poolRounds;
        const groupKey = `${group.phase}-R${group.roundIndex}${sessionLabel.replace(/\s/g, "")}${bracketSide ?? ""}${group.stageId ?? ""}${group.groupKey ?? ""}`;

        return (
          <div
            key={groupKey}
            className={`schedule-round${finished ? " schedule-round--finished" : ""}${active ? " schedule-round--active" : ""}${isTruncated ? " schedule-round--truncated" : ""}`}
          >
            <div className="schedule-round__header">
              <span className="schedule-round__label">
                {group.phase === "STAGE" ? (stages?.find((s) => s.id === group.stageId)?.name ?? t("pipeline_stage")) : (PHASE_LABEL[group.phase] ?? group.phase)}{bracketLabel}{(group.phase === "STAGE" ? stageShowRound : (!bracketSide || bracketSide === "W" || bracketSide === "L")) ? ` · Round ${group.roundIndex}` : ""}{sessionLabel}{grazPoolLabel}{group.phase === "STAGE" && group.groupKey ? ` · ${t("pipeline_group_label", { key: group.groupKey })}` : ""}
              </span>
              {finished && <span className="schedule-round__badge schedule-round__badge--done">{t("status_completed")}</span>}
              {active && <span className="schedule-round__badge schedule-round__badge--live">{t("status_live")}</span>}
              {!finished && !active && <span className="schedule-round__badge schedule-round__badge--scheduled">{t("status_upcoming")}</span>}
              {isOrganizer && testMode && !finished && (
                <button
                  type="button"
                  title="Générer des scores aléatoires"
                  disabled={loadingRound === groupKey}
                  onClick={() => generateRoundScores(groupKey, group.matches)}
                  style={{
                    marginLeft: "auto",
                    background: "none",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontSize: 14,
                    padding: "2px 8px",
                    opacity: loadingRound === groupKey ? 0.5 : 1,
                  }}
                >
                  {loadingRound === groupKey ? "⏳" : "🎲"}
                </button>
              )}
            </div>

            {courtCount > 1 ? (
              <div
                className="schedule-courts--multi"
                style={{ "--court-count": courtCount } as React.CSSProperties}
              >
                {[...courts.entries()].map(([court, courtMatches]) => (
                  <div key={court} className="schedule-court">
                    <h4>{court}</h4>
                    <div className="match-cards">
                      {courtMatches.map((match) => renderMatchCard(match, courtMatches))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="schedule-courts--single">
                <div className="match-cards">
                  {allCourtMatches.map((match) => renderMatchCard(match, allCourtMatches))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {filtered.length === 0 && (
        <div className="empty-state"><p>{t("schedule_no_filter_matches")}</p></div>
      )}

      <MatchEditPanel
        match={editMatch}
        onClose={closePanel}
        onSaved={handleSaved}
        isOrganizer={isOrganizer}
        teams={teams.map((tm) => ({ id: tm.id, name: tm.name }))}
        courtNames={Array.from(new Set(matches.map((m) => m.courtName))).sort()}
        allMatches={matches.map((m) => ({
          id: m.id,
          courtName: m.courtName,
          roundIndex: m.roundIndex,
          phase: m.phase,
          teamAName: teamName(m.teamAId),
          teamBName: teamName(m.teamBId),
          startAt: m.startAt instanceof Date ? m.startAt.toISOString() : String(m.startAt),
        }))}
        onReset={(matchId) => {
          setMatches((prev) =>
            prev.map((m) => m.id === matchId ? { ...m, status: "SCHEDULED" as Match["status"], scoreA: 0, scoreB: 0 } : m)
          );
          closePanel();
        }}
        onSwapped={(matchAId, matchBId, courtA, startAtA, courtB, startAtB) => {
          setMatches((prev) =>
            prev.map((m) => {
              if (m.id === matchAId) return { ...m, courtName: courtA, startAt: new Date(startAtA) };
              if (m.id === matchBId) return { ...m, courtName: courtB, startAt: new Date(startAtB) };
              return m;
            })
          );
        }}
      />

      {recapMatchId && (() => {
        const recapMatch = matches.find((m) => m.id === recapMatchId);
        if (!recapMatch) return null;
        return (
          <MatchRecapModal
            teamAId={recapMatch.teamAId}
            teamBId={recapMatch.teamBId}
            teamAName={teamName(recapMatch.teamAId)}
            teamBName={teamName(recapMatch.teamBId)}
            events={recapMatch.events ?? []}
            playerNames={playerNames}
            onClose={() => setRecapMatchId(null)}
          />
        );
      })()}
    </div>
  );
}
