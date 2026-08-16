import { describe, it, expect, beforeAll } from "vitest";
import { hashPlayerVoter, hashGuestVoter } from "./poll-hash";

beforeAll(() => {
  process.env.NEXTAUTH_SECRET = "test-secret-for-hashing";
});

describe("poll-hash — anti-double-vote & anonymat", () => {
  it("déterministe : même votant → même hash (permet de bloquer le 2e vote)", () => {
    expect(hashPlayerVoter("poll1", "playerA")).toBe(hashPlayerVoter("poll1", "playerA"));
    expect(hashGuestVoter("poll1", "a@b.com")).toBe(hashGuestVoter("poll1", "a@b.com"));
  });

  it("deux votants différents → hash différents", () => {
    expect(hashPlayerVoter("poll1", "playerA")).not.toBe(hashPlayerVoter("poll1", "playerB"));
    expect(hashGuestVoter("poll1", "a@b.com")).not.toBe(hashGuestVoter("poll1", "c@d.com"));
  });

  it("même votant, sondages différents → hash différents (pas de recoupement entre sondages)", () => {
    expect(hashPlayerVoter("poll1", "playerA")).not.toBe(hashPlayerVoter("poll2", "playerA"));
    expect(hashGuestVoter("poll1", "a@b.com")).not.toBe(hashGuestVoter("poll2", "a@b.com"));
  });

  it("email normalisé : casse et espaces ignorés (empêche de revoter en changeant la casse)", () => {
    const base = hashGuestVoter("poll1", "a@b.com");
    expect(hashGuestVoter("poll1", "A@B.COM")).toBe(base);
    expect(hashGuestVoter("poll1", "  a@b.com  ")).toBe(base);
    expect(hashGuestVoter("poll1", "A@b.Com ")).toBe(base);
  });

  it("le hash ne contient pas l'identité en clair", () => {
    const h = hashPlayerVoter("poll1", "playerA");
    expect(h).not.toContain("playerA");
    expect(h).not.toContain("poll1");
    expect(h).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
  });

  it("un inscrit et un guest avec le 'même' identifiant ne collisionnent pas", () => {
    // hashPlayerVoter préfixe "player:", hashGuestVoter préfixe "email:" →
    // un playerId "a@b.com" et un email "a@b.com" donnent des hash distincts.
    expect(hashPlayerVoter("poll1", "a@b.com")).not.toBe(hashGuestVoter("poll1", "a@b.com"));
  });
});
