"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { TournamentEditForm } from "@/components/TournamentEditForm";
import { UnifiedTeamManager } from "@/components/UnifiedTeamManager";
import { PoolAssignment } from "@/components/PoolAssignment";
import { FreeAgentList } from "@/components/FreeAgentList";
import { CrossPoolActions } from "@/components/CrossPoolActions";
import { BracketActions } from "@/components/BracketActions";
import { FridayGroupAssignment } from "@/components/FridayGroupAssignment";
import { BerlinMixedActions } from "@/components/BerlinMixedActions";
import { SponsorManager } from "@/components/SponsorManager";
import { CoOrganizerManager } from "@/components/CoOrganizerManager";
import { RefereeManager } from "@/components/RefereeManager";
import ConfirmFormButton from "@/components/ConfirmFormButton";
import { PoolScheduleEditor } from "@/components/PoolScheduleEditor";
import { OrgaTaskBoard } from "@/components/OrgaTaskBoard";
import { OrgaNoteBoard } from "@/components/OrgaNoteBoard";
import { OrgaLinkBoard } from "@/components/OrgaLinkBoard";
import { AnnouncePanel } from "@/components/AnnouncePanel";
import { SelectionManager } from "@/components/SelectionManager";
import { DrawPanel } from "@/components/DrawPanel";
import { AccommodationManager } from "@/components/AccommodationManager";
import { QRCodeSVG } from "qrcode.react";
import { PipelinePlanning } from "@/components/PipelinePlanning";
import { NextActionCard } from "@/components/orga/NextActionCard";
import { TournamentFormatTab } from "@/components/orga/TournamentFormatTab";


// ─── GrazPlanning ────────────────────────────────────────────────────────────

type GrazTab = "samedi" | "dimanche";

function GrazPlanning({
  tournament,
  pools,
  matches,
  launchGrazPoolBAction,
  launchGrazSundayRRAction,
  launchGrazRegroupAction,
  launchGrazSEAction,
  resetGrazPhaseAction,
}: {
  tournament: any;
  pools: any[];
  matches: any[];
  launchGrazPoolBAction?: () => Promise<{ ok?: boolean; error?: string }>;
  launchGrazSundayRRAction?: () => Promise<{ ok?: boolean; error?: string }>;
  launchGrazRegroupAction?: () => Promise<{ ok?: boolean; error?: string }>;
  launchGrazSEAction?: () => Promise<{ ok?: boolean; error?: string }>;
  resetGrazPhaseAction?: (phase: "SUNDAY_RR" | "REGROUP" | "SE") => Promise<{ ok?: boolean; error?: string }>;
}) {
  const t = useTranslations("tournament");
  const [tab, setTab] = useState<GrazTab>("samedi");
  const [pendingB, setPendingB] = useState(false);
  const [pendingSun, setPendingSun] = useState(false);
  const [pendingRegroup, setPendingRegroup] = useState(false);
  const [pendingSE, setPendingSE] = useState(false);
  const [pendingReset, setPendingReset] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const poolAId = pools.find((p: any) => p.name === "Pool A")?.id;
  const poolBId = pools.find((p: any) => p.name === "Pool B")?.id;

  const rrMatches = matches.filter((m: any) => m.phase === "GRAZ_RR");
  const poolADay1 = rrMatches.filter((m: any) => m.dayIndex === "SAT" && m.poolId === poolAId);
  const poolBDay1 = rrMatches.filter((m: any) => m.dayIndex === "SAT" && m.poolId === poolBId);
  const sundayRR = rrMatches.filter((m: any) => m.dayIndex === "SUN");
  const regroupMatches = matches.filter((m: any) => m.phase === "GRAZ_REGROUP");
  const seMatches = matches.filter((m: any) => m.phase === "GRAZ_SE");

  const poolADay1Done = poolADay1.length > 0 && poolADay1.every((m: any) => m.status === "FINISHED");
  const poolBDay1Done = poolBDay1.length > 0 && poolBDay1.every((m: any) => m.status === "FINISHED");
  const sundayRRDone = sundayRR.length > 0 && sundayRR.every((m: any) => m.status === "FINISHED");

  const canLaunchPoolB = poolADay1.length > 0 && poolBDay1.length === 0;
  const canLaunchSundayRR = poolADay1.length > 0 && poolBDay1.length > 0 && sundayRR.length === 0;

  const matchCount = (arr: any[]) => ({ done: arr.filter((m: any) => m.status === "FINISHED").length, total: arr.length });

  function StatusLine({ arr }: { arr: any[] }) {
    const { done, total } = matchCount(arr);
    if (total === 0) return <p className="meta">{t("orga_matches_not_generated")}</p>;
    return (
      <p style={{ fontSize: 13, margin: 0, color: done === total ? "var(--teal)" : "var(--text)" }}>
        {t("orga_matches_finished_count", { done, total })}{done === total ? " ✓" : ""}
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <div className="tabs-bar" style={{ marginTop: 0 }}>
        <div className="tabs">
          {(["samedi", "dimanche"] as GrazTab[]).map((v) => (
            <button key={v} type="button" onClick={() => setTab(v)} className={`tab${tab === v ? " active" : ""}`}>
              {v === "samedi" ? t("orga_day1_label") : t("orga_day2_label")}
            </button>
          ))}
        </div>
      </div>

      {error && <p style={{ color: "var(--danger)", fontSize: 12, padding: "8px 0" }}>{error}</p>}

      {tab === "samedi" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Pool A — matin */}
          <div className="panel">
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 8 }}>
              {t("graz_pool_a_day1" as any)}
            </p>
            <StatusLine arr={poolADay1} />
          </div>

          {/* Pool B — après-midi */}
          <div className="panel">
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 8 }}>
              {t("graz_pool_b_day1" as any)}
            </p>
            <StatusLine arr={poolBDay1} />
            {canLaunchPoolB && launchGrazPoolBAction && (
              <button
                className="primary"
                style={{ marginTop: 10, fontSize: 13 }}
                disabled={pendingB}
                onClick={async () => {
                  setPendingB(true);
                  setError(null);
                  const res = await launchGrazPoolBAction();
                  if (res?.error) setError(res.error);
                  setPendingB(false);
                }}
              >
                {pendingB ? "..." : t("graz_launch_pool_b" as any)}
              </button>
            )}
          </div>
        </div>
      )}

      {tab === "dimanche" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Rounds 6-7 alternés */}
          <div className="panel">
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 8 }}>
              {t("graz_sunday_rr" as any)}
            </p>
            <StatusLine arr={sundayRR} />
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              {canLaunchSundayRR && launchGrazSundayRRAction && (
                <button className="primary" style={{ fontSize: 13 }} disabled={pendingSun}
                  onClick={async () => { setPendingSun(true); setError(null); const res = await launchGrazSundayRRAction(); if (res?.error) setError(res.error); setPendingSun(false); }}>
                  {pendingSun ? "..." : t("graz_launch_sunday_rr" as any)}
                </button>
              )}
              {sundayRR.length > 0 && resetGrazPhaseAction && (
                <button className="ghost" style={{ fontSize: 12, color: "var(--danger)" }} disabled={pendingReset === "SUNDAY_RR"}
                  onClick={async () => { if (!window.confirm("Reset Rounds 6-7 + Regroup + SE ?")) return; setPendingReset("SUNDAY_RR"); setError(null); const res = await resetGrazPhaseAction("SUNDAY_RR"); if (res?.error) setError(res.error); setPendingReset(null); }}>
                  {pendingReset === "SUNDAY_RR" ? "..." : "↺ Reset"}
                </button>
              )}
            </div>
          </div>

          {/* Regroup */}
          <div className="panel">
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 8 }}>
              {t("graz_regroup" as any)}
            </p>
            <StatusLine arr={regroupMatches} />
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              {regroupMatches.length === 0 && sundayRRDone && launchGrazRegroupAction && (
                <button className="primary" style={{ fontSize: 13 }} disabled={pendingRegroup}
                  onClick={async () => { setPendingRegroup(true); setError(null); const res = await launchGrazRegroupAction(); if (res?.error) setError(res.error); setPendingRegroup(false); }}>
                  {pendingRegroup ? "..." : t("graz_launch_regroup" as any)}
                </button>
              )}
              {regroupMatches.length > 0 && resetGrazPhaseAction && (
                <button className="ghost" style={{ fontSize: 12, color: "var(--danger)" }} disabled={pendingReset === "REGROUP"}
                  onClick={async () => { if (!window.confirm("Reset Regroup + SE ?")) return; setPendingReset("REGROUP"); setError(null); const res = await resetGrazPhaseAction("REGROUP"); if (res?.error) setError(res.error); setPendingReset(null); }}>
                  {pendingReset === "REGROUP" ? "..." : "↺ Reset"}
                </button>
              )}
            </div>
          </div>

          {/* SE */}
          <div className="panel">
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 8 }}>
              {t("graz_se" as any)}
            </p>
            <StatusLine arr={seMatches} />
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              {seMatches.length === 0 && regroupMatches.length > 0 && regroupMatches.every((m: any) => m.status === "FINISHED") && launchGrazSEAction && (
                <button className="primary" style={{ fontSize: 13 }} disabled={pendingSE}
                  onClick={async () => { setPendingSE(true); setError(null); const res = await launchGrazSEAction(); if (res?.error) setError(res.error); setPendingSE(false); }}>
                  {pendingSE ? "..." : t("graz_launch_se" as any)}
                </button>
              )}
              {seMatches.length > 0 && resetGrazPhaseAction && (
                <button className="ghost" style={{ fontSize: 12, color: "var(--danger)" }} disabled={pendingReset === "SE"}
                  onClick={async () => { if (!window.confirm("Reset SE ?")) return; setPendingReset("SE"); setError(null); const res = await resetGrazPhaseAction("SE"); if (res?.error) setError(res.error); setPendingReset(null); }}>
                  {pendingReset === "SE" ? "..." : "↺ Reset"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── BigApplePlanning ────────────────────────────────────────────────────────

type BigAppleTab = "samedi" | "dimanche";

function BigApplePlanning({
  tournament,
  pools,
  matches,
  launchBigAppleSwissRoundAction,
  launchBigApplePlacementAction,
  launchBigAppleSEAction,
  resetBigApplePhaseAction,
}: {
  tournament: any;
  pools: any[];
  matches: any[];
  launchBigAppleSwissRoundAction?: () => Promise<{ ok?: boolean; error?: string }>;
  launchBigApplePlacementAction?: () => Promise<{ ok?: boolean; error?: string }>;
  launchBigAppleSEAction?: () => Promise<{ ok?: boolean; error?: string }>;
  resetBigApplePhaseAction?: (phase: "SWISS" | "PLACEMENT" | "SE") => Promise<{ ok?: boolean; error?: string }>;
}) {
  const t = useTranslations("tournament");
  const [tab, setTab] = useState<BigAppleTab>("samedi");
  const [pendingSwiss, setPendingSwiss] = useState(false);
  const [pendingPlacement, setPendingPlacement] = useState(false);
  const [pendingSE, setPendingSE] = useState(false);
  const [pendingReset, setPendingReset] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const poolAId = pools.find((p: any) => p.name === "Pool A")?.id;
  const poolBId = pools.find((p: any) => p.name === "Pool B")?.id;

  const rrMatches = matches.filter((m: any) => m.phase === "BIG_APPLE_RR");
  const poolARR = rrMatches.filter((m: any) => m.poolId === poolAId);
  const poolBRR = rrMatches.filter((m: any) => m.poolId === poolBId);
  const swissMatches = matches.filter((m: any) => m.phase === "BIG_APPLE_SWISS");
  const placementMatches = matches.filter((m: any) => m.phase === "BIG_APPLE_PLACEMENT");
  const seMatches = matches.filter((m: any) => m.phase === "BIG_APPLE_SE");

  const rrDone = rrMatches.length > 0 && rrMatches.every((m: any) => m.status === "FINISHED");
  const swissRoundsDone = swissMatches.length > 0 ? Math.max(...swissMatches.map((m: any) => m.roundIndex)) : 0;
  const currentSwissRound = swissMatches.filter((m: any) => m.roundIndex === swissRoundsDone);
  const currentSwissDone = currentSwissRound.length > 0 && currentSwissRound.every((m: any) => m.status === "FINISHED");
  const swissAllDone = swissRoundsDone >= 3 && currentSwissDone;
  const canLaunchNextSwiss = rrDone && swissRoundsDone < 3 && (swissRoundsDone === 0 || currentSwissDone);
  const placementDone = placementMatches.length > 0 && placementMatches.every((m: any) => m.status === "FINISHED");
  const canLaunchPlacement = rrDone && placementMatches.length === 0;
  const canLaunchSE = seMatches.length === 0 && swissAllDone && placementDone;

  const matchCount = (arr: any[]) => ({ done: arr.filter((m: any) => m.status === "FINISHED").length, total: arr.length });

  function StatusLine({ arr }: { arr: any[] }) {
    const { done, total } = matchCount(arr);
    if (total === 0) return <p className="meta">{t("orga_matches_not_generated")}</p>;
    return (
      <p style={{ fontSize: 13, margin: 0, color: done === total ? "var(--teal)" : "var(--text)" }}>
        {t("orga_matches_finished_count", { done, total })}{done === total ? " ✓" : ""}
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <div className="tabs-bar" style={{ marginTop: 0 }}>
        <div className="tabs">
          {(["samedi", "dimanche"] as BigAppleTab[]).map((v) => (
            <button key={v} type="button" onClick={() => setTab(v)} className={`tab${tab === v ? " active" : ""}`}>
              {v === "samedi" ? t("orga_day1_label") : t("orga_day2_label")}
            </button>
          ))}
        </div>
      </div>

      {error && <p style={{ color: "var(--danger)", fontSize: 12, padding: "8px 0" }}>{error}</p>}

      {tab === "samedi" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="panel">
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 8 }}>
              {t("big_apple_pool_a_rr" as any)}
            </p>
            <StatusLine arr={poolARR} />
          </div>
          <div className="panel">
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 8 }}>
              {t("big_apple_pool_b_rr" as any)}
            </p>
            <StatusLine arr={poolBRR} />
          </div>
        </div>
      )}

      {tab === "dimanche" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Swiss 3 rounds (teams 3-8) */}
          <div className="panel">
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 8 }}>
              {t("big_apple_swiss" as any)}
            </p>
            <StatusLine arr={swissMatches} />
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              {canLaunchNextSwiss && launchBigAppleSwissRoundAction && (
                <button className="primary" style={{ fontSize: 13 }} disabled={pendingSwiss}
                  onClick={async () => { setPendingSwiss(true); setError(null); const res = await launchBigAppleSwissRoundAction(); if (res?.error) setError(res.error); setPendingSwiss(false); }}>
                  {pendingSwiss ? "..." : t("big_apple_launch_swiss" as any, { round: swissRoundsDone + 1 })}
                </button>
              )}
              {swissMatches.length > 0 && resetBigApplePhaseAction && (
                <button className="ghost" style={{ fontSize: 12, color: "var(--danger)" }} disabled={pendingReset === "SWISS"}
                  onClick={async () => { if (!window.confirm("Reset Swiss + Placement + SE ?")) return; setPendingReset("SWISS"); setError(null); const res = await resetBigApplePhaseAction("SWISS"); if (res?.error) setError(res.error); setPendingReset(null); }}>
                  {pendingReset === "SWISS" ? "..." : "↺ Reset"}
                </button>
              )}
            </div>
          </div>

          {/* Placement matches (1&2 of each pool) */}
          <div className="panel">
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 8 }}>
              {t("big_apple_placement" as any)}
            </p>
            <StatusLine arr={placementMatches} />
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              {canLaunchPlacement && launchBigApplePlacementAction && (
                <button className="primary" style={{ fontSize: 13 }} disabled={pendingPlacement}
                  onClick={async () => { setPendingPlacement(true); setError(null); const res = await launchBigApplePlacementAction(); if (res?.error) setError(res.error); setPendingPlacement(false); }}>
                  {pendingPlacement ? "..." : t("big_apple_launch_placement" as any)}
                </button>
              )}
              {placementMatches.length > 0 && resetBigApplePhaseAction && (
                <button className="ghost" style={{ fontSize: 12, color: "var(--danger)" }} disabled={pendingReset === "PLACEMENT"}
                  onClick={async () => { if (!window.confirm("Reset Placement + SE ?")) return; setPendingReset("PLACEMENT"); setError(null); const res = await resetBigApplePhaseAction("PLACEMENT"); if (res?.error) setError(res.error); setPendingReset(null); }}>
                  {pendingReset === "PLACEMENT" ? "..." : "↺ Reset"}
                </button>
              )}
            </div>
          </div>

          {/* SE bracket */}
          <div className="panel">
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 8 }}>
              {t("big_apple_se" as any)}
            </p>
            <StatusLine arr={seMatches} />
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              {canLaunchSE && launchBigAppleSEAction && (
                <button className="primary" style={{ fontSize: 13 }} disabled={pendingSE}
                  onClick={async () => { setPendingSE(true); setError(null); const res = await launchBigAppleSEAction(); if (res?.error) setError(res.error); setPendingSE(false); }}>
                  {pendingSE ? "..." : t("big_apple_launch_se" as any)}
                </button>
              )}
              {seMatches.length > 0 && resetBigApplePhaseAction && (
                <button className="ghost" style={{ fontSize: 12, color: "var(--danger)" }} disabled={pendingReset === "SE"}
                  onClick={async () => { if (!window.confirm("Reset SE ?")) return; setPendingReset("SE"); setError(null); const res = await resetBigApplePhaseAction("SE"); if (res?.error) setError(res.error); setPendingReset(null); }}>
                  {pendingReset === "SE" ? "..." : "↺ Reset"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── KiosquePlanning ─────────────────────────────────────────────────────────

function KiosquePoolPanel({
  poolName, poolMatches, swissRounds, pending, act, launchPoolRound, t,
}: {
  poolName: string; poolMatches: any[]; swissRounds: number; pending: string | null;
  act: (key: string, fn: () => Promise<{ ok?: boolean; error?: string }>) => void;
  launchPoolRound?: (poolName: "Pool A" | "Pool B") => Promise<{ ok?: boolean; error?: string }>;
  t: (key: string, values?: Record<string, any>) => string;
}) {
  const maxRound = poolMatches.length > 0 ? Math.max(...poolMatches.map((m: any) => m.roundIndex)) : 0;
  const currentRoundMatches = poolMatches.filter((m: any) => m.roundIndex === maxRound);
  const currentRoundDone = currentRoundMatches.length > 0 && currentRoundMatches.every((m: any) => m.status === "FINISHED");
  const allDone = poolMatches.length > 0 && poolMatches.every((m: any) => m.status === "FINISHED") && maxRound >= swissRounds;
  const canLaunchNext = (maxRound === 0 || currentRoundDone) && maxRound < swissRounds;
  const nextRound = maxRound + 1;
  const key = `pool-${poolName}`;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <span style={{ fontSize: 13, fontWeight: 600, minWidth: 60 }}>{poolName}</span>
      {maxRound === 0 ? (
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("kiosque_pool_no_round" as any)}</span>
      ) : (
        <span style={{ fontSize: 12, color: allDone ? "var(--teal)" : currentRoundDone ? "var(--teal)" : "var(--text-muted)" }}>
          {t("kiosque_pool_round_status" as any, { current: maxRound, total: swissRounds, done: currentRoundMatches.filter((m: any) => m.status === "FINISHED").length, count: currentRoundMatches.length })}
          {allDone ? ` — ${t("kiosque_pool_done" as any)}` : currentRoundDone ? " ✓" : ""}
        </span>
      )}
      {canLaunchNext && launchPoolRound && (
        <button className="ghost" disabled={pending === key}
          onClick={() => act(key, () => launchPoolRound(poolName as "Pool A" | "Pool B"))}>
          {pending === key ? "..." : t("kiosque_launch_round" as any, { round: nextRound })}
        </button>
      )}
    </div>
  );
}

function KiosquePlanning({
  tournament,
  pools,
  matches,
  launchKiosquePoolRoundAction,
  launchKiosqueRegroupAction,
  launchKiosqueNextRoundAction,
  launchKiosqueSEAction,
  resetKiosquePhaseAction,
  resetKiosqueJ1Action,
}: {
  tournament: any;
  pools: any[];
  matches: any[];
  launchKiosquePoolRoundAction?: (poolName: "Pool A" | "Pool B") => Promise<{ ok?: boolean; error?: string }>;
  launchKiosqueRegroupAction?: () => Promise<{ ok?: boolean; error?: string }>;
  launchKiosqueNextRoundAction?: (group: "Top 4" | "Bottom 12") => Promise<{ ok?: boolean; error?: string }>;
  launchKiosqueSEAction?: () => Promise<{ ok?: boolean; error?: string }>;
  resetKiosquePhaseAction?: (phase: "REGROUP" | "SE") => Promise<{ ok?: boolean; error?: string }>;
  resetKiosqueJ1Action?: () => Promise<{ ok?: boolean; error?: string }>;
}) {
  const t = useTranslations("tournament");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const j1Matches = matches.filter((m: any) => m.phase === "KIOSQUE_POOL");
  const top4Matches = matches.filter((m: any) => m.phase === "KIOSQUE_TOP4");
  const bottom12Matches = matches.filter((m: any) => m.phase === "KIOSQUE_BOTTOM12");
  const seMatches = matches.filter((m: any) => m.phase === "KIOSQUE_SE");

  const swissRounds = tournament.swissRounds ?? 5;
  const j1Done = j1Matches.length > 0 && j1Matches.every((m: any) => m.status === "FINISHED");

  // Split J1 matches by pool
  const poolARecord = pools.find((p: any) => p.name === "Pool A");
  const poolBRecord = pools.find((p: any) => p.name === "Pool B");
  const poolAMatches = j1Matches.filter((m: any) => m.poolId === poolARecord?.id);
  const poolBMatches = j1Matches.filter((m: any) => m.poolId === poolBRecord?.id);

  const top4Rounds = top4Matches.length > 0 ? Math.max(...top4Matches.map((m: any) => m.roundIndex)) : 0;
  const bottom12Rounds = bottom12Matches.length > 0 ? Math.max(...bottom12Matches.map((m: any) => m.roundIndex)) : 0;
  const top4CurrentDone = top4Matches.filter((m: any) => m.roundIndex === top4Rounds).every((m: any) => m.status === "FINISHED");
  const bottom12CurrentDone = bottom12Matches.filter((m: any) => m.roundIndex === bottom12Rounds).every((m: any) => m.status === "FINISHED");

  const act = async (key: string, fn: () => Promise<{ ok?: boolean; error?: string }>) => {
    setPending(key); setError(null);
    const res = await fn();
    if (res?.error) setError(res.error);
    setPending(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}

      {/* J1 — Pool A + Pool B */}
      <div className="panel">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", margin: 0 }}>
            {t("kiosque_j1_title" as any, { rounds: swissRounds })}
          </p>
          {resetKiosqueJ1Action && j1Matches.length > 0 && (
            <button className="ghost" style={{ fontSize: 11, color: "var(--danger)", padding: "2px 8px" }}
              disabled={pending === "reset-j1"}
              onClick={async () => { if (!window.confirm(t("kiosque_reset_j1_confirm" as any))) return; act("reset-j1", resetKiosqueJ1Action); }}>
              {pending === "reset-j1" ? "..." : t("kiosque_reset_j1" as any)}
            </button>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {poolARecord ? (
            <KiosquePoolPanel poolName="Pool A" poolMatches={poolAMatches} swissRounds={swissRounds}
              pending={pending} act={act} launchPoolRound={launchKiosquePoolRoundAction} t={t as any} />
          ) : <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("kiosque_pool_not_created" as any, { pool: "Pool A" })}</span>}
          {poolBRecord ? (
            <KiosquePoolPanel poolName="Pool B" poolMatches={poolBMatches} swissRounds={swissRounds}
              pending={pending} act={act} launchPoolRound={launchKiosquePoolRoundAction} t={t as any} />
          ) : <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("kiosque_pool_not_created" as any, { pool: "Pool B" })}</span>}
        </div>
      </div>

      {/* Regroup */}
      <div className="panel">
        <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 8 }}>
          {t("kiosque_regroup_title" as any)}
        </p>

        {top4Matches.length === 0 && bottom12Matches.length === 0 ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {j1Done && launchKiosqueRegroupAction && (
              <button className="ghost" disabled={pending === "regroup"}
                onClick={() => act("regroup", launchKiosqueRegroupAction)}>
                {pending === "regroup" ? "..." : t("kiosque_regroup_launch" as any)}
              </button>
            )}
            {!j1Done && <p className="meta" style={{ margin: 0 }}>{t("kiosque_regroup_wait_j1" as any)}</p>}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {/* Top 4 */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, minWidth: 120 }}>{t("kiosque_group_round_status" as any, { group: "Top 4", current: top4Rounds, total: 2 })}</span>
              <span style={{ fontSize: 12, color: top4CurrentDone ? "var(--teal)" : "var(--text-muted)" }}>
                {t("kiosque_group_matches" as any, { done: top4Matches.filter((m: any) => m.roundIndex === top4Rounds && m.status === "FINISHED").length, count: top4Matches.filter((m: any) => m.roundIndex === top4Rounds).length })}
                {top4CurrentDone && top4Rounds < 2 ? " ✓" : top4CurrentDone && top4Rounds >= 2 ? ` ✓ ${t("kiosque_group_done" as any)}` : ""}
              </span>
              {top4CurrentDone && top4Rounds < 2 && launchKiosqueNextRoundAction && (
                <button className="ghost" disabled={pending === "top4-next"}
                  onClick={() => act("top4-next", () => launchKiosqueNextRoundAction("Top 4"))}>
                  {pending === "top4-next" ? "..." : t("kiosque_launch_round" as any, { round: top4Rounds + 1 })}
                </button>
              )}
            </div>
            {/* Bottom 12 */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, minWidth: 120 }}>{t("kiosque_group_round_status" as any, { group: "Bottom 12", current: bottom12Rounds, total: 3 })}</span>
              <span style={{ fontSize: 12, color: bottom12CurrentDone ? "var(--teal)" : "var(--text-muted)" }}>
                {t("kiosque_group_matches" as any, { done: bottom12Matches.filter((m: any) => m.roundIndex === bottom12Rounds && m.status === "FINISHED").length, count: bottom12Matches.filter((m: any) => m.roundIndex === bottom12Rounds).length })}
                {bottom12CurrentDone && bottom12Rounds < 3 ? " ✓" : bottom12CurrentDone && bottom12Rounds >= 3 ? ` ✓ ${t("kiosque_group_done" as any)}` : ""}
              </span>
              {bottom12CurrentDone && bottom12Rounds < 3 && launchKiosqueNextRoundAction && (
                <button className="ghost" disabled={pending === "bottom12-next"}
                  onClick={() => act("bottom12-next", () => launchKiosqueNextRoundAction("Bottom 12"))}>
                  {pending === "bottom12-next" ? "..." : t("kiosque_launch_round" as any, { round: bottom12Rounds + 1 })}
                </button>
              )}
            </div>
            {resetKiosquePhaseAction && (top4Matches.length > 0 || bottom12Matches.length > 0) && seMatches.length === 0 && (
              <button className="ghost" style={{ fontSize: 12, color: "var(--danger)", marginTop: 4, width: "fit-content" }}
                disabled={pending === "reset-regroup"}
                onClick={async () => { if (!window.confirm(t("kiosque_reset_regroup_confirm" as any))) return; act("reset-regroup", () => resetKiosquePhaseAction("REGROUP")); }}>
                {pending === "reset-regroup" ? "..." : t("kiosque_reset_regroup" as any)}
              </button>
            )}
          </div>
        )}
      </div>

      {/* SE */}
      <div className="panel">
        <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 8 }}>
          {t("kiosque_se_title" as any)}
        </p>
        {seMatches.length === 0 ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {top4Rounds >= 2 && top4CurrentDone && bottom12Rounds >= 3 && bottom12CurrentDone && launchKiosqueSEAction ? (
              <button className="ghost" disabled={pending === "se"}
                onClick={() => act("se", launchKiosqueSEAction)}>
                {pending === "se" ? "..." : t("kiosque_se_launch" as any)}
              </button>
            ) : (
              <p className="meta" style={{ margin: 0 }}>{t("kiosque_se_wait_regroup" as any)}</p>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <p style={{ fontSize: 13, margin: 0, color: seMatches.every((m: any) => m.status === "FINISHED") ? "var(--teal)" : "var(--text)" }}>
              {t("kiosque_se_matches" as any, { done: seMatches.filter((m: any) => m.status === "FINISHED").length, total: seMatches.length })}
              {seMatches.every((m: any) => m.status === "FINISHED") ? " ✓" : ""}
            </p>
            {resetKiosquePhaseAction && (
              <button className="ghost" style={{ fontSize: 12, color: "var(--danger)" }}
                disabled={pending === "reset-se"}
                onClick={async () => { if (!window.confirm(t("kiosque_reset_se_confirm" as any))) return; act("reset-se", () => resetKiosquePhaseAction("SE")); }}>
                {pending === "reset-se" ? "..." : t("kiosque_reset_se" as any)}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SplitSwissGroupAssignment ────────────────────────────────────────────────

function SplitSwissGroupAssignment({
  teams,
  onSave,
}: {
  teams: Array<{ id: string; name: string; seed: number; saturdayGroup?: string | null }>;
  onSave?: (groupA: string[], groupB: string[]) => Promise<{ ok?: boolean; error?: string }>;
}) {
  const router = useRouter();
  const initGroups = () => {
    const A: string[] = [];
    const B: string[] = [];
    const none: string[] = [];
    for (const t of teams) {
      if (t.saturdayGroup === "A") A.push(t.id);
      else if (t.saturdayGroup === "B") B.push(t.id);
      else none.push(t.id);
    }
    // Unassigned → distribute by seed serpentin
    none.sort((a, b) => {
      const ta = teams.find((t) => t.id === a)!;
      const tb = teams.find((t) => t.id === b)!;
      return ta.seed - tb.seed;
    });
    none.forEach((id, i) => {
      const round = Math.floor(i / 2);
      const pos = i % 2;
      const toA = round % 2 === 0 ? pos === 0 : pos === 1;
      if (toA) A.push(id);
      else B.push(id);
    });
    return { A, B };
  };

  const [groups, setGroups] = useState<{ A: string[]; B: string[] }>(initGroups);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const teamMap = new Map(teams.map((t) => [t.id, t]));

  const moveTeam = (teamId: string, to: "A" | "B") => {
    setGroups((prev) => ({
      A: to === "A" ? [...prev.A.filter((id) => id !== teamId), teamId] : prev.A.filter((id) => id !== teamId),
      B: to === "B" ? [...prev.B.filter((id) => id !== teamId), teamId] : prev.B.filter((id) => id !== teamId),
    }));
  };

  const handleSave = async () => {
    if (!onSave) return;
    setSaving(true);
    setMessage(null);
    const res = await onSave(groups.A, groups.B);
    setSaving(false);
    if (res?.error) setMessage(`Erreur : ${res.error}`);
    else { setMessage("Groupes sauvegardés ✓"); router.refresh(); }
  };

  const renderGroup = (label: "A" | "B", subtitle: string) => {
    const ids = groups[label];
    const other: "A" | "B" = label === "A" ? "B" : "A";
    return (
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 8 }}>
          Groupe {label} — {subtitle} — {ids.length} équipes
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minHeight: 80 }}>
          {ids.map((id) => {
            const team = teamMap.get(id);
            if (!team) return null;
            return (
              <div key={id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 10px", background: "var(--bg)", borderRadius: 6, border: "1px solid var(--border)", fontSize: 13 }}>
                <span>#{team.seed} {team.name}</span>
                <button type="button" onClick={() => moveTeam(id, other)} style={{ fontSize: 11, padding: "2px 8px", cursor: "pointer", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-muted)" }}>
                  → {other}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {renderGroup("A", "matin")}
        {renderGroup("B", "après-midi")}
      </div>
      <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12 }}>
        <button type="button" className="primary" onClick={handleSave} disabled={saving} style={{ fontSize: 13, padding: "8px 20px" }}>
          {saving ? "…" : "Sauvegarder les groupes"}
        </button>
        {message && <span style={{ fontSize: 12, color: message.startsWith("Erreur") ? "var(--danger)" : "var(--teal)" }}>{message}</span>}
      </div>
    </div>
  );
}

// ─── SplitSwissPlanning ──────────────────────────────────────────────────────

type SplitSwissTab = "groupes" | "groupe_a" | "groupe_b" | "dimanche";

function SplitSwissPlanning({
  tournament,
  teams,
  matches,
  generateSplitSwissRoundAction,
  saveSplitSwissGroupsAction,
  generateSplitSwissBracketAction,
  resetSplitSwissPhaseAction,
}: {
  tournament: any;
  teams: any[];
  matches: any[];
  generateSplitSwissRoundAction?: (group: "A" | "B") => Promise<{ ok?: boolean; round?: number; error?: string }>;
  saveSplitSwissGroupsAction?: (groupA: string[], groupB: string[]) => Promise<{ ok?: boolean; error?: string }>;
  generateSplitSwissBracketAction?: () => Promise<{ ok?: boolean; error?: string }>;
  resetSplitSwissPhaseAction?: (phase: "SWISS_A" | "SWISS_B" | "BRACKET") => Promise<{ ok?: boolean; error?: string }>;
}) {
  const [tab, setTab] = useState<SplitSwissTab>("groupes");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [liveMatches, setLiveMatches] = useState<any[]>(matches);
  useEffect(() => { setLiveMatches(matches); }, [matches]);
  useEffect(() => {
    const es = new EventSource(`/api/sse?tournamentId=${tournament.id}`);
    es.addEventListener("match", (event) => {
      const payload = JSON.parse((event as MessageEvent).data);
      if (payload?.data?.match) {
        const updated = payload.data.match;
        setLiveMatches((prev) => {
          const exists = prev.some((m) => m.id === updated.id);
          if (exists) return prev.map((m) => m.id === updated.id ? { ...m, ...updated } : m);
          return [...prev, updated];
        });
      }
    });
    return () => es.close();
  }, [tournament.id]);

  const swissA = liveMatches.filter((m) => m.phase === "SWISS_A");
  const swissB = liveMatches.filter((m) => m.phase === "SWISS_B");
  const bracketMatches = liveMatches.filter((m) => m.phase === "BRACKET");

  const roundsA = swissA.length > 0 ? Math.max(...swissA.map((m) => m.roundIndex)) : 0;
  const roundsB = swissB.length > 0 ? Math.max(...swissB.map((m) => m.roundIndex)) : 0;
  const maxRounds = tournament.saturdayRounds ?? tournament.swissRounds ?? 5;

  const lastRoundADone = roundsA === 0 || swissA.filter((m) => m.roundIndex === roundsA).every((m) => m.status === "FINISHED");
  const lastRoundBDone = roundsB === 0 || swissB.filter((m) => m.roundIndex === roundsB).every((m) => m.status === "FINISHED");
  const allADone = swissA.length > 0 && swissA.every((m) => m.status === "FINISHED");
  const allBDone = swissB.length > 0 && swissB.every((m) => m.status === "FINISHED");
  const allSwissDone = allADone && allBDone;

  const teamsA = teams.filter((t) => t.saturdayGroup === "A");
  const teamsB = teams.filter((t) => t.saturdayGroup === "B");
  const groupsAssigned = teamsA.length > 0 || teamsB.length > 0;

  function StatusLine({ arr }: { arr: any[] }) {
    const done = arr.filter((m) => m.status === "FINISHED").length;
    const total = arr.length;
    if (total === 0) return <p className="meta">Aucun match généré</p>;
    return (
      <p style={{ fontSize: 13, margin: 0, color: done === total ? "var(--teal)" : "var(--text)" }}>
        {done}/{total} terminés{done === total ? " ✓" : ""}
      </p>
    );
  }

  async function run(key: string, fn: () => Promise<{ ok?: boolean; error?: string }>) {
    setPending(key);
    setError(null);
    const res = await fn();
    if (res?.error) setError(res.error);
    setPending(null);
  }

  const TABS: { value: SplitSwissTab; label: string }[] = [
    { value: "groupes", label: "Groupes" },
    { value: "groupe_a", label: "Groupe A (matin)" },
    { value: "groupe_b", label: "Groupe B (aprèm)" },
    { value: "dimanche", label: "Dimanche" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <div className="tabs-bar" style={{ marginTop: 0 }}>
        <div className="tabs">
          {TABS.map((t) => (
            <button key={t.value} type="button" onClick={() => setTab(t.value)} className={`tab${tab === t.value ? " active" : ""}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p style={{ color: "var(--danger)", fontSize: 12, padding: "8px 16px" }}>{error}</p>}

      {/* ── Onglet Groupes ── */}
      {tab === "groupes" && (
        <div className="panel">
          <SplitSwissGroupAssignment
            teams={teams.map((t) => ({ id: t.id, name: t.name, seed: t.seed, saturdayGroup: t.saturdayGroup }))}
            onSave={saveSplitSwissGroupsAction}
          />
        </div>
      )}

      {/* ── Onglet Groupe A ── */}
      {tab === "groupe_a" && (
        <div className="panel">
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 8 }}>
            Groupe A — {roundsA}/{maxRounds} tours
          </p>
          <StatusLine arr={swissA} />
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {lastRoundADone && roundsA < maxRounds && groupsAssigned && generateSplitSwissRoundAction && (
              <button
                className="primary"
                style={{ fontSize: 13 }}
                disabled={pending === "roundA"}
                onClick={() => run("roundA", () => generateSplitSwissRoundAction("A"))}
              >
                {pending === "roundA" ? "…" : `Générer tour ${roundsA + 1}`}
              </button>
            )}
            {swissA.length > 0 && resetSplitSwissPhaseAction && (
              <button
                className="ghost"
                style={{ fontSize: 12, color: "var(--danger)" }}
                disabled={pending === "resetA"}
                onClick={async () => {
                  if (!window.confirm(`Supprimer le tour ${roundsA} du Groupe A ?`)) return;
                  run("resetA", () => resetSplitSwissPhaseAction("SWISS_A"));
                }}
              >
                {pending === "resetA" ? "…" : "↺ Annuler dernier tour"}
              </button>
            )}
          </div>
          {!groupsAssigned && (
            <p className="meta" style={{ marginTop: 8 }}>Assignez les groupes d'abord.</p>
          )}
        </div>
      )}

      {/* ── Onglet Groupe B ── */}
      {tab === "groupe_b" && (
        <div className="panel">
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 8 }}>
            Groupe B — {roundsB}/{maxRounds} tours
          </p>
          <StatusLine arr={swissB} />
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {lastRoundBDone && roundsB < maxRounds && groupsAssigned && generateSplitSwissRoundAction && (
              <button
                className="primary"
                style={{ fontSize: 13 }}
                disabled={pending === "roundB"}
                onClick={() => run("roundB", () => generateSplitSwissRoundAction("B"))}
              >
                {pending === "roundB" ? "…" : `Générer tour ${roundsB + 1}`}
              </button>
            )}
            {swissB.length > 0 && resetSplitSwissPhaseAction && (
              <button
                className="ghost"
                style={{ fontSize: 12, color: "var(--danger)" }}
                disabled={pending === "resetB"}
                onClick={async () => {
                  if (!window.confirm(`Supprimer le tour ${roundsB} du Groupe B ?`)) return;
                  run("resetB", () => resetSplitSwissPhaseAction("SWISS_B"));
                }}
              >
                {pending === "resetB" ? "…" : "↺ Annuler dernier tour"}
              </button>
            )}
          </div>
          {!groupsAssigned && (
            <p className="meta" style={{ marginTop: 8 }}>Assignez les groupes d'abord.</p>
          )}
        </div>
      )}

      {/* ── Onglet Dimanche ── */}
      {tab === "dimanche" && (
        <div className="panel">
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 8 }}>
            Dimanche — {tournament.sundayFormat === "DE" ? "Double Élimination" : "Single Élimination"}
          </p>
          {!allSwissDone && (
            <p className="meta">Terminez tous les tours Swiss des deux groupes pour générer le bracket.</p>
          )}
          <StatusLine arr={bracketMatches} />
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {allSwissDone && bracketMatches.length === 0 && generateSplitSwissBracketAction && (
              <button
                className="primary"
                style={{ fontSize: 13 }}
                disabled={pending === "bracket"}
                onClick={() => run("bracket", generateSplitSwissBracketAction)}
              >
                {pending === "bracket" ? "…" : "Générer le bracket"}
              </button>
            )}
            {bracketMatches.length > 0 && resetSplitSwissPhaseAction && (
              <button
                className="ghost"
                style={{ fontSize: 12, color: "var(--danger)" }}
                disabled={pending === "resetBracket"}
                onClick={async () => {
                  if (!window.confirm("Supprimer le bracket dimanche ?")) return;
                  run("resetBracket", () => resetSplitSwissPhaseAction("BRACKET"));
                }}
              >
                {pending === "resetBracket" ? "…" : "↺ Supprimer bracket"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── BerlinMixedPlanning ─────────────────────────────────────────────────────

type BerlinTab = "groupes" | "vendredi" | "samedi" | "dimanche" | "brackets";

type BerlinTabDef = { value: BerlinTab; key: string };

const BERLIN_TABS: BerlinTabDef[] = [
  { value: "groupes",   key: "berlin_tab_groupes" },
  { value: "vendredi",  key: "berlin_tab_vendredi" },
  { value: "samedi",    key: "berlin_tab_samedi" },
  { value: "dimanche",  key: "berlin_tab_dimanche" },
  { value: "brackets",  key: "berlin_tab_brackets" },
];

function BerlinMixedPlanning({ tournament, teams, matches, updateBerlinTimesAction }: {
  tournament: any;
  teams: any[];
  matches: any[];
  updateBerlinTimesAction?: (a: string | null, b: string | null) => Promise<{ ok?: boolean; error?: string }>;
}) {
  const t = useTranslations("tournament");
  const [berlinTab, setBerlinTab] = useState<BerlinTab>("groupes");
  const [friATime, setFriATime] = useState(tournament.fridayGroupAStart ? utcIsoToLocalTime(tournament.fridayGroupAStart) : "09:00");
  const [friBTime, setFriBTime] = useState(tournament.fridayGroupBStart ? utcIsoToLocalTime(tournament.fridayGroupBStart) : "13:00");
  const [timesSaving, setTimesSaving] = useState(false);
  const [timesSaved, setTimesSaved] = useState(false);

  const toLocalDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const fridayDate = tournament.dateStart ? toLocalDate(tournament.dateStart) : new Date().toISOString().slice(0, 10);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Horaires vendredi */}
      {updateBerlinTimesAction && (
        <div className="panel" style={{ padding: "12px 16px", marginBottom: 8 }}>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 10 }}>
            ⏰ Horaires vendredi
          </p>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>Groupe A (matin)</span>
              <input type="time" value={friATime} onChange={(e) => setFriATime(e.target.value)} style={{ width: 110 }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>Groupe B (après-midi)</span>
              <input type="time" value={friBTime} onChange={(e) => setFriBTime(e.target.value)} style={{ width: 110 }} />
            </label>
            <button
              type="button"
              className="ghost"
              style={{ fontSize: 12, padding: "6px 14px" }}
              disabled={timesSaving}
              onClick={async () => {
                setTimesSaving(true);
                setTimesSaved(false);
                const toIso = (date: string, time: string) => new Date(`${date}T${time}:00`).toISOString();
                await updateBerlinTimesAction(toIso(fridayDate, friATime), toIso(fridayDate, friBTime));
                setTimesSaving(false);
                setTimesSaved(true);
                setTimeout(() => setTimesSaved(false), 2500);
              }}
            >
              {timesSaving ? "…" : timesSaved ? "✓" : t("orga_schedule_apply")}
            </button>
          </div>
        </div>
      )}
      {/* Onglets Berlin — mêmes classes CSS que les onglets de la page publique */}
      <div className="tabs-bar" style={{ marginTop: 0 }}>
        <div className="tabs">
          {BERLIN_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setBerlinTab(tab.value)}
              className={`tab${berlinTab === tab.value ? " active" : ""}`}
            >
              {t(tab.key as any)}
            </button>
          ))}
        </div>
      </div>

      {/* Contenu */}
      {berlinTab === "groupes" && (
        <div className="panel">
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 12 }}>
            {t("berlin_friday_ab_label")}
          </p>
          <FridayGroupAssignment
            tournamentId={tournament.id}
            teams={teams.map((t) => ({ id: t.id, name: t.name, seed: t.seed, fridayGroup: t.fridayGroup }))}
            isLocked={false}
          />
        </div>
      )}

      {berlinTab === "vendredi" && (
        <div className="panel">
          <BerlinMixedActions
            tournamentId={tournament.id}
            teams={teams}
            matches={matches}
            tournament={tournament}
            phase="vendredi"
          />
        </div>
      )}

      {berlinTab === "samedi" && (
        <div className="panel">
          <BerlinMixedActions
            tournamentId={tournament.id}
            teams={teams}
            matches={matches}
            tournament={tournament}
            phase="samedi"
          />
        </div>
      )}

      {berlinTab === "dimanche" && (
        <div className="panel">
          <BerlinMixedActions
            tournamentId={tournament.id}
            teams={teams}
            matches={matches}
            tournament={tournament}
            phase="dimanche"
          />
        </div>
      )}

      {berlinTab === "brackets" && (
        <div className="panel">
          <BerlinMixedActions
            tournamentId={tournament.id}
            teams={teams}
            matches={matches}
            tournament={tournament}
            phase="brackets"
          />
        </div>
      )}
    </div>
  );
}

// ─── MtpOpenPlanning ─────────────────────────────────────────────────────────

type MtpTab = "samedi" | "dimanche";

function utcIsoToLocalTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function MtpOpenPlanning({
  tournament,
  matches,
  launchMtpPoolAction,
  launchMtpNextRoundAction,
  launchMtpCrossPoolAction,
  launchMtpBarrageAction,
  launchMtpDEAction,
  resetMtpPhaseAction,
  updateMtpTimesAction,
}: {
  tournament: any;
  matches: any[];
  launchMtpPoolAction?: (pool: "A" | "B") => Promise<{ ok?: boolean; error?: string }>;
  launchMtpNextRoundAction?: (pool: "A" | "B") => Promise<{ ok?: boolean; error?: string }>;
  launchMtpCrossPoolAction?: () => Promise<{ ok?: boolean; error?: string }>;
  launchMtpBarrageAction?: () => Promise<{ ok?: boolean; error?: string }>;
  launchMtpDEAction?: () => Promise<{ ok?: boolean; error?: string }>;
  resetMtpPhaseAction?: (phase: "POOL_A" | "POOL_B" | "CROSS_POOL" | "BARRAGE" | "DE") => Promise<{ ok?: boolean; error?: string }>;
  updateMtpTimesAction?: (a: string | null, b: string | null, s: string | null) => Promise<{ ok?: boolean; error?: string }>;
}) {
  const t = useTranslations("tournament");
  const router = useRouter();
  const [tab, setTab] = useState<MtpTab>("samedi");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Live matches state — updated via SSE so auto-round detection works without page reload
  const [liveMatches, setLiveMatches] = useState<any[]>(matches);
  useEffect(() => { setLiveMatches(matches); }, [matches]);
  useEffect(() => {
    const es = new EventSource(`/api/sse?tournamentId=${tournament.id}`);
    es.addEventListener("match", (event) => {
      const payload = JSON.parse((event as MessageEvent).data);
      if (payload?.data?.match) {
        const updated = payload.data.match;
        setLiveMatches((prev) => {
          const exists = prev.some((m) => m.id === updated.id);
          if (exists) return prev.map((m) => m.id === updated.id ? { ...m, ...updated } : m);
          return [...prev, updated];
        });
      }
    });
    return () => es.close();
  }, [tournament.id]);

  // Horaires — use local date string to avoid UTC date shifting (e.g. 2025-05-10T00:00Z = May 9 in UTC+2)
  const toLocalDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const baseDate = tournament.dateStart ? toLocalDate(tournament.dateStart) : new Date().toISOString().slice(0, 10);
  const sundayDate = tournament.dateEnd ? toLocalDate(tournament.dateEnd) : baseDate;
  const [poolATime, setPoolATime] = useState(tournament.mtpPoolAStart ? utcIsoToLocalTime(tournament.mtpPoolAStart) : "09:00");
  const [poolBTime, setPoolBTime] = useState(tournament.mtpPoolBStart ? utcIsoToLocalTime(tournament.mtpPoolBStart) : "13:00");
  const [sundayTime, setSundayTime] = useState(tournament.mtpSundayStart ? utcIsoToLocalTime(tournament.mtpSundayStart) : "09:00");
  const [timesSaving, setTimesSaving] = useState(false);
  const [timesSaved, setTimesSaved] = useState(false);

  const poolAMatches = liveMatches.filter((m: any) => m.phase === "MTP_POOL_A");
  const poolBMatches = liveMatches.filter((m: any) => m.phase === "MTP_POOL_B");
  const crossMatches = liveMatches.filter((m: any) => m.phase === "CROSS_POOL");
  const barrageMatches = liveMatches.filter((m: any) => m.phase === "MTP_BARRAGE");
  const deMatches = liveMatches.filter((m: any) => m.phase === "MTP_DE");

  const swissRounds = tournament.swissRounds ?? 6;
  const poolAMaxRound = Math.max(0, ...poolAMatches.map((m: any) => m.roundIndex));
  const poolBMaxRound = Math.max(0, ...poolBMatches.map((m: any) => m.roundIndex));
  const poolACurrentRoundDone = poolAMatches.length > 0 && poolAMatches.filter((m: any) => m.roundIndex === poolAMaxRound).every((m: any) => m.status === "FINISHED");
  const poolBCurrentRoundDone = poolBMatches.length > 0 && poolBMatches.filter((m: any) => m.roundIndex === poolBMaxRound).every((m: any) => m.status === "FINISHED");

  // Auto-generate next Swiss round when current round finishes
  const autoLaunchingA = useRef(false);
  const autoLaunchingB = useRef(false);

  useEffect(() => {
    if (poolACurrentRoundDone && poolAMaxRound > 0 && poolAMaxRound < swissRounds && launchMtpNextRoundAction && !autoLaunchingA.current) {
      autoLaunchingA.current = true;
      run("NEXT_A", () => launchMtpNextRoundAction("A")).finally(() => {
        autoLaunchingA.current = false;
        router.refresh();
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolACurrentRoundDone, poolAMaxRound]);

  useEffect(() => {
    if (poolBCurrentRoundDone && poolBMaxRound > 0 && poolBMaxRound < swissRounds && launchMtpNextRoundAction && !autoLaunchingB.current) {
      autoLaunchingB.current = true;
      run("NEXT_B", () => launchMtpNextRoundAction("B")).finally(() => {
        autoLaunchingB.current = false;
        router.refresh();
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolBCurrentRoundDone, poolBMaxRound]);

  const done = (arr: any[]) => arr.length > 0 && arr.every((m: any) => m.status === "FINISHED");
  const matchCount = (arr: any[]) => ({ done: arr.filter((m: any) => m.status === "FINISHED").length, total: arr.length });

  function StatusLine({ arr }: { arr: any[] }) {
    const { done: d, total } = matchCount(arr);
    if (total === 0) return <p className="meta">{t("orga_matches_not_generated")}</p>;
    return (
      <p style={{ fontSize: 13, margin: 0, color: d === total ? "var(--teal)" : "var(--text)" }}>
        {t("orga_matches_finished_count", { done: d, total })}{d === total ? " ✓" : ""}
      </p>
    );
  }

  async function run(key: string, fn: () => Promise<{ ok?: boolean; error?: string }>) {
    setPending(key);
    setError(null);
    const res = await fn();
    if (res?.error) setError(res.error);
    setPending(null);
  }

  const poolADone = poolAMatches.length > 0 && poolAMaxRound >= swissRounds && poolACurrentRoundDone;
  const poolBDone = poolBMatches.length > 0 && poolBMaxRound >= swissRounds && poolBCurrentRoundDone;
  const crossDone = done(crossMatches);
  const barrageDone = done(barrageMatches);
  const bothPoolsDone = poolADone && poolBDone;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {/* Horaires de début */}
      {updateMtpTimesAction && (
        <div className="panel" style={{ padding: "12px 16px" }}>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 10 }}>
            ⏰ {t("mtp_start_times_label" as any)}
          </p>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>{t("mtp_pool_a_start" as any)}</span>
              <input type="time" value={poolATime} onChange={(e) => setPoolATime(e.target.value)} style={{ width: 110 }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>{t("mtp_pool_b_start" as any)}</span>
              <input type="time" value={poolBTime} onChange={(e) => setPoolBTime(e.target.value)} style={{ width: 110 }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>{t("mtp_sunday_start" as any)}</span>
              <input type="time" value={sundayTime} onChange={(e) => setSundayTime(e.target.value)} style={{ width: 110 }} />
            </label>
            <button
              type="button"
              className="ghost"
              style={{ fontSize: 12, padding: "6px 14px" }}
              disabled={timesSaving}
              onClick={async () => {
                setTimesSaving(true);
                setTimesSaved(false);
                const toIso = (date: string, time: string) => new Date(`${date}T${time}:00`).toISOString();
                await updateMtpTimesAction(toIso(baseDate, poolATime), toIso(baseDate, poolBTime), toIso(sundayDate, sundayTime));
                setTimesSaving(false);
                setTimesSaved(true);
                setTimeout(() => setTimesSaved(false), 2500);
              }}
            >
              {timesSaving ? "…" : timesSaved ? "✓" : t("orga_schedule_apply")}
            </button>
          </div>
        </div>
      )}

      <div style={{ gap: 0 }}>
      <div className="tabs-bar" style={{ marginTop: 0 }}>
        <div className="tabs">
          {(["samedi", "dimanche"] as MtpTab[]).map((v) => (
            <button key={v} type="button" onClick={() => setTab(v)} className={`tab${tab === v ? " active" : ""}`}>
              {v === "samedi" ? t("orga_day1_label") : t("orga_day2_label")}
            </button>
          ))}
        </div>
      </div>

      {error && <p style={{ color: "var(--danger)", fontSize: 12, padding: "8px 0" }}>{error}</p>}

      {tab === "samedi" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Pool A — matin */}
          <div className="panel">
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 8 }}>
              {t("mtp_pool_a_label" as any)}
            </p>
            <StatusLine arr={poolAMatches} />
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              {poolAMatches.length === 0 && launchMtpPoolAction && (
                <button className="primary" style={{ fontSize: 13 }} disabled={pending === "POOL_A"}
                  onClick={() => run("POOL_A", () => launchMtpPoolAction("A"))}>
                  {pending === "POOL_A" ? "..." : t("mtp_launch_pool_a" as any)}
                </button>
              )}
              {poolACurrentRoundDone && poolAMaxRound < swissRounds && launchMtpNextRoundAction && (
                <button className="primary" style={{ fontSize: 13 }} disabled={pending === "NEXT_A"}
                  onClick={() => run("NEXT_A", () => launchMtpNextRoundAction("A"))}>
                  {pending === "NEXT_A" ? "..." : t("mtp_launch_next_round" as any, { round: poolAMaxRound + 1, total: swissRounds })}
                </button>
              )}
              {poolAMatches.length > 0 && resetMtpPhaseAction && (
                <button className="ghost" style={{ fontSize: 12, color: "var(--danger)" }} disabled={pending === "RESET_POOL_A"}
                  onClick={async () => {
                    if (!window.confirm(t("mtp_reset_confirm_pool_a" as any))) return;
                    run("RESET_POOL_A", () => resetMtpPhaseAction("POOL_A"));
                  }}>
                  {pending === "RESET_POOL_A" ? "..." : "↺ Reset"}
                </button>
              )}
            </div>
          </div>

          {/* Pool B — après-midi */}
          <div className="panel">
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 8 }}>
              {t("mtp_pool_b_label" as any)}
            </p>
            <StatusLine arr={poolBMatches} />
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              {poolAMatches.length > 0 && poolBMatches.length === 0 && launchMtpPoolAction && (
                <button className="primary" style={{ fontSize: 13 }} disabled={pending === "POOL_B"}
                  onClick={() => run("POOL_B", () => launchMtpPoolAction("B"))}>
                  {pending === "POOL_B" ? "..." : t("mtp_launch_pool_b" as any)}
                </button>
              )}
              {poolBCurrentRoundDone && poolBMaxRound < swissRounds && launchMtpNextRoundAction && (
                <button className="primary" style={{ fontSize: 13 }} disabled={pending === "NEXT_B"}
                  onClick={() => run("NEXT_B", () => launchMtpNextRoundAction("B"))}>
                  {pending === "NEXT_B" ? "..." : t("mtp_launch_next_round" as any, { round: poolBMaxRound + 1, total: swissRounds })}
                </button>
              )}
              {poolBMatches.length > 0 && resetMtpPhaseAction && (
                <button className="ghost" style={{ fontSize: 12, color: "var(--danger)" }} disabled={pending === "RESET_POOL_B"}
                  onClick={async () => {
                    if (!window.confirm(t("mtp_reset_confirm_pool_b" as any))) return;
                    run("RESET_POOL_B", () => resetMtpPhaseAction("POOL_B"));
                  }}>
                  {pending === "RESET_POOL_B" ? "..." : "↺ Reset"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "dimanche" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Cross-pool */}
          <div className="panel">
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 8 }}>
              {t("mtp_cross_label" as any)}
            </p>
            <StatusLine arr={crossMatches} />
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              {crossMatches.length === 0 && bothPoolsDone && launchMtpCrossPoolAction && (
                <button className="primary" style={{ fontSize: 13 }} disabled={pending === "CROSS"}
                  onClick={() => run("CROSS", launchMtpCrossPoolAction!)}>
                  {pending === "CROSS" ? "..." : t("mtp_launch_cross" as any)}
                </button>
              )}
              {crossMatches.length > 0 && resetMtpPhaseAction && (
                <button className="ghost" style={{ fontSize: 12, color: "var(--danger)" }} disabled={pending === "RESET_CROSS"}
                  onClick={async () => {
                    if (!window.confirm(t("mtp_reset_confirm_cross" as any))) return;
                    run("RESET_CROSS", () => resetMtpPhaseAction("CROSS_POOL"));
                  }}>
                  {pending === "RESET_CROSS" ? "..." : "↺ Reset"}
                </button>
              )}
            </div>
          </div>

          {/* Barrage SE ×4 */}
          <div className="panel">
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 8 }}>
              {t("mtp_barrage_label" as any)}
            </p>
            <StatusLine arr={barrageMatches} />
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              {barrageMatches.length === 0 && crossDone && launchMtpBarrageAction && (
                <button className="primary" style={{ fontSize: 13 }} disabled={pending === "BARRAGE"}
                  onClick={() => run("BARRAGE", launchMtpBarrageAction!)}>
                  {pending === "BARRAGE" ? "..." : t("mtp_launch_barrage" as any)}
                </button>
              )}
              {barrageMatches.length > 0 && resetMtpPhaseAction && (
                <button className="ghost" style={{ fontSize: 12, color: "var(--danger)" }} disabled={pending === "RESET_BARRAGE"}
                  onClick={async () => {
                    if (!window.confirm(t("mtp_reset_confirm_barrage" as any))) return;
                    run("RESET_BARRAGE", () => resetMtpPhaseAction("BARRAGE"));
                  }}>
                  {pending === "RESET_BARRAGE" ? "..." : "↺ Reset"}
                </button>
              )}
            </div>
          </div>

          {/* DE ×16 */}
          <div className="panel">
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 8 }}>
              {t("mtp_de_label" as any)}
            </p>
            <StatusLine arr={deMatches} />
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              {deMatches.length === 0 && barrageDone && launchMtpDEAction && (
                <button className="primary" style={{ fontSize: 13 }} disabled={pending === "DE"}
                  onClick={() => run("DE", launchMtpDEAction!)}>
                  {pending === "DE" ? "..." : t("mtp_launch_de" as any)}
                </button>
              )}
              {deMatches.length > 0 && resetMtpPhaseAction && (
                <button className="ghost" style={{ fontSize: 12, color: "var(--danger)" }} disabled={pending === "RESET_DE"}
                  onClick={async () => {
                    if (!window.confirm(t("mtp_reset_confirm_de" as any))) return;
                    run("RESET_DE", () => resetMtpPhaseAction("DE"));
                  }}>
                  {pending === "RESET_DE" ? "..." : "↺ Reset"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

// ─── Types ───────────────────────────────────────────────────────────────────

type OrgaDashboardProps = {
  tournament: any;
  teams: any[];
  freeAgents: any[];
  pools: any[];
  matches: any[];
  sponsors: any[];
  coOrganizers: any[];
  // Derived flags
  isCreator: boolean;
  isAdmin: boolean;
  isOrgaForThis: boolean;
  // Server actions (passed as props from Server Component)
  updateAction: (formData: FormData) => Promise<{ ok?: boolean; error?: unknown }>;
  toggleLockAction: (id: string, confirmReset?: boolean) => Promise<{ ok?: boolean; locked?: boolean; confirm?: boolean; message?: string; error?: string }>;
  importAction: (formData: FormData) => Promise<void>;
  addSponsorAction: (...args: any[]) => Promise<any>;
  deleteSponsorAction: (...args: any[]) => Promise<any>;
  deleteFreeAgentAction: (...args: any[]) => Promise<any>;
  renameTeamAction: (...args: any[]) => Promise<any>;
  deleteTeamAction: (...args: any[]) => Promise<any>;
  removePlayerAction: (...args: any[]) => Promise<any>;
  addPlayerAction: (...args: any[]) => Promise<any>;
  launchAction: (formData: FormData) => Promise<void>;
  resetAction: (formData: FormData) => Promise<void>;
  resetMatchesAction: (formData: FormData) => Promise<void>;
  launchPoolBAction?: () => Promise<{ ok?: boolean; error?: string }>;
  launchGrazPoolBAction?: () => Promise<{ ok?: boolean; error?: string }>;
  launchGrazSundayRRAction?: () => Promise<{ ok?: boolean; error?: string }>;
  launchGrazRegroupAction?: () => Promise<{ ok?: boolean; error?: string }>;
  launchGrazSEAction?: () => Promise<{ ok?: boolean; error?: string }>;
  resetGrazPhaseAction?: (phase: "SUNDAY_RR" | "REGROUP" | "SE") => Promise<{ ok?: boolean; error?: string }>;
  launchMtpPoolAction?: (pool: "A" | "B") => Promise<{ ok?: boolean; error?: string }>;
  launchMtpNextRoundAction?: (pool: "A" | "B") => Promise<{ ok?: boolean; error?: string }>;
  launchMtpCrossPoolAction?: () => Promise<{ ok?: boolean; error?: string }>;
  launchMtpBarrageAction?: () => Promise<{ ok?: boolean; error?: string }>;
  launchMtpDEAction?: () => Promise<{ ok?: boolean; error?: string }>;
  resetMtpPhaseAction?: (phase: "POOL_A" | "POOL_B" | "CROSS_POOL" | "BARRAGE" | "DE") => Promise<{ ok?: boolean; error?: string }>;
  updateMtpTimesAction?: (a: string | null, b: string | null, s: string | null) => Promise<{ ok?: boolean; error?: string }>;
  updateBerlinTimesAction?: (a: string | null, b: string | null) => Promise<{ ok?: boolean; error?: string }>;
  generateSplitSwissRoundAction?: (group: "A" | "B") => Promise<{ ok?: boolean; round?: number; error?: string }>;
  saveSplitSwissGroupsAction?: (groupA: string[], groupB: string[]) => Promise<{ ok?: boolean; error?: string }>;
  generateSplitSwissBracketAction?: () => Promise<{ ok?: boolean; error?: string }>;
  resetSplitSwissPhaseAction?: (phase: "SWISS_A" | "SWISS_B" | "BRACKET") => Promise<{ ok?: boolean; error?: string }>;
  launchKiosqueRegroupAction?: () => Promise<{ ok?: boolean; error?: string }>;
  launchKiosquePoolRoundAction?: (poolName: "Pool A" | "Pool B") => Promise<{ ok?: boolean; error?: string }>;
  launchKiosqueNextRoundAction?: (group: "Top 4" | "Bottom 12") => Promise<{ ok?: boolean; error?: string }>;
  launchKiosqueSEAction?: () => Promise<{ ok?: boolean; error?: string }>;
  resetKiosquePhaseAction?: (phase: "REGROUP" | "SE") => Promise<{ ok?: boolean; error?: string }>;
  resetKiosqueJ1Action?: () => Promise<{ ok?: boolean; error?: string }>;
  launchBigAppleSwissRoundAction?: () => Promise<{ ok?: boolean; error?: string }>;
  launchBigApplePlacementAction?: () => Promise<{ ok?: boolean; error?: string }>;
  launchBigAppleSEAction?: () => Promise<{ ok?: boolean; error?: string }>;
  resetBigApplePhaseAction?: (phase: "SWISS" | "PLACEMENT" | "SE") => Promise<{ ok?: boolean; error?: string }>;
  launchStageAction?: (order: number) => Promise<{ ok?: boolean; error?: string }>;
  resetStagesAction?: (fromOrder: number) => Promise<{ ok?: boolean; error?: string }>;
  simulateStageAction?: () => Promise<{ ok?: boolean; error?: string }>;
  previewEntriesAction?: (order: number) => Promise<{ entries?: Array<{ teamId: string; name: string; groupKey: string; slot: number }>; groups?: number; error?: string }>;
  setManualGroupsAction?: (order: number, assignments: Record<string, string>) => Promise<{ ok?: boolean; error?: string }>;
  updatePipelineStageAction?: (order: number, patch: { name: string; type: string; config: Record<string, unknown>; entryRules: unknown; startAt: string | null }) => Promise<{ ok?: boolean; error?: string }>;
  launchPipelineGroupAction?: (order: number) => Promise<{ ok?: boolean; error?: string; group?: string }>;
  addPipelineStageAction?: (def: { name: string; type: string; config: Record<string, unknown>; entryRules: unknown }) => Promise<{ ok?: boolean; error?: string }>;
  removePipelineStageAction?: (order: number) => Promise<{ ok?: boolean; error?: string }>;
  movePipelineStageAction?: (order: number, dir: -1 | 1) => Promise<{ ok?: boolean; error?: string }>;
  resetPipelineToRoundAction?: (order: number, round: number, group?: string) => Promise<{ ok?: boolean; error?: string }>;
  reschedulePipelineStageAction?: (order: number) => Promise<{ ok?: boolean; error?: string }>;
  setTournamentPipelineAction?: (stages: unknown) => Promise<{ ok?: boolean; error?: string }>;
  applyPipelinePresetAction?: (presetKey: string) => Promise<{ ok?: boolean; error?: string }>;
  // Orga tab data
  orgaTasks: Array<{ id: string; title: string; description: string | null; deadline: string | null; completed: boolean; priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT"; assignees: Array<{ player: { id: string; name: string } }>; createdBy: { id: string; name: string }; createdAt: string }>;
  orgaNotes: Array<{ id: string; content: string; author: { id: string; name: string }; createdAt: string; updatedAt: string }>;
  orgaLinks: Array<{ id: string; label: string; url: string; addedBy: { id: string; name: string }; createdAt: string }>;
  currentPlayerId: string;
  toggleTeamSelectedAction: (teamId: string, tId: string, selected: boolean) => Promise<any>;
  drawTeamsAction: (tId: string, count: number, preDrawnIds?: string[]) => Promise<any>;
  guaranteeTeamAction: (teamId: string, tId: string, guaranteed: boolean) => Promise<any>;
  drawOneTeamAction: (tId: string, candidateIds: string[]) => Promise<any>;
  drawOneWaitlistAction: (tId: string, candidateIds: string[]) => Promise<any>;
  removeFromWaitlistAction: (tId: string, teamId: string) => Promise<any>;
  toggleSelectionLockAction: (tId: string, locked: boolean) => Promise<{ ok?: boolean; error?: string }>;
  createTeamAction: (...args: any[]) => Promise<any>;
  updatePoolRoundsAction?: (tId: string, poolRounds: number | null) => Promise<{ ok?: boolean; error?: string }>;
  generateRefTokenAction?: () => Promise<{ ok?: boolean; token?: string; error?: string }>;
  revokeRefTokenAction?: () => Promise<{ ok?: boolean; error?: string }>;
  accommodationHosts?: Array<{
    id: string; playerId: string | null; name: string; contact: string | null; notes: string | null;
    player: { id: string; name: string; photoPath: string | null } | null;
    guests: Array<{ id: string; notes: string | null; teamPlayer: { id: string; player: { id: string; name: string; photoPath: string | null }; team: { id: string; name: string } } }>;
  }>;
};

type Tab = "teams" | "config" | "planning" | "stages" | "orga" | "hebergement";

// ─── Tab label helper ─────────────────────────────────────────────────────────

const TAB_KEYS: Record<Tab, string> = {
  stages:       "orga_tab_format_stages",
  planning:     "orga_tab_planning",
  teams:        "orga_tab_teams",
  orga:         "orga_tab_orga",
  config:       "orga_tab_config",
  hebergement:  "orga_tab_hebergement",
};

// ─── Main component ───────────────────────────────────────────────────────────

export function OrgaDashboard({
  tournament,
  teams,
  freeAgents,
  pools,
  matches,
  sponsors,
  coOrganizers,
  isCreator,
  isAdmin,
  isOrgaForThis,
  updateAction,
  toggleLockAction,
  importAction,
  addSponsorAction,
  deleteSponsorAction,
  deleteFreeAgentAction,
  renameTeamAction,
  deleteTeamAction,
  removePlayerAction,
  addPlayerAction,
  launchAction,
  resetAction,
  resetMatchesAction,
  launchPoolBAction,
  launchGrazPoolBAction,
  launchGrazSundayRRAction,
  launchGrazRegroupAction,
  launchGrazSEAction,
  resetGrazPhaseAction,
  launchMtpPoolAction,
  launchMtpNextRoundAction,
  launchMtpCrossPoolAction,
  launchMtpBarrageAction,
  launchMtpDEAction,
  resetMtpPhaseAction,
  updateMtpTimesAction,
  updateBerlinTimesAction,
  generateSplitSwissRoundAction,
  saveSplitSwissGroupsAction,
  generateSplitSwissBracketAction,
  resetSplitSwissPhaseAction,
  launchKiosquePoolRoundAction,
  launchKiosqueRegroupAction,
  launchKiosqueNextRoundAction,
  launchKiosqueSEAction,
  resetKiosquePhaseAction,
  resetKiosqueJ1Action,
  launchBigAppleSwissRoundAction,
  launchBigApplePlacementAction,
  launchBigAppleSEAction,
  resetBigApplePhaseAction,
  launchStageAction,
  resetStagesAction,
  simulateStageAction,
  previewEntriesAction,
  setManualGroupsAction,
  updatePipelineStageAction,
  launchPipelineGroupAction,
  addPipelineStageAction,
  removePipelineStageAction,
  movePipelineStageAction,
  resetPipelineToRoundAction,
  reschedulePipelineStageAction,
  setTournamentPipelineAction,
  applyPipelinePresetAction,
  orgaTasks,
  orgaNotes,
  orgaLinks,
  currentPlayerId,
  toggleTeamSelectedAction,
  drawTeamsAction,
  guaranteeTeamAction,
  drawOneTeamAction,
  drawOneWaitlistAction,
  removeFromWaitlistAction,
  toggleSelectionLockAction,
  createTeamAction,
  updatePoolRoundsAction,
  generateRefTokenAction,
  revokeRefTokenAction,
  accommodationHosts = [],
}: OrgaDashboardProps) {
  const t = useTranslations("tournament");

  const tabStorageKey = `orga_tab_${tournament.id}`;
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const pipeline = !!(tournament as any)?.usesPipeline;
    // Un legacy sans match joué est CONVERTIBLE vers pipeline : sa barre d'onglets
    // remplace "planning" par "stages" (là où se trouve la bascule). Sans ce cas,
    // l'onglet actif par défaut ("planning") n'existait pas dans la barre → l'orga
    // ne voyait pas comment switcher de système de format.
    const convertible = !pipeline && !matches.some((m: any) => m.status === "FINISHED");
    const showsStages = pipeline || convertible;
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(tabStorageKey);
      // "planning" n'existe pas quand la barre montre "stages"
      if (showsStages && saved === "planning") return "stages";
      // "orgateam" a fusionné dans "orga"
      if (saved === "orgateam") return "orga";
      if (saved === "teams" || saved === "config" || saved === "planning" || saved === "stages" || saved === "orga" || saved === "hebergement") return saved;
    }
    // Pipeline (ou legacy convertible) : le pilotage / la bascule se fait dans
    // l'onglet Étapes — c'est l'écran utile.
    return showsStages ? "stages" : "planning";
  });

  useEffect(() => {
    localStorage.setItem(tabStorageKey, activeTab);
  }, [activeTab, tabStorageKey]);

  const [pendingPoolB, setPendingPoolB] = useState(false);
  const [poolBError, setPoolBError] = useState<string | null>(null);
  async function handleLaunchPoolB() {
    if (!launchPoolBAction) return;
    setPendingPoolB(true);
    setPoolBError(null);
    const res = await launchPoolBAction();
    setPendingPoolB(false);
    if (res.error) setPoolBError(res.error);
  }

  // Derived match state
  const poolMatches = matches.filter((m) => m.phase === "POOL" || m.phase === "SWISS");
  const poolMatchesFinished = poolMatches.length > 0 && poolMatches.every((m) => m.status === "FINISHED");
  const crossPoolMatches = matches.filter((m) => m.phase === "CROSS_POOL");
  const crossPoolGenerated = crossPoolMatches.length > 0;
  const crossPoolFinished = crossPoolGenerated && crossPoolMatches.every((m) => m.status === "FINISHED");
  const bracketMatches = matches.filter((m) => m.phase === "BRACKET");
  const seGenerated = bracketMatches.length > 0;
  const seRound1 = bracketMatches.filter((m) => m.roundIndex === 1);
  const seRound1Finished = seRound1.length > 0 && seRound1.every((m) => m.status === "FINISHED");
  const deGenerated = bracketMatches.some((m: any) => m.bracketSide === "L");
  const hasAnyMatches = matches.length > 0;
  const hasBracketMatches = bracketMatches.length > 0;
  const isMtpOpen = (tournament as any).saturdayFormat === "MTP_OPEN";
  const isKiosque = (tournament as any).saturdayFormat === "KIOSQUE";
  const isBerlinMixed = tournament.saturdayFormat === "BERLIN_MIXED";
  const isSplitSwiss = (tournament as any).saturdayFormat === "SPLIT_SWISS";
  const isBigApple = (tournament as any).saturdayFormat === "BIG_APPLE";
  const isPipeline = !!(tournament as any).usesPipeline;
  const canLaunch = (tournament.status === "UPCOMING" || (tournament.status === "LIVE" && matches.length === 0 && !isMtpOpen && !isKiosque && !isBerlinMixed && !isSplitSwiss)) && teams.some((t) => t.selected === true) && !isPipeline;
  const isLive = tournament.status === "LIVE";

  // Pool rounds control
  const maxPoolRound = Math.max(0, ...poolMatches.map((m) => m.roundIndex));
  const [localPoolRounds, setLocalPoolRounds] = useState<string>(
    tournament.poolRounds != null ? String(tournament.poolRounds) : maxPoolRound > 0 ? String(maxPoolRound) : ""
  );
  const [poolRoundsSaving, setPoolRoundsSaving] = useState(false);

  // All bracket matches finished → show "mark as completed" button
  const allBracketFinished = bracketMatches.length > 0 && bracketMatches.every((m) => m.status === "FINISHED");
  const [completePending, setCompletePending] = useState(false);
  const [completeDone, setCompleteDone] = useState(false);

  const handleMarkCompleted = async () => {
    setCompletePending(true);
    try {
      const res = await fetch(`/api/tournaments/${tournament.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED" }),
      });
      if (res.ok) {
        setCompleteDone(true);
        setTimeout(() => window.location.reload(), 800);
      }
    } finally {
      setCompletePending(false);
    }
  };

  // KPIs
  // Dès qu'un tri a été fait (une équipe écartée/waitlist), le KPI compte les
  // équipes IN — sans attendre le lancement (26 inscrites, 16 retenues → 16/16).
  const selectionMade = teams.some((t) => t.selected === false);
  const selectedTeams = (isLive || tournament.status === "COMPLETED" || selectionMade) && teams.filter((t) => t.selected !== false).length > 0
    ? teams.filter((t) => t.selected !== false).length
    : teams.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {/* ── Prochaine action (cockpit contextuel) ── */}
      <NextActionCard
        tournament={tournament as any}
        matches={matches as any}
        isPipeline={isPipeline}
        onGoToFlow={() => setActiveTab(isPipeline ? "stages" : "planning")}
        onComplete={handleMarkCompleted}
        completePending={completePending}
        completeDone={completeDone}
        canComplete={isLive}
      />

      {/* ── KPI bar (compacte, sur une ligne) ── */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16, fontSize: 13, color: "var(--text-muted)", alignItems: "center" }}>
        <span className={`status ${tournament.status.toLowerCase()}`}>{tournament.status}</span>
        <span><strong style={{ color: "var(--text)" }}>{selectedTeams}</strong>/{tournament.maxTeams} {t("edit_kpi_teams")}</span>
        <span>·</span>
        <span><strong style={{ color: "var(--text)" }}>{teams.reduce((acc, t) => acc + t.players.length, 0)}</strong> {t("edit_kpi_players")}</span>
        {freeAgents.length > 0 && (<><span>·</span><span><strong style={{ color: "var(--text)" }}>{freeAgents.length}</strong> {t("edit_kpi_free_agents")}</span></>)}
        <span>·</span>
        <span><strong style={{ color: "var(--text)" }}>{tournament.courtsCount ?? 1}</strong> {t("edit_kpi_courts")}</span>
      </div>

      {/* ── Overlay + QR (repliés pour désencombrer) ── */}
      {(isLive || tournament.status === "UPCOMING") && (
        <details className="panel" style={{ padding: "12px 16px", marginBottom: 16 }}>
          <summary style={{ fontWeight: 700, fontSize: 14, cursor: "pointer" }}>📱 {t("qr_title")} · 🎬 {t("overlay_title")}</summary>
          <p className="meta" style={{ margin: "8px 0 12px" }}>{t("qr_desc")}</p>

          {/* Liens overlay par terrain */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {Array.from({ length: tournament.courtsCount ?? 1 }, (_, i) => {
              const url = `${typeof window !== "undefined" ? window.location.origin : ""}/fr/tournament/${tournament.slug || tournament.id}/overlay?court=${i + 1}&theme=dark`;
              return (
                <button key={i} type="button" className="btn btn--sm btn--ghost"
                  onClick={() => navigator.clipboard.writeText(url)} style={{ fontSize: 12 }}>
                  🎬 Court {i + 1}
                </button>
              );
            })}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
            {/* Public tournament QR */}
            <div style={{ textAlign: "center" }}>
              <QRCodeSVG
                value={`${typeof window !== "undefined" ? window.location.origin : ""}/fr/tournament/${tournament.slug || tournament.id}`}
                size={140}
                level="M"
              />
              <p style={{ fontSize: 12, fontWeight: 600, marginTop: 6 }}>{t("qr_public")}</p>
            </div>
            {/* Per-court referee QRs */}
            {Array.from({ length: tournament.courtsCount ?? 1 }, (_, i) => (
              <div key={i} style={{ textAlign: "center" }}>
                <QRCodeSVG
                  value={`${typeof window !== "undefined" ? window.location.origin : ""}/fr/tournament/${tournament.slug || tournament.id}/referee${tournament.refToken ? `?token=${tournament.refToken}` : ""}${tournament.refToken ? `&court=Court ${i + 1}` : `?court=Court ${i + 1}`}`}
                  size={140}
                  level="M"
                />
                <p style={{ fontSize: 12, fontWeight: 600, marginTop: 6 }}>{t("qr_referee_court", { court: i + 1 })}</p>
                {!tournament.refToken && <p style={{ fontSize: 10, color: "var(--danger)", marginTop: 2 }}>Sans token — connexion requise</p>}
              </div>
            ))}
          </div>
          <button
            type="button"
            className="ghost"
            style={{ marginTop: 12, fontSize: 12 }}
            onClick={() => {
              const el = document.createElement("div");
              el.innerHTML = document.querySelector(".panel details[open] .qr-print-area")?.innerHTML ?? "";
              const w = window.open("", "_blank");
              if (w) {
                w.document.write(`<html><head><title>QR Codes - ${tournament.name}</title><style>body{font-family:sans-serif;display:flex;flex-wrap:wrap;gap:32px;padding:24px;justify-content:center}div{text-align:center}svg{display:block;margin:0 auto}p{margin:6px 0 0;font-weight:600;font-size:14px}</style></head><body>`);
                // Re-render QR codes for print
                const origin = window.location.origin;
                const slug = tournament.slug || tournament.id;
                // Public QR
                w.document.write(`<div><p>${t("qr_public")}</p><p style="font-size:11px;color:#666">${origin}/fr/tournament/${slug}</p></div>`);
                for (let c = 0; c < (tournament.courtsCount ?? 1); c++) {
                  w.document.write(`<div><p>${t("qr_referee_court", { court: c + 1 })}</p><p style="font-size:11px;color:#666">${origin}/fr/tournament/${slug}/referee?court=Court ${c + 1}</p></div>`);
                }
                w.document.write("</body></html>");
                w.document.close();
                // Copy SVGs into print window
                const svgs = document.querySelectorAll("details[open] svg");
                const printDivs = w.document.querySelectorAll("div");
                svgs.forEach((svg, idx) => {
                  if (printDivs[idx]) {
                    const clone = svg.cloneNode(true) as SVGElement;
                    clone.setAttribute("width", "200");
                    clone.setAttribute("height", "200");
                    printDivs[idx].insertBefore(clone, printDivs[idx].firstChild);
                  }
                });
                setTimeout(() => w.print(), 300);
              }
            }}
          >
            🖨 {t("qr_print")}
          </button>
        </details>
      )}

      {/* ── Tab bar ── */}
      <div className="tabs-bar" style={{ marginTop: 0 }}>
        <div className="tabs">
          {((() => {
            const played = matches.some((m) => m.status === "FINISHED");
            const acc = tournament.accommodationAvailable ? ["hebergement"] : [];
            // Pipeline (ou legacy vide convertible) : onglet unifié "Format & étapes".
            const canPipeline = !!setTournamentPipelineAction && (isPipeline || !played);
            if (isPipeline || canPipeline) return ["stages", "teams", "orga", "config", ...acc] as Tab[];
            return ["planning", "teams", "orga", "config", ...acc] as Tab[];
          })()).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`tab${activeTab === tab ? " active" : ""}`}
            >
              {t(TAB_KEYS[tab] as any)}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab: Config ── */}
      {activeTab === "config" && (
        <>
          <TournamentEditForm
            tournament={tournament}
            action={updateAction}
            toggleLockAction={toggleLockAction}
          />
        </>
      )}

      {/* ── Tab: Équipes ── (inscrits + sélection/tirage/waitlist regroupés) */}
      {activeTab === "teams" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Sélection / Tirage au sort — au-dessus de la liste, c'est l'étape amont */}
          {tournament.format === "ABC Chapeau" ? (() => {
            const soloEntries = (tournament as any).soloEntries ?? [];
            const abcTeams = teams.map((t) => ({ id: t.id, name: t.name }));
            return (
              <DrawPanel
                tournamentId={tournament.id}
                soloEntries={soloEntries}
                teams={abcTeams}
                feePerPlayer={tournament.registrationFeePerTeam ?? 0}
                feeCurrency={tournament.registrationFeeCurrency ?? "EUR"}
              />
            );
          })() : (teams.length > 0 && (
            <div className="panel">
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: 16, marginBottom: 12 }}>{t("orga_selection_title")}</h3>
              <SelectionManager
                teams={teams.map((t) => ({
                  id: t.id, name: t.name, seed: t.seed, city: t.city, country: t.country,
                  selected: t.selected, guaranteed: t.guaranteed, waitlistPosition: t.waitlistPosition,
                }))}
                maxTeams={tournament.maxTeams}
                tournamentId={tournament.id}
                selectionLocked={(tournament as any).selectionLocked ?? false}
                registrationEnd={(tournament as any).registrationEnd ? new Date((tournament as any).registrationEnd).toISOString() : null}
                toggleAction={toggleTeamSelectedAction}
                drawAction={drawTeamsAction}
                guaranteeAction={guaranteeTeamAction}
                drawOneAction={drawOneTeamAction}
                drawOneWaitlistAction={drawOneWaitlistAction}
                removeFromWaitlistAction={removeFromWaitlistAction}
                toggleLockAction={toggleSelectionLockAction}
              />
            </div>
          ))}

          <UnifiedTeamManager
            tournamentId={tournament.id}
            teams={teams}
            locked={tournament.locked}
            selectionLocked={(tournament as any).selectionLocked ?? false}
            format={tournament.format}
            showPayment={true}
            showRecap={true}
            feePerTeam={tournament.registrationFeePerTeam ?? 0}
            feeCurrency={tournament.registrationFeeCurrency ?? "EUR"}
            maxTeams={tournament.maxTeams}
            renameAction={renameTeamAction}
            deleteTeamAction={deleteTeamAction}
            removePlayerAction={removePlayerAction}
            addPlayerAction={addPlayerAction}
            createTeamAction={createTeamAction}
          />

          {freeAgents.length > 0 && (
            <div className="panel">
              <h3 style={{ marginBottom: 12 }}>{t("edit_free_agents_title", { count: freeAgents.length })}</h3>
              <FreeAgentList
                agents={freeAgents}
                canDelete
                deleteAction={deleteFreeAgentAction}
                title=""
              />
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Étapes (pipeline — pilotage du format) ── */}
      {/* ── Tab: Format & étapes (unifié) ── */}
      {activeTab === "stages" && (() => {
        const stages = (tournament as any).stages ?? [];
        // Un format existe déjà dès qu'au moins une étape est définie : dans ce
        // cas le composer se replie (la timeline ci-dessous devient l'écran
        // principal). Il ne reste déplié en grand que pour la 1re configuration.
        const hasFormat = stages.length > 0;
        const canFormat = !!setTournamentPipelineAction && !!applyPipelinePresetAction;
        // Le format reste modifiable tant qu'aucun match n'est joué.
        const canEditFormat = canFormat && !matches.some((m) => m.status === "FINISHED");
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Composer de format : déplié pour la 1re config, replié ensuite */}
            {canEditFormat && (
              hasFormat ? (
                <details className="panel" style={{ padding: "12px 16px" }}>
                  <summary style={{ fontWeight: 700, fontSize: 14, cursor: "pointer" }}>🎛 {t("format_edit_summary")}</summary>
                  <div style={{ marginTop: 12 }}>
                    <TournamentFormatTab
                      tournamentId={tournament.id}
                      courtsCount={tournament.courtsCount ?? 2}
                      hasPlayedMatches={false}
                      currentStages={stages.map((s: any) => ({ name: s.name, type: s.type, config: s.config, entryRules: s.entryRules }))}
                      applyPresetAction={applyPipelinePresetAction!}
                      setPipelineAction={setTournamentPipelineAction!}
                    />
                  </div>
                </details>
              ) : (
                <TournamentFormatTab
                  tournamentId={tournament.id}
                  courtsCount={tournament.courtsCount ?? 2}
                  hasPlayedMatches={false}
                  currentStages={stages.map((s: any) => ({ name: s.name, type: s.type, config: s.config, entryRules: s.entryRules }))}
                  applyPresetAction={applyPipelinePresetAction!}
                  setPipelineAction={setTournamentPipelineAction!}
                />
              )
            )}

            {/* Pilotage des étapes (si le tournoi est déjà pipeline) */}
            {isPipeline && (
              <PipelinePlanning
                tournament={tournament}
                stages={stages}
                launchStageAction={launchStageAction}
                resetStagesAction={resetStagesAction}
                simulateStageAction={tournament.testMode ? simulateStageAction : undefined}
                previewEntriesAction={previewEntriesAction}
                setManualGroupsAction={setManualGroupsAction}
                updateStageAction={updatePipelineStageAction}
                launchGroupAction={launchPipelineGroupAction}
                addStageAction={addPipelineStageAction}
                removeStageAction={removePipelineStageAction}
                moveStageAction={movePipelineStageAction}
                resetToRoundAction={resetPipelineToRoundAction}
                rescheduleStageAction={reschedulePipelineStageAction}
              />
            )}
          </div>
        );
      })()}

      {/* ── Tab: Planning ── */}
      {activeTab === "planning" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Pool Schedule Editor — éditer les horaires de chaque poule (non MTP_OPEN, non Kiosque, non pipeline) */}
          {!isMtpOpen && !isKiosque && !isPipeline && (
            <PoolScheduleEditor
              tournamentId={tournament.id}
              gameDurationMin={tournament.gameDurationMin}
              poolAStart={(tournament as any).saturdayPoolAStart}
              poolBStart={(tournament as any).saturdayPoolBStart}
              poolCount={tournament.poolCount ?? 1}
              tournamentDateStart={tournament.dateStart}
            />
          )}

          {/* Pool Assignment (pour cross-pool format) */}
          {!isPipeline && (tournament.poolCount ?? 1) > 1 && !isLive && (
            <div className="panel">
              <PoolAssignment
                tournamentId={tournament.id}
                teams={teams.filter((t) => t.selected).map((t) => ({ id: t.id, name: t.name, seed: t.seed }))}
                pools={pools}
                poolCount={tournament.poolCount ?? 1}
                isLocked={false}
              />
            </div>
          )}

          {/* Explication du format actuel (legacy — le pipeline a sa propre timeline) */}
          {!isPipeline && (
          <div className="panel" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 8 }}>
              {t("orga_planning_format_configured")}
            </p>
            {tournament.saturdayFormat === "MTP_OPEN" ? (
              <>
                <p style={{ fontSize: 13, margin: 0 }}>
                  <strong>{t("orga_format_mtp_open_title" as any)}</strong> — {t("orga_format_mtp_open_days" as any)}
                </p>
                <p style={{ fontSize: 12, margin: "4px 0 0", color: "var(--text-muted)" }}>
                  {t("orga_format_mtp_open_desc" as any)}
                </p>
              </>
            ) : tournament.saturdayFormat === "GRAZ" ? (
              <>
                <p style={{ fontSize: 13, margin: 0 }}>
                  <strong>{t("orga_format_graz_title")}</strong> — {t("orga_format_graz_days")}
                </p>
                <p style={{ fontSize: 12, margin: "4px 0 0", color: "var(--text-muted)" }}>
                  {t("orga_format_graz_desc")}
                </p>
              </>
            ) : (tournament as any).saturdayFormat === "KIOSQUE" ? (
              <>
                <p style={{ fontSize: 13, margin: 0 }}>
                  <strong>{t("orga_format_kiosque_title" as any)}</strong> — {t("orga_format_kiosque_days" as any)}
                </p>
                <p style={{ fontSize: 12, margin: "4px 0 0", color: "var(--text-muted)" }}>
                  {t("orga_format_kiosque_desc" as any)}
                </p>
              </>
            ) : (tournament as any).saturdayFormat === "SPLIT_SWISS" ? (
              <>
                <p style={{ fontSize: 13, margin: 0 }}>
                  <strong>Swiss 2 groupes + DE</strong> — Samedi matin (Groupe A) + Samedi après-midi (Groupe B) + Dimanche DE
                </p>
                <p style={{ fontSize: 12, margin: "4px 0 0", color: "var(--text-muted)" }}>
                  {(tournament as any).saturdayRounds ?? (tournament as any).swissRounds ?? 5} tours Swiss par groupe · Sans rematch · Classement global combiné · {tournament.sundayFormat === "DE" ? "Double Élimination" : "Single Élimination"} dimanche
                </p>
              </>
            ) : tournament.saturdayFormat === "BERLIN_MIXED" ? (
              <>
                <p style={{ fontSize: 13, margin: 0 }}>
                  <strong>{t("orga_format_berlin_mixed_title")}</strong> — {t("orga_format_berlin_mixed_days")}
                </p>
                <p style={{ fontSize: 12, margin: "4px 0 0", color: "var(--text-muted)" }}>
                  {t("orga_format_berlin_mixed_friday", { fridayRounds: tournament.fridayRounds ?? 5 })}
                  · {t("orga_format_berlin_mixed_saturday", { saturdayRounds: tournament.saturdayRounds ?? 5 })}
                  · {t("orga_format_berlin_mixed_sunday", { sundayRounds: tournament.sundayRounds ?? 2 })}
                </p>
              </>
            ) : (
              <>
                <p style={{ fontSize: 13, margin: 0 }}>
                  <strong>{t("orga_day1_label")} :</strong>{" "}
                  {tournament.saturdayFormat === "SWISS"
                    ? t("orga_format_swiss", { rounds: tournament.swissRounds ?? 5 })
                    : tournament.saturdayFormat === "SPLIT_POOLS"
                      ? t("orga_format_split_pools", { count: tournament.poolCount ?? 2 })
                      : t("orga_format_single_pool")}
                  {tournament.crossPool ? t("orga_format_cross_pool") : ""}
                </p>
                <p style={{ fontSize: 13, margin: "4px 0 0" }}>
                  <strong>{t("orga_day2_label")} :</strong>{" "}
                  {tournament.sundayFormat === "DE" ? t("orga_format_de") : tournament.sundayFormat === "SE" ? t("orga_format_se") : t("orga_format_rr")}
                  {tournament.thirdPlaceMatch ? t("orga_format_3rd") : ""}
                  {tournament.gfReset ? t("orga_format_gf_reset") : ""}
                </p>
              </>
            )}
            {!tournament.locked && (
              <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8, marginBottom: 0 }}
                dangerouslySetInnerHTML={{ __html: t("orga_planning_format_locked_warning") }}
              />
            )}

            {/* Preview : estimation matchs & durée */}
            {(() => {
              const n = selectedTeams;
              const dur = tournament.gameDurationMin ?? 12;
              const pause = 4;
              const slot = dur + pause;
              const courts = tournament.courtsCount ?? 1;

              let day1Matches = 0;
              let day2Matches = 0;

              if ((tournament as any).saturdayFormat === "SPLIT_SWISS") {
                const half = Math.ceil(n / 2);
                const saturdayRounds = (tournament as any).saturdayRounds ?? (tournament as any).swissRounds ?? 5;
                day1Matches = saturdayRounds * Math.floor(half / 2) * 2;
                const bracketSize = (tournament as any).bracketSize ?? n;
                day2Matches = tournament.sundayFormat === "DE"
                  ? 2 * bracketSize - 2 + ((tournament as any).gfReset ? 1 : 0)
                  : bracketSize - 1 + ((tournament as any).thirdPlaceMatch ? 1 : 0);
              } else if (tournament.saturdayFormat === "BERLIN_MIXED") {
                const half = Math.ceil(n / 2);
                const fridayRounds = tournament.fridayRounds ?? 5;
                const saturdayRounds = tournament.saturdayRounds ?? 5;
                const sundayRounds = tournament.sundayRounds ?? 2;
                day1Matches = fridayRounds * Math.floor(half / 2) * 2;
                day2Matches = saturdayRounds * Math.floor(half / 2) * 2 + sundayRounds * Math.floor(n / 2);
              } else if (tournament.saturdayFormat === "GRAZ") {
                const poolSize = Math.ceil(n / 2);
                const matchesPerRound = Math.floor(poolSize / 2);
                day1Matches = 5 * matchesPerRound * 2;
                const day2RR = 2 * matchesPerRound * 2;
                const phase2 = n;
                const se = 7;
                day2Matches = day2RR + phase2 + se;
              } else if ((tournament as any).saturdayFormat === "MTP_OPEN") {
                // Format fixe: 2 pools de 10 équipes
                const rounds = (tournament as any).swissRounds ?? 6;
                day1Matches = 2 * rounds * 5; // 2 pools × rounds × 5 matchs/round
                // Dimanche : 10 cross + 4 barrage + DE×16
                const deM = 2 * 16 - 2 + ((tournament as any).gfReset ? 1 : 0);
                day2Matches = 10 + 4 + deM;
              } else if (tournament.saturdayFormat === "SWISS") {
                const rounds = tournament.swissRounds ?? 5;
                day1Matches = rounds * Math.floor(n / 2);
              } else {
                // Pool RR
                const poolCount = tournament.poolCount ?? 1;
                const perPool = Math.ceil(n / poolCount);
                day1Matches = poolCount * (perPool * (perPool - 1) / 2);
              }

              if (tournament.saturdayFormat !== "BERLIN_MIXED" && tournament.saturdayFormat !== "GRAZ" && (tournament as any).saturdayFormat !== "MTP_OPEN" && (tournament as any).saturdayFormat !== "KIOSQUE" && (tournament as any).saturdayFormat !== "BIG_APPLE") {
                const bracketSize = tournament.bracketSize ?? 16;
                const qualified = Math.min(bracketSize, n);
                if (tournament.sundayFormat === "DE") {
                  day2Matches = 2 * qualified - 2 + (tournament.gfReset ? 1 : 0);
                } else if (tournament.sundayFormat === "SE") {
                  day2Matches = qualified - 1 + (tournament.thirdPlaceMatch ? 1 : 0);
                } else {
                  day2Matches = qualified * (qualified - 1) / 2;
                }
                if (tournament.crossPool) {
                  day2Matches += Math.floor(n / 2);
                }
              }

              const totalMatches = Math.round(day1Matches + day2Matches);
              // MTP_OPEN: Pool A matin + Pool B après-midi en séquentiel sur 2 terrains
              // chaque pool dure (30 matchs / courts) * slot, les 2 se suivent
              const isMtpOpenPreview = (tournament as any).saturdayFormat === "MTP_OPEN";
              const day1Dur = isMtpOpenPreview
                ? Math.ceil((day1Matches / 2) / courts) * slot * 2  // 2 sessions séquentielles
                : Math.ceil(day1Matches / courts) * slot;
              const day2Dur = Math.ceil(day2Matches / courts) * slot;
              const fmtTime = (mins: number) => `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, "0")}`;

              return (
                <div style={{ marginTop: 12, padding: "10px 12px", background: "var(--bg-muted)", borderRadius: 8, fontSize: 12 }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 6 }}>
                    {t("orga_preview_title")}
                  </p>
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                    <span>📊 <strong>{totalMatches}</strong> {t("orga_preview_matches")}</span>
                    <span>📅 {t("orga_day1_label")}: <strong>{Math.round(day1Matches)}</strong> ({fmtTime(day1Dur)})</span>
                    <span>📅 {t("orga_day2_label")}: <strong>{Math.round(day2Matches)}</strong> ({fmtTime(day2Dur)})</span>
                    <span>⏱ {t("orga_preview_slot")}: {slot}min ({dur}+{pause})</span>
                    {courts > 1 && <span>🏟 {courts} {t("orga_preview_courts")}</span>}
                  </div>
                </div>
              );
            })()}
          </div>
          )}

          {/* Pool rounds limit — visible when pool matches exist */}
          {isLive && poolMatches.length > 0 && tournament.saturdayFormat !== "GRAZ" && tournament.saturdayFormat !== "BERLIN_MIXED" && tournament.saturdayFormat !== "MTP_OPEN" && tournament.saturdayFormat !== "KIOSQUE" && !isBigApple && !isPipeline && updatePoolRoundsAction && (
            <div className="panel" style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, margin: 0 }}>
                {t("field_pool_rounds")}
                <input
                  type="number"
                  min={1}
                  max={maxPoolRound || 50}
                  value={localPoolRounds}
                  onChange={(e) => setLocalPoolRounds(e.target.value)}
                  style={{ width: 60, fontSize: 13 }}
                />
                <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 400 }}>/ {maxPoolRound}</span>
              </label>
              <button
                type="button"
                className="ghost"
                style={{ fontSize: 12, padding: "4px 12px" }}
                disabled={poolRoundsSaving}
                onClick={async () => {
                  setPoolRoundsSaving(true);
                  const val = localPoolRounds.trim();
                  const num = val === "" || Number(val) >= maxPoolRound ? null : Number(val);
                  await updatePoolRoundsAction(tournament.id, num);
                  setPoolRoundsSaving(false);
                }}
              >
                {poolRoundsSaving ? "…" : t("btn_save_pool_rounds")}
              </button>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{t("field_pool_rounds_hint")}</span>
            </div>
          )}

          {/* Lancer / Reset */}
          {canLaunch && (
            <ConfirmFormButton
              action={launchAction}
              confirmMessage={t("edit_launch_confirm")}
              className="primary"
              style={{ width: "100%", padding: "16px 24px", fontSize: 16, fontFamily: "var(--font-display)", fontWeight: 700, justifyContent: "center", display: "flex", alignItems: "center", gap: 10 }}
            >
              🚀 {t("edit_launch_tournament")}
            </ConfirmFormButton>
          )}

          {(isLive || tournament.status === "COMPLETED") && (
            <ConfirmFormButton
              action={resetAction}
              confirmMessage={t("edit_reset_confirm")}
              className="ghost"
              style={{ fontSize: 12, padding: "6px 14px", color: "var(--danger)" }}
            >
              {t("edit_reset_tournament")}
            </ConfirmFormButton>
          )}

          {(isLive || tournament.status === "COMPLETED") && (
            <ConfirmFormButton
              action={resetMatchesAction}
              confirmMessage={t("edit_reset_matches_confirm")}
              className="ghost"
              style={{ fontSize: 12, padding: "6px 14px", color: "var(--warning)" }}
            >
              {t("edit_reset_matches")}
            </ConfirmFormButton>
          )}

          {/* ── Berlin Mixed Format planning ── */}
          {tournament.saturdayFormat === "BERLIN_MIXED" && (isLive || tournament.status === "COMPLETED") && (
            <BerlinMixedPlanning
              tournament={tournament}
              teams={teams.filter((t) => t.selected !== false)}
              matches={matches}
              updateBerlinTimesAction={updateBerlinTimesAction}
            />
          )}

          {/* ── Kiosque Format planning ── */}
          {tournament.saturdayFormat === "KIOSQUE" && (isLive || tournament.status === "COMPLETED") && (
            <KiosquePlanning
              tournament={tournament}
              pools={pools}
              matches={matches}
              launchKiosquePoolRoundAction={launchKiosquePoolRoundAction}
              launchKiosqueRegroupAction={launchKiosqueRegroupAction}
              launchKiosqueNextRoundAction={launchKiosqueNextRoundAction}
              launchKiosqueSEAction={launchKiosqueSEAction}
              resetKiosquePhaseAction={resetKiosquePhaseAction}
              resetKiosqueJ1Action={resetKiosqueJ1Action}
            />
          )}

          {/* ── Graz Format planning ── */}
          {tournament.saturdayFormat === "GRAZ" && (isLive || tournament.status === "COMPLETED") && (
            <GrazPlanning
              tournament={tournament}
              pools={pools}
              matches={matches}
              launchGrazPoolBAction={launchGrazPoolBAction}
              launchGrazSundayRRAction={launchGrazSundayRRAction}
              launchGrazRegroupAction={launchGrazRegroupAction}
              launchGrazSEAction={launchGrazSEAction}
              resetGrazPhaseAction={resetGrazPhaseAction}
            />
          )}

          {/* ── MTP Open Format planning ── */}
          {tournament.saturdayFormat === "MTP_OPEN" && (isLive || tournament.status === "COMPLETED") && (
            <MtpOpenPlanning
              tournament={tournament}
              matches={matches}
              launchMtpPoolAction={launchMtpPoolAction}
              launchMtpNextRoundAction={launchMtpNextRoundAction}
              launchMtpCrossPoolAction={launchMtpCrossPoolAction}
              launchMtpBarrageAction={launchMtpBarrageAction}
              launchMtpDEAction={launchMtpDEAction}
              resetMtpPhaseAction={resetMtpPhaseAction}
              updateMtpTimesAction={updateMtpTimesAction}
            />
          )}

          {/* ── Split Swiss Format planning ── */}
          {isSplitSwiss && (isLive || tournament.status === "COMPLETED") && (
            <SplitSwissPlanning
              tournament={tournament}
              teams={teams.filter((t) => t.selected !== false)}
              matches={matches}
              generateSplitSwissRoundAction={generateSplitSwissRoundAction}
              saveSplitSwissGroupsAction={saveSplitSwissGroupsAction}
              generateSplitSwissBracketAction={generateSplitSwissBracketAction}
              resetSplitSwissPhaseAction={resetSplitSwissPhaseAction}
            />
          )}

          {/* ── Big Apple Format planning ── */}
          {isBigApple && (isLive || tournament.status === "COMPLETED") && (
            <BigApplePlanning
              tournament={tournament}
              pools={pools}
              matches={matches}
              launchBigAppleSwissRoundAction={launchBigAppleSwissRoundAction}
              launchBigApplePlacementAction={launchBigApplePlacementAction}
              launchBigAppleSEAction={launchBigAppleSEAction}
              resetBigApplePhaseAction={resetBigApplePhaseAction}
            />
          )}

          {/* ── Planning standard (non-Berlin, non-Graz, non-MTP, non-Kiosque, non-SplitSwiss, non-BigApple, non-pipeline) ── */}
          {tournament.saturdayFormat !== "BERLIN_MIXED" && tournament.saturdayFormat !== "GRAZ" && tournament.saturdayFormat !== "MTP_OPEN" && tournament.saturdayFormat !== "KIOSQUE" && !isSplitSwiss && !isBigApple && !isPipeline && (
            <>
              {/* Pools — séparés par pool pour format multi-poule */}
              {hasAnyMatches && (tournament.poolCount ?? 1) > 1 && (
                <>
                  {pools.map((pool: any) => {
                    const poolTeamIds = new Set(pool.teams.map((pt: any) => pt.team.id));
                    const matchesInPool = poolMatches.filter((m) => poolTeamIds.has(m.teamAId) || poolTeamIds.has(m.teamBId));

                    return (
                      <div key={pool.id} className="panel">
                        <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 10 }}>
                          {t("orga_day1_label")} — {pool.name}
                        </p>
                        {matchesInPool.length === 0 ? (
                          <p className="meta">{t("orga_matches_not_generated")}</p>
                        ) : (
                          <p style={{ fontSize: 13, margin: 0, color: matchesInPool.every((m) => m.status === "FINISHED") ? "var(--teal)" : "var(--text)" }}>
                            {t("orga_matches_finished_count", { done: matchesInPool.filter((m) => m.status === "FINISHED").length, total: matchesInPool.length })}
                            {matchesInPool.every((m) => m.status === "FINISHED") ? " ✓" : ""}
                          </p>
                        )}
                      </div>
                    );
                  })}
                  {/* Lancer Pool B séparément (cross-pool / SPLIT_POOLS) : garde l'ordre du planning */}
                  {tournament.saturdayFormat === "SPLIT_POOLS" && launchPoolBAction && (() => {
                    const poolA = pools.find((p: any) => p.name === "Pool A");
                    const poolB = pools.find((p: any) => p.name === "Pool B");
                    const poolAMatches = poolA ? poolMatches.filter((m) => poolA.teams.some((pt: any) => pt.team.id === m.teamAId || pt.team.id === m.teamBId)) : [];
                    const poolBMatches = poolB ? poolMatches.filter((m) => poolB.teams.some((pt: any) => pt.team.id === m.teamAId || pt.team.id === m.teamBId)) : [];
                    const poolAFinished = poolAMatches.length > 0 && poolAMatches.every((m) => m.status === "FINISHED");
                    const canLaunchPoolB = poolAFinished && poolBMatches.length === 0;
                    if (!canLaunchPoolB) return null;
                    return (
                      <div className="panel">
                        <button
                          type="button"
                          className="primary"
                          style={{ fontSize: 13 }}
                          onClick={handleLaunchPoolB}
                          disabled={pendingPoolB}
                        >
                          {pendingPoolB ? "..." : t("orga_launch_pool_b" as any)}
                        </button>
                        {poolBError && <p style={{ color: "var(--danger)", fontSize: 12, marginTop: 6 }}>{poolBError}</p>}
                      </div>
                    );
                  })()}
                </>
              )}

              {/* Jour 1 — matchs pool (format simple ou Swiss) */}
              {hasAnyMatches && (tournament.poolCount ?? 1) === 1 && (
                <div className="panel">
                  <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 10 }}>
                    {t("orga_day1_label")} — {tournament.saturdayFormat === "SWISS" ? "Swiss" : "Pools"}
                  </p>
                  {poolMatches.length === 0 ? (
                    <p className="meta">{t("orga_matches_not_generated")}</p>
                  ) : (
                    <p style={{ fontSize: 13, margin: 0, color: poolMatchesFinished ? "var(--teal)" : "var(--text)" }}>
                      {t("orga_matches_finished_count", { done: poolMatches.filter((m) => m.status === "FINISHED").length, total: poolMatches.length })}
                      {poolMatchesFinished ? " ✓" : ""}
                    </p>
                  )}
                </div>
              )}

              {/* Cross-pool (format Barcelona) */}
              {tournament.crossPool && (isLive || tournament.status === "COMPLETED") && poolMatchesFinished && (
                <div className="panel">
                  <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 12 }}>
                    {t("orga_day2_label")} — {t("orga_format_cross_pool")}
                  </p>
                  <CrossPoolActions
                    tournamentId={tournament.id}
                    hasCrossPool={tournament.crossPool}
                    poolMatchesFinished={poolMatchesFinished}
                    crossPoolGenerated={matches.some((m) => m.phase === "CROSS_POOL")}
                    crossPoolFinished={matches
                      .filter((m) => m.phase === "CROSS_POOL")
                      .every((m) => m.status === "FINISHED")}
                    seGenerated={matches.some((m) => m.phase === "SE")}
                    seRound1Finished={matches
                      .filter((m) => m.phase === "SE" && m.roundIndex === 1)
                      .every((m) => m.status === "FINISHED")}
                    deGenerated={matches.some((m) => m.phase === "DE")}
                  />
                </div>
              )}

              {/* Jour 2 — bracket standard */}
              {!tournament.crossPool && (isLive || tournament.status === "COMPLETED") && (poolMatchesFinished || hasBracketMatches) && (
                <div className="panel">
                  <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 12 }}>
                    {t("orga_day2_label")} — {tournament.sundayFormat === "DE" ? t("orga_format_de") : tournament.sundayFormat === "SE" ? t("orga_format_se") : tournament.sundayFormat === "SPLIT_SE" ? "R1 Winner / Looser" : t("orga_format_rr")}
                  </p>
                  <BracketActions
                    tournamentId={tournament.id}
                    returnPath={`/tournament/${tournament.slug ?? tournament.id}?tab=bracket`}
                    hasQualifyingMatches={poolMatches.length > 0}
                    isRR={tournament.sundayFormat === "RR"}
                    mode={hasBracketMatches ? "buttons" : "launch"}
                  />
                </div>
              )}
            </>
          )}

          {/* État si pas encore lancé */}
          {!hasAnyMatches && !canLaunch && (
            <div className="panel" style={{ textAlign: "center", padding: 32, color: "var(--text-muted)" }}>
              <p style={{ fontSize: 13 }} dangerouslySetInnerHTML={{ __html: t("orga_no_teams_hint") }} />
            </div>
          )}

        </div>
      )}

      {/* ── Tab: Orga ── */}
      {activeTab === "orga" && (
        <div style={{ display: "grid", gap: 24 }}>
          {/* Task board */}
          <OrgaTaskBoard
            tasks={orgaTasks}
            tournamentId={tournament.id}
            coOrganizers={[
              ...(tournament.creator ? [{ playerId: tournament.creator.id, playerName: tournament.creator.name }] : []),
              ...coOrganizers.filter((co) => co.role !== "REF").map((co) => ({
                playerId: co.playerId,
                playerName: co.player.name,
              })),
            ]}
          />

          {/* Note board */}
          <OrgaNoteBoard
            notes={orgaNotes}
            tournamentId={tournament.id}
            currentPlayerId={currentPlayerId}
          />

          {/* Link board */}
          <OrgaLinkBoard
            links={orgaLinks}
            tournamentId={tournament.id}
          />

          {/* Message groupé aux capitaines */}
          <AnnouncePanel tournamentId={tournament.id} />

          {/* ── Équipe organisatrice : sponsors, co-orgas, arbitres ── */}
          <div style={{ borderTop: "2px solid var(--border)", paddingTop: 20, marginTop: 4, display: "flex", flexDirection: "column", gap: 20 }}>
            <p style={{ fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>
              {t("orga_tab_orgateam")}
            </p>
            <SponsorManager
              tournamentId={tournament.id}
              sponsors={sponsors}
              addAction={addSponsorAction}
              deleteAction={deleteSponsorAction}
            />
            <CoOrganizerManager
              tournamentId={tournament.id}
              coOrganizers={coOrganizers.filter((co) => co.role !== "REF").map((co) => co.player)}
              canManage={isCreator || isAdmin}
            />
            <RefereeManager
              tournamentId={tournament.id}
              referees={coOrganizers.filter((co) => co.role === "REF").map((co) => co.player)}
              canManage={isCreator || isAdmin || isOrgaForThis}
              refToken={tournament.refToken ?? null}
              generateRefTokenAction={generateRefTokenAction}
              revokeRefTokenAction={revokeRefTokenAction}
            />
          </div>

        </div>
      )}

      {/* ── Tab: Hébergement ── */}
      {activeTab === "hebergement" && tournament.accommodationAvailable && (
        <AccommodationManager
          tournamentId={tournament.id}
          teamPlayers={teams
            // Hébergement : seulement les équipes réellement inscrites (IN),
            // pas la liste d'attente ni les non-sélectionnées.
            .filter((team) => team.selected === true)
            .flatMap((team) =>
              (team.players ?? []).map((tp: any) => ({
                id: tp.id,
                needsAccommodation: tp.needsAccommodation ?? false,
                player: tp.player,
                team: { id: team.id, name: team.name },
              }))
            )}
          initialHosts={accommodationHosts}
        />
      )}

    </div>
  );
}
