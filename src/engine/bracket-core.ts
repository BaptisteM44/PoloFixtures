/**
 * Moteur de brackets — primitives communes (Phase 1 refonte formats).
 *
 * Un bracket est décrit comme un PLAN : une liste de matchs avec, pour chaque
 * slot, sa SOURCE (un seed direct, le vainqueur ou le perdant d'un autre match
 * du plan). Le plan est de la donnée pure : testable exhaustivement, persisté
 * ensuite par un adaptateur unique.
 *
 * Les nombres d'équipes non-puissance-de-2 sont gérés par CONTRACTION DE
 * FANTÔMES : on construit le graphe complet pour P = puissance de 2 supérieure
 * avec des seeds fantômes (> n), puis on supprime les matchs impliquant un
 * fantôme en re-routant les liens à travers eux. Uniforme, sans cas spéciaux.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type Slot = "A" | "B";

/** D'où vient l'équipe d'un slot. */
export type SlotSource =
  | { type: "seed"; seed: number }            // seed 1-based (fantôme si > n)
  | { type: "winnerOf"; key: string }
  | { type: "loserOf"; key: string };

export type BracketSide = "W" | "L" | "G" | "BG";

/** Un match du plan, identifié par une clé locale stable (ex: "W2-1", "L3-0"). */
export type PlannedMatch = {
  key: string;
  side: BracketSide;
  roundIndex: number;
  positionInRound: number;
  slotA: SlotSource;
  slotB: SlotSource;
};

/** Lien résolu : où vont le vainqueur et le perdant d'un match conservé. */
export type ResolvedLinks = {
  winTo?: { key: string; slot: Slot };
  loseTo?: { key: string; slot: Slot };
};

export type BracketPlan = {
  /** Matchs conservés, dans l'ordre chronologique d'émission (planning). */
  matches: Array<PlannedMatch & ResolvedLinks & {
    /** Seeds directement placés (résolus après contraction), sinon null. */
    seedA: number | null;
    seedB: number | null;
  }>;
  teamCount: number;
  bracketSize: number; // puissance de 2 utilisée
};

// ─── Primitives ──────────────────────────────────────────────────────────────

export function nextPowerOf2(n: number): number {
  if (n <= 1) return 1;
  return Math.pow(2, Math.ceil(Math.log2(n)));
}

/**
 * Seeding standard de bracket (Challonge-style) : ordre des seeds dans le
 * round 1 tel que 1 rencontre P, les têtes de série se retrouvent le plus
 * tard possible. bracketSeeding(8) = [1,8,4,5,2,7,3,6].
 */
export function bracketSeeding(size: number): number[] {
  if (size === 1) return [1];
  const half = bracketSeeding(size / 2);
  const result: number[] = [];
  for (const s of half) {
    result.push(s, size + 1 - s);
  }
  return result;
}

// ─── Contraction des fantômes ────────────────────────────────────────────────

type Forward = { win: SlotSource | "phantom"; lose: SlotSource | "phantom" };

/**
 * Contracte un graphe complet : supprime les matchs dont un slot est fantôme
 * (seed > teamCount) en faisant suivre l'équipe réelle, et résout les liens
 * winTo/loseTo entre matchs conservés.
 *
 * `fullGraph` doit être en ordre topologique (toute source winnerOf/loserOf
 * référence un match antérieur dans la liste).
 */
export function contractPhantoms(
  fullGraph: PlannedMatch[],
  teamCount: number
): BracketPlan["matches"] {
  const forwards = new Map<string, Forward>();
  const kept = new Map<string, PlannedMatch & ResolvedLinks & { seedA: number | null; seedB: number | null }>();

  // Résout une source jusqu'à un seed réel, un match conservé, ou un fantôme.
  // Récursif : une chaîne de byes peut traverser plusieurs matchs contractés.
  const resolve = (src: SlotSource): SlotSource | "phantom" => {
    let cur: SlotSource | "phantom" = src;
    for (let hops = 0; hops < 64; hops++) {
      if (cur === "phantom") return "phantom";
      if (cur.type === "seed") return cur.seed > teamCount ? "phantom" : cur;
      const fwd = forwards.get(cur.key);
      if (!fwd) return cur; // match conservé → source telle quelle
      cur = cur.type === "winnerOf" ? fwd.win : fwd.lose;
    }
    throw new Error("contractPhantoms: chaîne de résolution trop longue (cycle ?)");
  };

  for (const m of fullGraph) {
    const a = resolve(m.slotA);
    const b = resolve(m.slotB);

    if (a === "phantom" && b === "phantom") {
      forwards.set(m.key, { win: "phantom", lose: "phantom" });
      continue;
    }
    if (a === "phantom" || b === "phantom") {
      // Bye : l'équipe réelle traverse, le perdant n'existe pas.
      const real = (a === "phantom" ? b : a) as SlotSource;
      forwards.set(m.key, { win: real, lose: "phantom" });
      continue;
    }

    // Match réel conservé.
    kept.set(m.key, {
      ...m,
      slotA: a,
      slotB: b,
      seedA: a.type === "seed" ? a.seed : null,
      seedB: b.type === "seed" ? b.seed : null,
    });
  }

  // Résolution des liens : pour chaque slot alimenté par un match conservé,
  // enregistrer winTo/loseTo sur le match source. Détecte les doubles réservations.
  const claimed = new Set<string>();
  for (const m of kept.values()) {
    for (const [slot, src] of [["A", m.slotA], ["B", m.slotB]] as Array<[Slot, SlotSource]>) {
      if (src.type === "seed") {
        claimed.add(`${m.key}:${slot}`);
        continue;
      }
      const source = kept.get(src.key);
      if (!source) throw new Error(`Plan incohérent: ${m.key} slot ${slot} référence ${src.key} non conservé`);
      const claimKey = `${m.key}:${slot}`;
      if (claimed.has(claimKey)) throw new Error(`Plan incohérent: double réservation du slot ${claimKey}`);
      claimed.add(claimKey);
      if (src.type === "winnerOf") {
        if (source.winTo) throw new Error(`Plan incohérent: ${src.key} a déjà un winTo`);
        source.winTo = { key: m.key, slot };
      } else {
        if (source.loseTo) throw new Error(`Plan incohérent: ${src.key} a déjà un loseTo`);
        source.loseTo = { key: m.key, slot };
      }
    }
  }

  return [...kept.values()];
}
