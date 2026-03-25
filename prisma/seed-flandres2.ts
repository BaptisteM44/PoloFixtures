/**
 * Seed: Tournoi des Flandres #2 - 21 & 22 Mars 2026 (Lille)
 * 12 teams, Swiss pools (6 rounds), Double Elimination bracket
 *
 * Run: npx tsx prisma/seed-flandres2.ts
 */

import { PrismaClient, MatchStatus, MatchPhase } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // ─── Tournament ───────────────────────────────────────────────────────────
  const t = await prisma.tournament.create({
    data: {
      name: "Tournoi des Flandres #2",
      continentCode: "EU",
      country: "France",
      city: "Lille",
      dateStart: new Date("2026-03-21"),
      dateEnd: new Date("2026-03-22"),
      format: "3v3",
      gameDurationMin: 15,
      maxTeams: 12,
      courtsCount: 2,
      registrationFeePerTeam: 0,
      registrationFeeCurrency: "EUR",
      contactEmail: "contact@lillebikepolo.fr",
      saturdayFormat: "SWISS",
      sundayFormat: "DE",
      thirdPlaceMatch: false,
      gfReset: true,
      status: "COMPLETED",
      locked: true,
      approved: true,
    },
  });
  console.log("Tournament created:", t.id);

  // ─── Teams & Players ──────────────────────────────────────────────────────
  // From the registration sheet (ABC levels, cities)
  const teamsData = [
    {
      name: "PoloHub",
      seed: 1,
      city: "Lille",
      country: "France",
      players: [
        { name: "CamShot",  city: "Lille", country: "France", level: "A" },
        { name: "Florent",  city: "Lille", country: "France", level: "B" },
        { name: "Lolo",     city: "Lille", country: "France", level: "C" },
      ],
    },
    {
      name: "FC sans Pression",
      seed: 2,
      city: "Lille",
      country: "France",
      players: [
        { name: "Benji",   city: "Lille",    country: "France",  level: "A" },
        { name: "Kris",    city: "Lille",    country: "France",  level: "B" },
        { name: "Bulle",   city: "Lille",    country: "France",  level: "C" },
      ],
    },
    {
      name: "La Mannschaft du Dimanche",
      seed: 3,
      city: "Brussels",
      country: "Belgium",
      players: [
        { name: "Karsten", city: "Berlin",   country: "Germany",  level: "A" },
        { name: "Alcide",  city: "Brussels", country: "Belgium",  level: "B" },
        { name: "Lucas",   city: "Lille",    country: "France",   level: "C" },
      ],
    },
    {
      name: "On a vu de la lumière !!!",
      seed: 4,
      city: "Rouen",
      country: "France",
      players: [
        { name: "Donatien Braud",      city: "Rouen", country: "France", level: "A" },
        { name: "Camille Trublin-Savoye", city: "Rouen", country: "France", level: "B" },
        { name: "Caroline Pauleau",    city: "Paris", country: "France", level: "C" },
      ],
    },
    {
      name: "Keblo",
      seed: 5,
      city: "Lille",
      country: "France",
      players: [
        { name: "Pablo",   city: "Lille",  country: "France", level: "A" },
        { name: "Anais",   city: "Rouen",  country: "France", level: "B" },
        { name: "Tristan", city: "Lille",  country: "France", level: "C" },
      ],
    },
    {
      name: "Panam3",
      seed: 6,
      city: "Paris",
      country: "France",
      players: [
        { name: "JFran",   city: "Paris", country: "France", level: "A" },
        { name: "Jerrom",  city: "Paris", country: "France", level: "B" },
        { name: "Flap",    city: "Paris", country: "France", level: "C" },
      ],
    },
    {
      name: "Miezer Wiezerds",
      seed: 7,
      city: "Brussels",
      country: "Belgium",
      players: [
        { name: "Brecht",  city: "Brussels", country: "Belgium", level: "A" },
        { name: "Bilal",   city: "Brussels", country: "Belgium", level: "B" },
        { name: "Izi",     city: "Brussels", country: "Belgium", level: "C" },
      ],
    },
    {
      name: "Pavé Volant",
      seed: 8,
      city: "Brussels",
      country: "Belgium",
      players: [
        { name: "Baptiste",city: "Brussels",     country: "Belgium",  level: "A" },
        { name: "Emilia",  city: "Lille",        country: "France",   level: "B" },
        { name: "Boris",   city: "Brussels",     country: "Belgium",  level: "C" },
      ],
    },
    {
      name: "VASYMOLLO",
      seed: 9,
      city: "Brussels",
      country: "Belgium",
      players: [
        { name: "Paco",    city: "Brussels", country: "Belgium", level: "A" },
        { name: "Elfa",    city: "Brussels", country: "Belgium", level: "B" },
        { name: "Julien",  city: "Brussels", country: "Belgium", level: "C" },
      ],
    },
    {
      name: "Alcopolo",
      seed: 10,
      city: "Brussels",
      country: "Belgium",
      players: [
        { name: "Antoine", city: "Brussels", country: "Belgium", level: "A" },
        { name: "Robin",   city: "Brussels", country: "Belgium", level: "B" },
        { name: "Mathieu", city: "Lille",    country: "France",  level: "C" },
      ],
    },
    {
      name: "Polo-l'Évêque",
      seed: 11,
      city: "Rouen",
      country: "France",
      players: [
        { name: "Choco",   city: "Rouen",  country: "France", level: "A" },
        { name: "Yana",    city: "Rouen",  country: "France", level: "B" },
        { name: "Aude",    city: "Rouen",  country: "France", level: "C" },
      ],
    },
    {
      name: "Sugar Rush",
      seed: 12,
      city: "Berlin",
      country: "Germany",
      players: [
        { name: "Rita",    city: "Berlin",  country: "Germany", level: "A" },
        { name: "Perry",   city: "Paris",   country: "France",  level: "B" },
        { name: "Maarten", city: "Brussels",country: "Belgium", level: "C" },
      ],
    },
  ];

  // Create teams and players
  const teamMap: Record<string, string> = {}; // name -> id

  for (const td of teamsData) {
    const playerIds: string[] = [];
    for (const pd of td.players) {
      const p = await prisma.player.create({
        data: {
          name: pd.name,
          city: pd.city,
          country: pd.country,
          status: "ACTIVE",
          badges: [],
        },
      });
      playerIds.push(p.id);
    }

    const team = await prisma.team.create({
      data: {
        tournamentId: t.id,
        name: td.name,
        city: td.city,
        country: td.country,
        seed: td.seed,
        selected: true,
        players: {
          create: playerIds.map((pid, j) => ({ playerId: pid, isCaptain: j === 0 })),
        },
      },
    });
    teamMap[td.name] = team.id;
    console.log("Team created:", td.name, team.id);
  }

  // Helper to get team id
  const tid = (name: string) => {
    const id = teamMap[name];
    if (!id) throw new Error(`Team not found: ${name}`);
    return id;
  };

  // ─── Swiss Pool Matches (Saturday - 6 rounds) ─────────────────────────────
  // Round 1
  const swissMatches = [
    // Round 1
    { round: 1, pos: 1, a: "Miezer Wiezerds", b: "PoloHub",                      sA: 1, sB: 1 },
    { round: 1, pos: 2, a: "Pavé Volant",      b: "FC sans Pression",             sA: 0, sB: 5 },
    { round: 1, pos: 3, a: "VASYMOLLO",         b: "La Mannschaft du Dimanche",   sA: 3, sB: 1 },
    { round: 1, pos: 4, a: "Alcopolo",          b: "Keblo",                        sA: 5, sB: 1 },
    { round: 1, pos: 5, a: "Polo-l'Évêque",     b: "On a vu de la lumière !!!",   sA: 2, sB: 2 },
    { round: 1, pos: 6, a: "Sugar Rush",        b: "Panam3",                       sA: 1, sB: 2 },
    // Round 2
    { round: 2, pos: 1, a: "VASYMOLLO",         b: "FC sans Pression",             sA: 2, sB: 2 },
    { round: 2, pos: 2, a: "Alcopolo",          b: "Panam3",                       sA: 2, sB: 2 },
    { round: 2, pos: 3, a: "Keblo",             b: "Sugar Rush",                   sA: 2, sB: 2 },
    { round: 2, pos: 4, a: "La Mannschaft du Dimanche", b: "Pavé Volant",          sA: 2, sB: 1 },
    { round: 2, pos: 5, a: "Polo-l'Évêque",     b: "PoloHub",                      sA: 3, sB: 1 },
    { round: 2, pos: 6, a: "Miezer Wiezerds",   b: "On a vu de la lumière !!!",   sA: 0, sB: 2 },
    // Round 3
    { round: 3, pos: 1, a: "VASYMOLLO",         b: "On a vu de la lumière !!!",   sA: 2, sB: 2 },
    { round: 3, pos: 2, a: "Alcopolo",          b: "FC sans Pression",             sA: 0, sB: 2 },
    { round: 3, pos: 3, a: "Polo-l'Évêque",     b: "Panam3",                       sA: 2, sB: 0 },
    { round: 3, pos: 4, a: "Pavé Volant",       b: "Keblo",                        sA: 1, sB: 2 },
    { round: 3, pos: 5, a: "PoloHub",           b: "Sugar Rush",                   sA: 4, sB: 0 },
    { round: 3, pos: 6, a: "Miezer Wiezerds",   b: "La Mannschaft du Dimanche",   sA: 0, sB: 0 },
    // Round 4
    { round: 4, pos: 1, a: "Polo-l'Évêque",     b: "FC sans Pression",             sA: 0, sB: 3 },
    { round: 4, pos: 2, a: "Pavé Volant",       b: "Sugar Rush",                   sA: 2, sB: 1 },
    { round: 4, pos: 3, a: "VASYMOLLO",         b: "Alcopolo",                     sA: 1, sB: 3 },
    { round: 4, pos: 4, a: "On a vu de la lumière !!!", b: "Panam3",               sA: 0, sB: 1 },
    { round: 4, pos: 5, a: "Miezer Wiezerds",   b: "Keblo",                        sA: 1, sB: 3 },
    { round: 4, pos: 6, a: "PoloHub",           b: "La Mannschaft du Dimanche",   sA: 3, sB: 2 },
    // Round 5
    { round: 5, pos: 1, a: "FC sans Pression",  b: "Panam3",                       sA: 1, sB: 0 },
    { round: 5, pos: 2, a: "Alcopolo",          b: "On a vu de la lumière !!!",   sA: 2, sB: 2 },
    { round: 5, pos: 3, a: "Polo-l'Évêque",     b: "La Mannschaft du Dimanche",   sA: 1, sB: 0 },
    { round: 5, pos: 4, a: "PoloHub",           b: "Pavé Volant",                  sA: 3, sB: 3 },
    { round: 5, pos: 5, a: "Keblo",             b: "VASYMOLLO",                    sA: 2, sB: 2 },
    { round: 5, pos: 6, a: "Miezer Wiezerds",   b: "Sugar Rush",                   sA: 0, sB: 1 },
    // Round 6
    { round: 6, pos: 1, a: "FC sans Pression",  b: "Keblo",                        sA: 2, sB: 0 },
    { round: 6, pos: 2, a: "Polo-l'Évêque",     b: "Alcopolo",                     sA: 1, sB: 2 },
    { round: 6, pos: 3, a: "Miezer Wiezerds",   b: "Pavé Volant",                  sA: 3, sB: 4 },
    { round: 6, pos: 4, a: "La Mannschaft du Dimanche", b: "Sugar Rush",            sA: 0, sB: 1 },
    { round: 6, pos: 5, a: "On a vu de la lumière !!!", b: "PoloHub",              sA: 1, sB: 1 },
    { round: 6, pos: 6, a: "Panam3",            b: "VASYMOLLO",                    sA: 0, sB: 5 },
  ];

  for (const m of swissMatches) {
    const teamAId = tid(m.a);
    const teamBId = tid(m.b);
    const scoreA = m.sA;
    const scoreB = m.sB;
    const winnerTeamId = scoreA > scoreB ? teamAId : scoreB > scoreA ? teamBId : null;

    await prisma.match.create({
      data: {
        tournamentId: t.id,
        teamAId,
        teamBId,
        scoreA,
        scoreB,
        winnerTeamId,
        status: MatchStatus.FINISHED,
        phase: MatchPhase.SWISS,
        courtName: "Court " + (((m.pos - 1) % 2) + 1),
        roundIndex: m.round,
        positionInRound: m.pos,
        dayIndex: "SAT",
        startAt: new Date(`2026-03-21T${String(9 + m.round).padStart(2, "0")}:00:00Z`),
      },
    });
  }
  console.log("Swiss matches created:", swissMatches.length);

  // ─── Double Elimination Bracket (Sunday) ─────────────────────────────────
  // Seeds from Swiss standings (based on results):
  // 1=FC sans Pression, 2=Alcopolo, 3=Polo-l'Évêque, 4=VASYMOLLO,
  // 5=Polo-l'Évêque... Let's use the bracket as shown in Challonge:
  // Top bracket seeds: 8=Panam3, 9=Pavé Volant, 5=PoloHub, 12=Miezer Wiezerds,
  //                    7=Keblo, 10=Sugar Rush, 6=On a vu, 11=La Mannschaft
  // (Seedings from Challonge bracket - seeds are Challonge internal numbers)

  // Winners bracket
  const bracketMatches: Array<{
    id: string;
    side: "W" | "L" | "G";
    round: number;
    pos: number;
    a: string;
    b: string;
    sA: number;
    sB: number;
  }> = [
    // ── Winners bracket Tour 1 ──
    { id: "WB1", side: "W", round: 1, pos: 1, a: "Panam3",                    b: "Pavé Volant",              sA: 0, sB: 1 },
    { id: "WB2", side: "W", round: 1, pos: 2, a: "PoloHub",                   b: "Miezer Wiezerds",          sA: 0, sB: 1 },
    { id: "WB3", side: "W", round: 1, pos: 3, a: "Keblo",                     b: "Sugar Rush",               sA: 2, sB: 0 },
    { id: "WB4", side: "W", round: 1, pos: 4, a: "On a vu de la lumière !!!", b: "La Mannschaft du Dimanche",sA: 2, sB: 1 },
    // ── Winners bracket Tour 2 ──
    { id: "WB5", side: "W", round: 2, pos: 1, a: "FC sans Pression",          b: "Pavé Volant",              sA: 2, sB: 4 },
    { id: "WB6", side: "W", round: 2, pos: 2, a: "VASYMOLLO",                  b: "Miezer Wiezerds",          sA: 5, sB: 3 },
    { id: "WB7", side: "W", round: 2, pos: 3, a: "Alcopolo",                  b: "Keblo",                    sA: 1, sB: 2 },
    { id: "WB8", side: "W", round: 2, pos: 4, a: "Polo-l'Évêque",              b: "On a vu de la lumière !!!", sA: 1, sB: 0 },
    // ── Winners bracket Tour 3 ──
    { id: "WB9",  side: "W", round: 3, pos: 1, a: "Pavé Volant",  b: "VASYMOLLO",     sA: 1, sB: 2 },
    { id: "WB10", side: "W", round: 3, pos: 2, a: "Keblo",         b: "Polo-l'Évêque", sA: 2, sB: 3 },
    // ── Winners Demi-Finale ──
    { id: "WB11", side: "W", round: 4, pos: 1, a: "VASYMOLLO",     b: "Polo-l'Évêque", sA: 2, sB: 0 },
    // ── Losers bracket Manche 1 ──
    { id: "LB1", side: "L", round: 1, pos: 1, a: "On a vu de la lumière !!!", b: "Panam3",                    sA: 0, sB: 1 },
    { id: "LB2", side: "L", round: 1, pos: 2, a: "Alcopolo",                  b: "PoloHub",                   sA: 0, sB: 1 },
    { id: "LB3", side: "L", round: 1, pos: 3, a: "Miezer Wiezerds",           b: "Sugar Rush",                sA: 1, sB: 2 },
    { id: "LB4", side: "L", round: 1, pos: 4, a: "FC sans Pression",          b: "La Mannschaft du Dimanche", sA: 1, sB: 0 },
    // ── Losers bracket Manche 2 ──
    { id: "LB5", side: "L", round: 2, pos: 1, a: "Panam3",         b: "PoloHub",          sA: 0, sB: 4 },
    { id: "LB6", side: "L", round: 2, pos: 2, a: "Sugar Rush",     b: "FC sans Pression", sA: 0, sB: 5 },
    // ── Losers bracket Manche 3 ──
    { id: "LB7", side: "L", round: 3, pos: 1, a: "Pavé Volant",    b: "PoloHub",          sA: 2, sB: 0 },
    { id: "LB8", side: "L", round: 3, pos: 2, a: "Keblo",          b: "FC sans Pression", sA: 0, sB: 3 },
    // ── Losers bracket Manche 4 ──
    { id: "LB9", side: "L", round: 4, pos: 1, a: "Pavé Volant",    b: "FC sans Pression", sA: 1, sB: 2 },
    // ── Losers bracket Manche 5 (3rd place match) ──
    { id: "LB10", side: "L", round: 5, pos: 1, a: "Polo-l'Évêque", b: "FC sans Pression", sA: 1, sB: 0 },
    // ── Grand Final ──
    { id: "GF1", side: "G", round: 1, pos: 1, a: "VASYMOLLO",      b: "Polo-l'Évêque",    sA: 2, sB: 3 },
    // ── GF Reset ──
    { id: "GF2", side: "G", round: 2, pos: 1, a: "Polo-l'Évêque",  b: "VASYMOLLO",        sA: 3, sB: 2 },
  ];

  for (const m of bracketMatches) {
    const teamAId = tid(m.a);
    const teamBId = tid(m.b);
    const scoreA = m.sA;
    const scoreB = m.sB;
    const winnerTeamId = scoreA > scoreB ? teamAId : scoreB > scoreA ? teamBId : null;

    await prisma.match.create({
      data: {
        tournamentId: t.id,
        teamAId,
        teamBId,
        scoreA,
        scoreB,
        winnerTeamId,
        status: MatchStatus.FINISHED,
        phase: MatchPhase.BRACKET,
        bracketSide: m.side,
        courtName: "Court " + (((m.pos - 1) % 2) + 1),
        roundIndex: m.round,
        positionInRound: m.pos,
        dayIndex: "SUN",
        startAt: new Date(`2026-03-22T${String(9 + m.round).padStart(2, "0")}:00:00Z`),
      },
    });
  }
  console.log("Bracket matches created:", bracketMatches.length);

  // ─── Set tournament to COMPLETED ─────────────────────────────────────────
  await prisma.tournament.update({
    where: { id: t.id },
    data: { status: "COMPLETED" },
  });

  console.log("\n✓ Tournoi des Flandres #2 seeded successfully!");
  console.log("Tournament ID:", t.id);
  console.log("Podium: 1st Polo-l'Évêque | 2nd VASYMOLLO | 3rd FC sans Pression");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
