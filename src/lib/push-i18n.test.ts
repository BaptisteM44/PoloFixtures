import { describe, it, expect } from "vitest";
import { localizedPush, pushLocale, PUSH_LOCALES } from "./push-i18n";

const match = { tournamentId: "t1", tournamentSlug: "kanpai", tournamentName: "KANPAI CUP", matchId: "m1", court: "Court 1", time: "14:20", next: 1, afterLabel: "A – B", opponent: "Tokyo Fixies" };

describe("push dans la langue de l'appareil", () => {
  it("même texte que la cloche, traduit, lien vers la bonne langue", async () => {
    const titles: Record<string, string> = {};
    for (const l of PUSH_LOCALES) {
      const p = await localizedPush(l, "MATCH_SOON", match, "match-m1");
      titles[l] = p.title;
      expect(p.url).toBe(`/${l}/tournament/kanpai?tab=schedule`);
      expect(p.body).toContain("Tokyo Fixies");
      expect(p.title).toContain("Court 1");
      expect(p.title).not.toMatch(/\{|\}/); // pas de variable non remplacée
    }
    expect(titles.fr).toContain("bientôt à toi");
    expect(titles.en).toContain("You're up soon");
    expect(titles.de).toContain("bald dran");
    expect(titles.es).toContain("Te toca pronto");
    expect(titles.pt).toContain("quase na tua vez");
  });

  it("tous les types de notification ont un texte dans toutes les langues", async () => {
    const types = ["TEAM_SELECTED", "DIRECT_MESSAGE_RECEIVED", "BADGE_UNLOCKED", "REFEREE_ASSIGNED", "POLL_OPENED", "TOURNAMENT_PHOTOS_REVEALED", "COMMUNITY_STATUS_CHANGED"];
    const payload = { teamName: "T", tournamentName: "X", tournamentId: "t", senderName: "Bob", preview: "hi", badgeName: "B", count: 2, pollQuestion: "Q?", pollId: "p", itemTitle: "Idea", itemId: "i", status: "reply", isParticipant: "false" };
    for (const l of PUSH_LOCALES) for (const type of types) {
      const p = await localizedPush(l, type, payload, "x");
      expect(p.title.length).toBeGreaterThan(0);
      expect(p.title).not.toMatch(/^notifications\./); // clé manquante
    }
  });

  it("langue : celle de l'appareil, sinon devinée par le pays, sinon anglais", () => {
    expect(pushLocale("de", "France")).toBe("de");
    expect(pushLocale(null, "Brazil")).toBe("pt");
    expect(pushLocale(null, "Japan")).toBe("en");
    expect(pushLocale("xx", "Spain")).toBe("es");
  });
});
