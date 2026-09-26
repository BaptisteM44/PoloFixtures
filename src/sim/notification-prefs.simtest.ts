/**
 * Préférences de notification par catégorie, badges regroupés sans push,
 * zones géographiques (« FR » = « France », « AP » = Asie + Océanie).
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
const push = vi.hoisted(() => ({ sendPushToPlayer: vi.fn(async () => {}) }));
vi.mock("@/lib/web-push", () => push);

import { prisma } from "@/lib/db";
import { assertSimDatabase, resetSimDb } from "./sim-db";
import { createNotification, prefMatchesTournament } from "@/lib/notify";

let pid: string;
beforeAll(async () => { await assertSimDatabase(); });
beforeEach(async () => {
  await resetSimDb();
  push.sendPushToPlayer.mockClear();
  pid = (await prisma.player.create({ data: { name: "P", country: "France", status: "ACTIVE" }, select: { id: true } })).id;
});
const count = (type: string) => prisma.notification.count({ where: { playerId: pid, type: type as never } });

describe("Catégories", () => {
  it("sans préférences : tout arrive", async () => {
    await createNotification(pid, "DIRECT_MESSAGE_RECEIVED", { senderName: "A", conversationId: "c" });
    expect(await count("DIRECT_MESSAGE_RECEIVED")).toBe(1);
  });

  it("catégorie coupée : rien ; l'essentiel arrive toujours", async () => {
    await prisma.notificationPreference.create({ data: { playerId: pid, mutedCategories: ["messages", "polls"] } });
    await createNotification(pid, "DIRECT_MESSAGE_RECEIVED", { senderName: "A", conversationId: "c" });
    await createNotification(pid, "POLL_OPENED", { pollId: "p", pollQuestion: "Q" });
    await createNotification(pid, "POLL_BLOCKED", { pollId: "p", pollQuestion: "Q" });
    await createNotification(pid, "TEAM_SELECTED", { teamName: "T", tournamentName: "X", tournamentId: "x" });
    expect([await count("DIRECT_MESSAGE_RECEIVED"), await count("POLL_OPENED"), await count("POLL_BLOCKED"), await count("TEAM_SELECTED")]).toEqual([0, 0, 1, 1]);
  });

  it("interrupteur général coupé : seul l'essentiel", async () => {
    await prisma.notificationPreference.create({ data: { playerId: pid, enabled: false } });
    await createNotification(pid, "TEAM_SELECTED", { teamName: "T", tournamentName: "X", tournamentId: "x" });
    await createNotification(pid, "TOURNAMENT_NEEDS_APPROVAL", { tournamentId: "x", tournamentName: "X", city: "c", country: "c" });
    expect([await count("TEAM_SELECTED"), await count("TOURNAMENT_NEEDS_APPROVAL")]).toEqual([0, 1]);
  });
});

describe("Badges regroupés", () => {
  it("une seule notif non lue dont le compteur monte, jamais de push", async () => {
    await createNotification(pid, "BADGE_UNLOCKED", { badgeName: "A", badgeKey: "a" });
    await createNotification(pid, "BADGE_UNLOCKED", { badgeName: "B", badgeKey: "b" });
    await createNotification(pid, "BADGE_UNLOCKED", { badgeName: "C", badgeKey: "c" });
    const n = await prisma.notification.findMany({ where: { playerId: pid, type: "BADGE_UNLOCKED" } });
    expect(n.length).toBe(1);
    expect(n[0].payload).toMatchObject({ badgeName: "C", count: 3 });
    expect(push.sendPushToPlayer).not.toHaveBeenCalled();
  });
});

describe("Zones géographiques", () => {
  it("« FR » (préférence) correspond à « France » (tournoi) ; « AP » couvre l'Asie et l'Océanie", () => {
    expect(prefMatchesTournament({ continents: [], countries: ["FR"] }, { continentCode: "EU", country: "France" })).toBe(true);
    expect(prefMatchesTournament({ continents: [], countries: ["DE"] }, { continentCode: "EU", country: "France" })).toBe(false);
    expect(prefMatchesTournament({ continents: ["AP"], countries: [] }, { continentCode: "OC", country: "Australia" })).toBe(true);
    expect(prefMatchesTournament({ continents: [], countries: [] }, { continentCode: "SA", country: "Brazil" })).toBe(true);
  });
});
