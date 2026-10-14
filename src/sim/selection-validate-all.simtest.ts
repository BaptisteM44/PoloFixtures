/**
 * Retour terrain : « Valider toutes » réagissait mais rien n'était enregistré.
 * Une seule action serveur passe toutes les équipes IN (liste d'attente
 * comprise) et renvoie l'erreur si la sélection est verrouillée.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

const session = vi.hoisted(() => ({ current: null as null | { user: { id: string; playerId: string | null; role: string | null } } }));
vi.mock("@/lib/auth", () => ({ auth: async () => session.current }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_noStore: () => {} }));

import { prisma } from "@/lib/db";
import { assertSimDatabase, resetSimDb } from "./sim-db";
import { guaranteeAllTeamsAction, toggleSelectionLockAction } from "@/app/[locale]/tournament/[id]/edit/actions";
import { getPipeline } from "@/engine/pipeline-server";

beforeAll(async () => { await assertSimDatabase(); });
beforeEach(async () => { await resetSimDb(); });

async function mk() {
  const orga = await prisma.player.create({ data: { name: "Orga", country: "France", status: "ACTIVE" } });
  const t = await prisma.tournament.create({ data: {
    name: "sel", continentCode: "EU", country: "BE", city: "S",
    dateStart: new Date(Date.now() + 7 * 86400000), dateEnd: new Date(Date.now() + 8 * 86400000),
    format: "3v3", gameDurationMin: 12, maxTeams: 8, registrationFeePerTeam: 0,
    registrationFeeCurrency: "EUR", contactEmail: "s@t.l", saturdayFormat: "ALL_DAY",
    sundayFormat: "SE", status: "UPCOMING", courtsCount: 1, timezone: "Europe/Brussels",
    usesPipeline: true, creatorId: orga.id } as never });
  await prisma.team.createMany({ data: [
    { tournamentId: t.id, name: "A", seed: 1, selected: true, guaranteed: true },
    { tournamentId: t.id, name: "B", seed: 2, selected: true, guaranteed: false },
    { tournamentId: t.id, name: "C", seed: 3, selected: false, guaranteed: false, waitlistPosition: 1 },
  ] as never });
  session.current = { user: { id: "u", playerId: orga.id, role: null } };
  return t.id;
}

describe("Valider toutes les équipes IN", () => {
  it("toutes passent IN, y compris celle en liste d'attente", async () => {
    const id = await mk();
    const res = await guaranteeAllTeamsAction(id);
    expect(res.ok).toBe(true);
    const teams = await prisma.team.findMany({ where: { tournamentId: id } });
    expect(teams.every((x) => x.guaranteed && x.selected && x.waitlistPosition === null)).toBe(true);
  });

  it("sélection verrouillée : erreur renvoyée, rien ne change", async () => {
    const id = await mk();
    await prisma.tournament.update({ where: { id }, data: { selectionLocked: true } });
    const res = await guaranteeAllTeamsAction(id);
    expect(res.error).toBeTruthy();
    expect((await prisma.team.findMany({ where: { tournamentId: id, guaranteed: true } }))).toHaveLength(1);
  });

  it("hors orga : refusé", async () => {
    const id = await mk();
    session.current = { user: { id: "x", playerId: "intrus", role: null } };
    expect((await guaranteeAllTeamsAction(id)).error).toBeTruthy();
  });

  it("cas TOP 4 : 12 IN + 7 inscrites en plus → verrouiller fait sortir les 7, la 1re étape partira avec les 12", async () => {
    const id = await mk();
    await prisma.team.deleteMany({ where: { tournamentId: id } });
    await prisma.team.createMany({ data: Array.from({ length: 19 }, (_, i) => ({
      tournamentId: id, name: `T${i + 1}`, seed: i + 1, selected: true, guaranteed: i < 12,
    })) as never });
    expect((await toggleSelectionLockAction(id, true)).ok).toBe(true);
    const p = await getPipeline(id);
    expect(p!.teams).toHaveLength(12);
    expect(p!.teams.every((x) => x.guaranteed)).toBe(true);
  });
});
