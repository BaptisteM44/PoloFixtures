/**
 * POST /api/admin/fix-bracket-sides
 *
 * Migration: for tournaments that were generated before bracketSide was
 * populated, identify the Grand Final (the BRACKET match with no
 * nextMatchWinId and no nextMatchLoseId — i.e. the terminal match) and set
 * bracketSide = "G" on it.
 *
 * Safe to run multiple times (idempotent — skips matches already set).
 */
import { auth } from "@/lib/auth";
import { hasAtLeastRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.role || !hasAtLeastRole(session.user.role, "ADMIN")) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Find all completed SE/RR tournaments
  const tournaments = await prisma.tournament.findMany({
    where: {
      status: "COMPLETED",
      sundayFormat: { in: ["SE", "RR"] },
    },
    select: { id: true, sundayFormat: true },
  });

  let fixed = 0;
  let skipped = 0;

  for (const t of tournaments) {
    // Get all BRACKET matches for this tournament
    const bracketMatches = await prisma.match.findMany({
      where: { tournamentId: t.id, phase: "BRACKET" },
      select: { id: true, bracketSide: true, nextMatchWinId: true, nextMatchLoseId: true },
    });

    if (bracketMatches.length === 0) { skipped++; continue; }

    // The Grand Final is the BRACKET match that:
    // - has no nextMatchWinId (no match after it in the winner path)
    // - has no nextMatchLoseId
    // - is not already bracketSide = "G"
    // For SE, this is typically the last round match without followers.
    // We exclude third-place matches by picking the one where the most other
    // matches feed into it (or simply: among terminal matches, pick the one
    // with bracketSide !== "L" — third place was already set to "L" by the
    // generator, so bracketSide null + no next = grand final).
    const terminalMatches = bracketMatches.filter(
      (m) => !m.nextMatchWinId && !m.nextMatchLoseId && m.bracketSide !== "L"
    );

    // Among terminal non-L matches, if bracketSide is already "G" → skip
    const alreadyFixed = terminalMatches.filter((m) => m.bracketSide === "G");
    const toFix = terminalMatches.filter((m) => m.bracketSide === null || m.bracketSide === "W");

    if (toFix.length === 0) { skipped++; continue; }

    // If multiple terminal matches without "L" side, pick the one that has
    // the highest number of matches pointing to it (most "popular" = grand final)
    // For simplicity with SE: there should be exactly 1 terminal non-L match.
    let grandFinalId = toFix[0].id;
    if (toFix.length > 1) {
      // Count inbound nextMatchWinId references
      const inbound = new Map<string, number>();
      for (const m of bracketMatches) {
        if (m.nextMatchWinId) inbound.set(m.nextMatchWinId, (inbound.get(m.nextMatchWinId) ?? 0) + 1);
      }
      grandFinalId = toFix.sort((a, b) => (inbound.get(b.id) ?? 0) - (inbound.get(a.id) ?? 0))[0].id;
    }

    await prisma.match.update({
      where: { id: grandFinalId },
      data: { bracketSide: "G" },
    });
    fixed++;
  }

  return Response.json({ fixed, skipped, total: tournaments.length });
}
