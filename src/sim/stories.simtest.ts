/**
 * Stories de la home : publication, expiration 24 h, « à la une » (admin),
 * signalements avec masquage automatique, anti-spam, droits de suppression.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

const session = vi.hoisted(() => ({ current: null as null | { user: { id: string; playerId: string | null; role: string | null; name: string } } }));
vi.mock("@/lib/auth", () => ({ auth: async () => session.current }));
const notify = vi.hoisted(() => ({ notifyAllAdmins: vi.fn(async (_type: string, _payload: Record<string, unknown>) => {}), createNotification: vi.fn(async () => {}) }));
vi.mock("@/lib/notify", () => notify);

import { prisma } from "@/lib/db";
import { assertSimDatabase, resetSimDb } from "./sim-db";
import { POST as createStory } from "@/app/api/stories/route";
import { PATCH as patchStory, DELETE as deleteStory } from "@/app/api/stories/[id]/route";
import { POST as reportStory } from "@/app/api/stories/[id]/report/route";
import { loadStoryGroups } from "@/lib/stories";

const as = (playerId: string | null, role: string | null = null) => {
  session.current = playerId || role ? { user: { id: `u-${playerId}`, playerId, role, name: "X" } } : null;
};
const json = (body: unknown) =>
  new Request("http://sim.local/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const ctx = (id: string) => ({ params: { id } });
const img = (n: number) => `https://img.example/stories/${n}.webp`;

let alice: string, bob: string, carol: string, dave: string, admin: string;

async function post(asId: string, body: Record<string, unknown> = {}) {
  as(asId);
  const res = await createStory(json({ imagePath: img(Math.random()), ...body }));
  return { status: res.status, body: await res.json() };
}

beforeAll(async () => {
  await assertSimDatabase();
  delete process.env.R2_PUBLIC_URL;
});
beforeEach(async () => {
  await resetSimDb();
  await prisma.story.deleteMany();
  notify.notifyAllAdmins.mockClear();
  const mk = async (name: string) => (await prisma.player.create({ data: { name, country: "Belgium", status: "ACTIVE" }, select: { id: true } })).id;
  alice = await mk("Alice"); bob = await mk("Bob"); carol = await mk("Carol"); dave = await mk("Dave"); admin = await mk("Admin");
});

describe("Publication et affichage", () => {
  it("connexion requise ; stories groupées par auteur, le viewer en tête", async () => {
    as(null);
    expect((await createStory(json({ imagePath: img(1) }))).status).toBe(401);
    await post(alice, { caption: "Hello" });
    await post(bob);
    await post(bob);
    const groups = await loadStoryGroups(bob);
    expect(groups.map((g) => [g.kind, g.title, g.stories.length])).toEqual([["author", "Bob", 2], ["author", "Alice", 1]]);
  });

  it("une story expirée (24 h) disparaît, sauf si elle est à la une", async () => {
    const { body } = await post(alice);
    await prisma.story.update({ where: { id: body.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await loadStoryGroups(null)).toEqual([]);

    as(admin, "ADMIN");
    await patchStory(json({ highlightTitle: "Grand Royal XV" }), ctx(body.id));
    const groups = await loadStoryGroups(null);
    expect(groups.map((g) => [g.kind, g.title])).toEqual([["highlight", "Grand Royal XV"]]);
  });

  it("anti-spam : 10 stories par 24 h", async () => {
    for (let i = 0; i < 10; i++) expect((await post(alice)).status).toBe(200);
    expect((await post(alice)).body.error).toBe("rate_limited");
  });

  it("image hors de notre bucket refusée quand R2 est configuré", async () => {
    process.env.R2_PUBLIC_URL = "https://pub-test.r2.dev";
    try {
      expect((await post(alice, { imagePath: "https://evil.example/x.jpg" })).body.error).toBe("invalid_image");
      expect((await post(alice, { imagePath: "https://pub-test.r2.dev/stories/ok.webp" })).status).toBe(200);
    } finally {
      delete process.env.R2_PUBLIC_URL;
    }
  });
});

describe("Modération", () => {
  it("seul l'admin épingle ; l'auteur ou l'admin supprime", async () => {
    const { body } = await post(alice);
    as(bob);
    expect((await patchStory(json({ highlightTitle: "X" }), ctx(body.id))).status).toBe(403);
    expect((await deleteStory(new Request("http://sim.local"), ctx(body.id))).status).toBe(403);
    as(alice);
    expect((await deleteStory(new Request("http://sim.local"), ctx(body.id))).status).toBe(200);
    expect(await prisma.story.count()).toBe(0);
  });

  it("3 signalements ⇒ masquée d'office ; l'admin peut la réafficher", async () => {
    const { body } = await post(alice);
    for (const who of [bob, carol]) {
      as(who);
      expect((await (await reportStory(new Request("http://sim.local"), ctx(body.id))).json()).autoHidden).toBe(false);
    }
    as(dave);
    expect((await (await reportStory(new Request("http://sim.local"), ctx(body.id))).json()).autoHidden).toBe(true);
    expect(notify.notifyAllAdmins).toHaveBeenCalledTimes(3);
    expect(await loadStoryGroups(null)).toEqual([]);

    as(admin, "ADMIN");
    await patchStory(json({ hidden: false }), ctx(body.id));
    const s = await prisma.story.findUniqueOrThrow({ where: { id: body.id } });
    expect([s.hiddenAt, s.reportCount]).toEqual([null, 0]);
    expect((await loadStoryGroups(null)).length).toBe(1);
  });
});
