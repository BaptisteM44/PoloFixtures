import { describe, it, expect } from "vitest";
import { autoSlides, parseSlideKey, slideCatalog, screenSlug, defaultScreens, type SlideContext } from "./screen-slides";

const ctx = (over: Partial<SlideContext> = {}): SlideContext => ({
  courtsCount: 2,
  stages: [
    { order: 0, name: "Poules", type: "RR", status: "ACTIVE", groups: ["A", "B"], hasMatches: true },
    { order: 1, name: "Bracket", type: "SE", status: "PENDING", groups: [], hasMatches: false },
  ],
  hasScheduled: true,
  hasReferees: false,
  hasFinished: true,
  hasSponsors: false,
  ...over,
});

describe("écran de salle — diapos", () => {
  it("lit les clés de diapo", () => {
    expect(parseSlideKey("court:2")).toEqual({ kind: "court", court: 2 });
    expect(parseSlideKey("standings:0:A")).toEqual({ kind: "standings", stageOrder: 0, group: "A" });
    expect(parseSlideKey("standings:3:-")).toEqual({ kind: "standings", stageOrder: 3, group: null });
    expect(parseSlideKey("bracket:1")).toEqual({ kind: "bracket", stageOrder: 1 });
    expect(parseSlideKey("nimporte")).toBeNull();
  });

  it("diaporama auto : terrains, prochains matchs, classements de l'étape en cours, résultats, QR", () => {
    expect(autoSlides(ctx())).toEqual(["courts", "upcoming", "standings:0:A", "standings:0:B", "results", "qr"]);
  });

  it("diaporama auto : 1 seul terrain → son scoreboard ; bracket en cours ; sponsors", () => {
    const c = ctx({
      courtsCount: 1,
      hasSponsors: true,
      stages: [
        { order: 0, name: "Poules", type: "RR", status: "DONE", groups: [], hasMatches: true },
        { order: 1, name: "Bracket", type: "SE", status: "ACTIVE", groups: [], hasMatches: true },
      ],
    });
    expect(autoSlides(c)).toEqual(["court:1", "upcoming", "bracket:1", "results", "sponsors", "qr"]);
  });

  it("diaporama auto : prochains arbitres juste après les prochains matchs", () => {
    expect(autoSlides(ctx({ hasReferees: true })).slice(0, 3)).toEqual(["courts", "upcoming", "referees"]);
  });

  it("diaporama auto : rien en cours → la dernière étape jouée", () => {
    const c = ctx({ stages: [{ order: 0, name: "Swiss", type: "SWISS", status: "DONE", groups: [], hasMatches: true }], hasScheduled: false });
    expect(autoSlides(c)).toEqual(["courts", "standings:0:-", "results", "qr"]);
  });

  it("catalogue : tout ce qu'on peut composer", () => {
    expect(slideCatalog(ctx())).toEqual(["overview", "courts", "court:1", "court:2", "upcoming", "referees", "results", "standings:0:A", "standings:0:B", "bracket:1", "sponsors", "qr"]);
  });

  it("slug d'URL lisible et écrans par défaut", () => {
    expect(screenSlug("Écran du Bar !")).toBe("ecran-du-bar");
    expect(defaultScreens(2).map((s) => s.slug)).toEqual(["diaporama", "vue-d-ensemble", "terrain-1", "terrain-2"]);
    expect(defaultScreens(1)[1].slides).toEqual([{ key: "overview" }]);
  });
});
