/**
 * Édition d'un tournoi : le fuseau choisi est enregistré (et ignoré s'il
 * n'est pas un fuseau IANA valide) ; le pays est normalisé.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

vi.mock("@/lib/orga-auth", () => ({ getOrgaPlayerId: async () => "orga" }));
vi.mock("@/lib/auth", () => ({ auth: async () => ({ user: { id: "u", playerId: "orga", role: "ADMIN" } }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
// Pas d'appel réseau au géocodeur pendant le test.
vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200 })));

import { prisma } from "@/lib/db";
import { assertSimDatabase, resetSimDb } from "./sim-db";
import { updateTournamentAction } from "@/app/[locale]/tournament/[id]/edit/actions";

let tid: string;
beforeAll(async () => { await assertSimDatabase(); });
beforeEach(async () => {
  await resetSimDb();
  const t = await prisma.tournament.create({ data: {
    name: "TZ Cup", continentCode: "NA", country: "USA", city: "Philadelphia", lat: 39.95, lng: -75.16,
    dateStart: new Date("2026-10-10T00:00:00Z"), dateEnd: new Date("2026-10-11T00:00:00Z"),
    format: "pipeline", gameDurationMin: 12, maxTeams: 8, registrationFeePerTeam: 0, registrationFeeCurrency: "USD",
    contactEmail: "a@b.c", saturdayFormat: "ALL_DAY", sundayFormat: "SE", status: "UPCOMING", courtsCount: 1,
    usesPipeline: true, approved: true } as never, select: { id: true } });
  tid = t.id;
});

function form(extra: Record<string, string>) {
  const f = new FormData();
  const base: Record<string, string> = {
    id: tid, name: "TZ Cup", continentCode: "NA", country: "USA", city: " Philadelphia ",
    dateStart: "2026-10-10", dateEnd: "2026-10-11", format: "pipeline", gameDurationMin: "12", maxTeams: "8",
    courtsCount: "1", registrationFeePerTeam: "0", registrationFeeCurrency: "USD", contactEmail: "orga@example.com", chatMode: "DISABLED", status: "UPCOMING",
  };
  for (const [k, v] of Object.entries({ ...base, ...extra })) f.set(k, v);
  return f;
}

describe("Édition : fuseau horaire", () => {
  it("enregistre le fuseau choisi et normalise le pays", async () => {
    const res = await updateTournamentAction(form({ timezone: "America/New_York" }));
    expect((res as { error?: string })?.error).toBeUndefined();
    const t = await prisma.tournament.findUniqueOrThrow({ where: { id: tid } });
    expect([t.timezone, t.country, t.city]).toEqual(["America/New_York", "United States of America", "Philadelphia"]);
  });

  it("ignore un fuseau invalide (garde l'actuel)", async () => {
    await prisma.tournament.update({ where: { id: tid }, data: { timezone: "America/Chicago" } });
    await updateTournamentAction(form({ timezone: "Mars/Olympus_Mons" }));
    expect((await prisma.tournament.findUniqueOrThrow({ where: { id: tid } })).timezone).toBe("America/Chicago");
  });
});
