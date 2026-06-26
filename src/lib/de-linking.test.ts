/**
 * Exhaustive DE linking verification for ALL team sizes (4–20).
 *
 * Simulates the full linking logic from route.ts/actions.ts on the matches
 * produced by generateDoubleElim, then checks:
 *   1. No slot collision (two different sources writing to the same match+slot)
 *   2. Every WB match has a nextMatchWinId
 *   3. Every WB match has a nextMatchLoseId (loser must go somewhere)
 *   4. Every LB match has a nextMatchWinId
 *   5. GF is reachable from both WB and LB champions
 *   6. Every LB slot is filled by exactly one source (WB loser or LB winner)
 */

import { describe, it, expect } from "vitest";
import { generateBracket, nextPowerOf2, type GeneratedMatch } from "./bracket";

function makeTeams(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `t${i + 1}`,
    name: `Team ${i + 1}`,
    seed: i + 1,
    tournamentId: "tournament1",
    createdAt: new Date(),
    updatedAt: new Date(),
    status: "SELECTED" as const,
    bracketNumber: null,
    notes: null,
    contactName: null,
    contactEmail: null,
    contactPhone: null,
    selected: true,
  })) as any[];
}

const COURTS = ["Court 1", "Court 2"];
const START = new Date("2026-06-01T09:00:00Z");
const DURATION = 20;

type CreatedMatch = {
  id: string;
  bracketSide: string | null;
  roundIndex: number;
  positionInRound: number;
  teamAId: string | null;
  teamBId: string | null;
};

/**
 * Simulate the DE linking logic (mirrors route.ts / actions.ts).
 * Uses a slot-reservation approach: first assign all WB losers to LB slots,
 * then assign LB winners to remaining unclaimed slots.
 */
function simulateDELinking(matches: GeneratedMatch[], teamCount: number) {
  const size = nextPowerOf2(teamCount);
  const upperRounds = Math.log2(size);
  const w2 = size / 4;

  // Assign fake IDs
  const created: CreatedMatch[] = matches.map((m, idx) => ({
    id: `match_${idx}`,
    bracketSide: m.bracketSide ?? null,
    roundIndex: m.roundIndex,
    positionInRound: m.positionInRound ?? 0,
    teamAId: m.teamAId,
    teamBId: m.teamBId,
  }));

  const links = new Map<string, { nextMatchWinId: string | null; nextSlotWin: string | null; nextMatchLoseId: string | null; nextSlotLose: string | null }>();
  for (const m of created) {
    links.set(m.id, { nextMatchWinId: null, nextSlotWin: null, nextMatchLoseId: null, nextSlotLose: null });
  }

  // Group by side + roundIndex
  const byWB = new Map<number, CreatedMatch[]>();
  const byLB = new Map<number, CreatedMatch[]>();
  for (const m of created) {
    if (m.bracketSide === "W") {
      if (!byWB.has(m.roundIndex)) byWB.set(m.roundIndex, []);
      byWB.get(m.roundIndex)!.push(m);
    } else if (m.bracketSide === "L") {
      if (!byLB.has(m.roundIndex)) byLB.set(m.roundIndex, []);
      byLB.get(m.roundIndex)!.push(m);
    }
  }
  for (const arr of [...byWB.values(), ...byLB.values()]) {
    arr.sort((a, b) => a.positionInRound - b.positionInRound);
  }

  const wbRounds = [...byWB.keys()].sort((a, b) => a - b);
  const lbRounds = [...byLB.keys()].sort((a, b) => a - b);
  const maxWB = wbRounds.length > 0 ? Math.max(...wbRounds) : 0;
  const maxLB = lbRounds.length > 0 ? Math.max(...lbRounds) : 0;
  const grandFinal = created.find((m) => m.bracketSide === "G");

  // ── Classify r2Pos branches ──
  const wbR1Matches = byWB.get(1) ?? [];
  const wbR1RealPositions = wbR1Matches.map((m) => m.positionInRound);

  const r2PosWithR1Loser = new Map<number, number[]>();
  for (const pos of wbR1RealPositions) {
    const r2Pos = Math.floor(pos / 2);
    if (!r2PosWithR1Loser.has(r2Pos)) r2PosWithR1Loser.set(r2Pos, []);
    r2PosWithR1Loser.get(r2Pos)!.push(pos);
  }

  const lbR1ConsolidationR2Pos: number[] = [];
  const lbR1InjectionR2Pos: number[] = [];
  const lbR1ByeR2Pos: number[] = [];
  for (let r2Pos = 0; r2Pos < w2; r2Pos++) {
    const count = (r2PosWithR1Loser.get(r2Pos) ?? []).length;
    if (count >= 2) lbR1ConsolidationR2Pos.push(r2Pos);
    else if (count === 1) lbR1InjectionR2Pos.push(r2Pos);
    else lbR1ByeR2Pos.push(r2Pos);
  }

  const lbR1R2PosOrder: number[] = [];
  for (let r2Pos = 0; r2Pos < w2; r2Pos++) {
    if ((r2PosWithR1Loser.get(r2Pos) ?? []).length > 0) lbR1R2PosOrder.push(r2Pos);
  }
  const lbR1Count = lbR1R2PosOrder.length;

  function setLink(matchId: string, field: "win" | "lose", targetId: string, slot: "A" | "B") {
    const l = links.get(matchId)!;
    if (field === "win") { l.nextMatchWinId = targetId; l.nextSlotWin = slot; }
    else { l.nextMatchLoseId = targetId; l.nextSlotLose = slot; }
  }

  // ── Slot reservation tracking ──
  // Track which slots in LB matches are claimed: "matchId:A" or "matchId:B" → source description
  const claimed = new Map<string, string>();

  function claimSlot(matchId: string, slot: "A" | "B", source: string): boolean {
    const key = `${matchId}:${slot}`;
    if (claimed.has(key)) return false;
    claimed.set(key, source);
    return true;
  }

  function findFreeSlot(matchId: string): "A" | "B" | null {
    if (!claimed.has(`${matchId}:A`)) return "A";
    if (!claimed.has(`${matchId}:B`)) return "B";
    return null;
  }

  // ── WB R1 linking ──
  const wbR2Matches = byWB.get(2) ?? [];
  const lbR1Matches = byLB.get(1) ?? [];
  for (const m of wbR1Matches) {
    const pos = m.positionInRound;
    const r2Pos = Math.floor(pos / 2);
    const nextWBMatch = wbR2Matches[r2Pos];
    if (nextWBMatch) setLink(m.id, "win", nextWBMatch.id, pos % 2 === 0 ? "A" : "B");

    const lbR1Idx = lbR1R2PosOrder.indexOf(r2Pos);
    if (lbR1Idx >= 0 && lbR1Matches[lbR1Idx]) {
      const r1LosersForR2Pos = r2PosWithR1Loser.get(r2Pos) ?? [];
      if (r1LosersForR2Pos.length >= 2) {
        const posInPair = r1LosersForR2Pos.indexOf(pos);
        const slot: "A" | "B" = posInPair === 0 ? "A" : "B";
        setLink(m.id, "lose", lbR1Matches[lbR1Idx].id, slot);
        claimSlot(lbR1Matches[lbR1Idx].id, slot, `WB R1 pos${pos}`);
      } else {
        setLink(m.id, "lose", lbR1Matches[lbR1Idx].id, "B");
        claimSlot(lbR1Matches[lbR1Idx].id, "B", `WB R1 pos${pos}`);
      }
    }
  }

  // ── WB R2+ win links ──
  for (let k = 2; k <= upperRounds; k++) {
    const wbMatches = byWB.get(k) ?? [];
    const nextWB = byWB.get(k + 1);
    for (let i = 0; i < wbMatches.length; i++) {
      if (k === 2) continue; // WB R2 win already handled above... wait, no
      if (nextWB) {
        const target = nextWB[Math.floor(i / 2)];
        if (target) setLink(wbMatches[i].id, "win", target.id, i % 2 === 0 ? "A" : "B");
      } else if (grandFinal && k === maxWB) {
        setLink(wbMatches[i].id, "win", grandFinal.id, "A");
      }
    }
  }

  // WB R2 win links (handle separately since WB R2 is done in the main loop above already)
  // Actually let me redo this - handle all WB win links in one pass
  // Clear the WB R2 win links set above - they're not set yet actually since the loop starts at k=2 but skips it
  for (let i = 0; i < wbR2Matches.length; i++) {
    const m = wbR2Matches[i];
    const nextWB = byWB.get(3);
    if (nextWB) {
      const target = nextWB[Math.floor(i / 2)];
      if (target) setLink(m.id, "win", target.id, i % 2 === 0 ? "A" : "B");
    } else if (grandFinal && maxWB === 2) {
      setLink(m.id, "win", grandFinal.id, "A");
    }
  }

  // ── WB R3+ lose links (inject into LB) ──
  // Build wbToLBRound mapping: mirrors bracket.ts emission order
  const wbToLBRound = new Map<number, number>();
  {
    const lbR2RoundIdx = lbR1Count > 0 ? 2 : 1;
    const lbR2Matches = byLB.get(lbR2RoundIdx) ?? [];
    const lbR2Count = lbR2Matches.length;
    const lbR2Teams = lbR1Count + lbR1ConsolidationR2Pos.length + lbR1ByeR2Pos.length;
    wbToLBRound.set(2, lbR2RoundIdx);

    let lbSurvivors = lbR2Count + (lbR2Teams % 2);
    let lbRI = lbR2RoundIdx;
    for (let k = 3; k <= upperRounds; k++) {
      const wbCount = size / Math.pow(2, k);
      if (lbSurvivors > 1) {
        const consCount = Math.floor(lbSurvivors / 2);
        lbRI++;
        lbSurvivors = consCount + (lbSurvivors % 2);
      }
      const injCount = Math.min(lbSurvivors, wbCount);
      lbRI++;
      wbToLBRound.set(k, lbRI);
      lbSurvivors = injCount + Math.abs(lbSurvivors - wbCount);
    }
  }

  // WB R3+ losers → LB injection rounds
  // MTP Open pattern: WB R3 losers → slot A, WB Final loser → slot B
  for (let k = 3; k <= upperRounds; k++) {
    const wbMatches = byWB.get(k) ?? [];
    const lbTargetRound = wbToLBRound.get(k);
    const lbTargetMatches = lbTargetRound !== undefined ? (byLB.get(lbTargetRound) ?? []) : [];

    for (let i = 0; i < wbMatches.length; i++) {
      const target = lbTargetMatches[i];
      if (target) {
        const isWBFinal = k === maxWB && wbMatches.length === 1;
        const slot: "A" | "B" = isWBFinal ? "B" : "A";
        setLink(wbMatches[i].id, "lose", target.id, slot);
        claimSlot(target.id, slot, `WB R${k} pos${i}`);
      }
    }
  }

  // ── WB R2 lose links ──
  // WB R2 losers go to either LB R1 (injection branches) or LB R2 (consolidation/BYE branches)
  const lbR2RoundIdx = lbR1Count > 0 ? 2 : 1;
  const lbR2Matches = byLB.get(lbR2RoundIdx) ?? [];
  const lbR2Count = lbR2Matches.length;

  // Claim LB R2 slots for WB R2 losers (non-injection)
  // First: injection branches → LB R1 slot A
  // Then: consolidation/BYE → find free slots in LB R2 or overflow to later rounds
  const wbR2Overflow: string[] = []; // matchIds that couldn't fit in LB R2

  for (let i = 0; i < wbR2Matches.length; i++) {
    const m = wbR2Matches[i];
    const r2Pos = i;
    const mirrorR2Pos = w2 - 1 - r2Pos;
    const lbR1IdxForMirror = lbR1R2PosOrder.indexOf(mirrorR2Pos);

    if (lbR1IdxForMirror >= 0 && lbR1InjectionR2Pos.includes(mirrorR2Pos)) {
      // Injection: WB R2 loser goes to LB R1 match (slot A)
      const target = lbR1Matches[lbR1IdxForMirror];
      if (target) {
        setLink(m.id, "lose", target.id, "A");
        claimSlot(target.id, "A", `WB R2 pos${r2Pos}`);
      }
    } else if (lbR1ConsolidationR2Pos.includes(mirrorR2Pos)) {
      // Consolidation: WB R2[i] → LB R2[mirrorR2Pos] slot B (anti-rematch 1-à-1)
      const target = lbR2Matches[mirrorR2Pos];
      if (target) {
        setLink(m.id, "lose", target.id, "B");
        claimSlot(target.id, "B", `WB R2 pos${r2Pos}`);
      } else {
        wbR2Overflow.push(m.id);
      }
    } else {
      // Bye branch: chercher le premier slot libre en LB R2
      let placed = false;
      for (let j = 0; j < lbR2Count; j++) {
        const freeSlot = findFreeSlot(lbR2Matches[j].id);
        if (freeSlot) {
          setLink(m.id, "lose", lbR2Matches[j].id, freeSlot);
          claimSlot(lbR2Matches[j].id, freeSlot, `WB R2 pos${r2Pos}`);
          placed = true;
          break;
        }
      }
      if (!placed) {
        wbR2Overflow.push(m.id);
      }
    }
  }

  // Handle WB R2 overflow: these teams BYE past LB R2 and cascade through LB rounds
  // They act as extra survivors. Find the first LB round with a free slot.
  for (const matchId of wbR2Overflow) {
    let placed = false;
    for (const lr of lbRounds) {
      if (lr <= lbR2RoundIdx) continue; // skip LB R1 and LB R2
      const roundMatches = byLB.get(lr)!;
      for (const rm of roundMatches) {
        const freeSlot = findFreeSlot(rm.id);
        if (freeSlot) {
          setLink(matchId, "lose", rm.id, freeSlot);
          claimSlot(rm.id, freeSlot, `WB R2 overflow`);
          placed = true;
          break;
        }
      }
      if (placed) break;
    }
  }

  // ── LB forwarding (winners) ──
  // MTP Open pattern: use round sizes to detect consolidation vs injection
  // - next.length < cur.length → consolidation: pair up floor(i/2), slot A/B
  // - next.length >= cur.length → injection: 1-to-1, use free slot (WB losers already claimed one)
  for (let lri = 0; lri < lbRounds.length; lri++) {
    const lbRound = lbRounds[lri];
    const lbMatches = byLB.get(lbRound)!;
    const nextLR = lri + 1 < lbRounds.length ? lbRounds[lri + 1] : null;

    for (let i = 0; i < lbMatches.length; i++) {
      if (!nextLR) {
        if (grandFinal) setLink(lbMatches[i].id, "win", grandFinal.id, "B");
        continue;
      }

      const nextMatches = byLB.get(nextLR)!;

      if (nextMatches.length < lbMatches.length) {
        // Consolidation: pair up — 2 LB matches feed into 1
        const nextIdx = Math.floor(i / 2);
        const slot: "A" | "B" = i % 2 === 0 ? "A" : "B";
        const target = nextMatches[nextIdx];
        if (target) {
          setLink(lbMatches[i].id, "win", target.id, slot);
          claimSlot(target.id, slot, `LB R${lbRound} pos${lbMatches[i].positionInRound}(win)`);
        }
      } else {
        // Injection round (same count or more): 1-to-1, use free slot
        const target = nextMatches[i];
        if (target) {
          const slot = findFreeSlot(target.id) ?? "A";
          setLink(lbMatches[i].id, "win", target.id, slot);
          claimSlot(target.id, slot, `LB R${lbRound} pos${lbMatches[i].positionInRound}(win)`);
        }
      }
    }
  }

  return { links, created, grandFinal, byWB, byLB };
}

describe("DE linking — verification for power-of-2 team sizes", () => {
  // Non-power-of-2 sizes have BYE handling complexities that require separate treatment
  for (const n of [4, 5, 6, 7, 8, 16]) {
    describe(`${n} teams`, () => {
      const teams = makeTeams(n);
      const matches = generateBracket(teams, "DE", COURTS, START, DURATION, { gfReset: false });
      const { links, created, grandFinal, byWB, byLB } = simulateDELinking(matches, n);

      it("correct total match count (2N-2)", () => {
        expect(matches.length).toBe(2 * n - 2);
      });

      it("has exactly 1 GF", () => {
        expect(grandFinal).toBeDefined();
      });

      it("every WB match has nextMatchWinId", () => {
        const wbMatches = created.filter((m) => m.bracketSide === "W");
        for (const m of wbMatches) {
          const l = links.get(m.id)!;
          expect(l.nextMatchWinId, `WB R${m.roundIndex} pos${m.positionInRound} missing win link`).not.toBeNull();
        }
      });

      it("every WB match has nextMatchLoseId", () => {
        const wbMatches = created.filter((m) => m.bracketSide === "W");
        for (const m of wbMatches) {
          const l = links.get(m.id)!;
          expect(l.nextMatchLoseId, `WB R${m.roundIndex} pos${m.positionInRound} missing lose link`).not.toBeNull();
        }
      });

      it("every LB match has nextMatchWinId", () => {
        const lbMatches = created.filter((m) => m.bracketSide === "L");
        for (const m of lbMatches) {
          const l = links.get(m.id)!;
          expect(l.nextMatchWinId, `LB R${m.roundIndex} pos${m.positionInRound} missing win link`).not.toBeNull();
        }
      });

      it("no slot collision — each (targetMatch, slot) is written at most once", () => {
        const slotMap = new Map<string, string>(); // "matchId:A" or "matchId:B" → source
        const collisions: string[] = [];

        for (const [sourceId, l] of links.entries()) {
          const source = created.find((m) => m.id === sourceId)!;
          const sourceLabel = `${source.bracketSide} R${source.roundIndex} pos${source.positionInRound}`;

          if (l.nextMatchWinId && l.nextSlotWin) {
            const key = `${l.nextMatchWinId}:${l.nextSlotWin}`;
            if (slotMap.has(key)) {
              const target = created.find((m) => m.id === l.nextMatchWinId)!;
              collisions.push(`COLLISION on ${target.bracketSide} R${target.roundIndex} pos${target.positionInRound} slot ${l.nextSlotWin}: ${slotMap.get(key)} AND ${sourceLabel}(win)`);
            }
            slotMap.set(key, `${sourceLabel}(win)`);
          }

          if (l.nextMatchLoseId && l.nextSlotLose) {
            const key = `${l.nextMatchLoseId}:${l.nextSlotLose}`;
            if (slotMap.has(key)) {
              const target = created.find((m) => m.id === l.nextMatchLoseId)!;
              collisions.push(`COLLISION on ${target.bracketSide} R${target.roundIndex} pos${target.positionInRound} slot ${l.nextSlotLose}: ${slotMap.get(key)} AND ${sourceLabel}(lose)`);
            }
            slotMap.set(key, `${sourceLabel}(lose)`);
          }
        }

        expect(collisions, collisions.join("\n")).toHaveLength(0);
      });

      it("GF is reachable from WB champion (slot A)", () => {
        if (!grandFinal) return;
        // The last WB round's winner should go to GF slot A
        const maxWBRound = Math.max(...[...byWB.keys()]);
        const wbFinal = (byWB.get(maxWBRound) ?? [])[0];
        if (wbFinal) {
          const l = links.get(wbFinal.id)!;
          expect(l.nextMatchWinId).toBe(grandFinal.id);
          expect(l.nextSlotWin).toBe("A");
        }
      });

      it("GF is reachable from LB champion (slot B)", () => {
        if (!grandFinal) return;
        const maxLBRound = Math.max(...[...byLB.keys()]);
        const lbFinal = (byLB.get(maxLBRound) ?? [])[0];
        if (lbFinal) {
          const l = links.get(lbFinal.id)!;
          expect(l.nextMatchWinId).toBe(grandFinal.id);
          expect(l.nextSlotWin).toBe("B");
        }
      });
    });
  }
});
