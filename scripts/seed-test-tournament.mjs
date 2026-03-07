/**
 * Seed script: 16-team test tournament
 * Saturday: Swiss rounds (4 rounds, all completed)
 * Sunday: Double Elimination (all completed except Grand Final + one Lower Bracket match)
 *
 * Run: node scripts/seed-test-tournament.mjs
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SAT = new Date("2025-06-07");
const SUN = new Date("2025-06-08");

function satTime(h, m = 0) {
  return new Date(Date.UTC(2025, 5, 7, h, m));
}
function sunTime(h, m = 0) {
  return new Date(Date.UTC(2025, 5, 8, h, m));
}

const TEAM_NAMES = [
  "Paris Polo",
  "Berlin Ballers",
  "London Locks",
  "Barcelona Bikers",
  "Amsterdam Aces",
  "Vienna Velos",
  "Brussels Blades",
  "Zürich Zeros",
  "Lyon Lynx",
  "Milano Maniacs",
  "Prague Pedals",
  "Budapest Bolts",
  "Ghent Grinders",
  "Lisbon Lions",
  "Warsaw Wheels",
  "Copenhagen Cranks",
];

const CITIES = ["Paris", "Berlin", "London", "Barcelona", "Amsterdam", "Vienna", "Brussels", "Zürich", "Lyon", "Milano", "Prague", "Budapest", "Ghent", "Lisbon", "Warsaw", "Copenhagen"];
const COUNTRIES = ["FR", "DE", "GB", "ES", "NL", "AT", "BE", "CH", "FR", "IT", "CZ", "HU", "BE", "PT", "PL", "DK"];

const PLAYER_NAMES = [
  ["Alex Martin", "FR"], ["Sam Müller", "DE"], ["Chris Walker", "GB"], ["Jamie García", "ES"],
  ["Morgan van der Berg", "NL"], ["Pat Hofer", "AT"], ["Robin Dupont", "BE"], ["Casey Baumann", "CH"],
  ["Jordan Lefèvre", "FR"], ["Taylor Rossi", "IT"], ["Blake Novak", "CZ"], ["Quinn Kovács", "HU"],
  ["Drew Maes", "BE"], ["Skyler Ferreira", "PT"], ["Cameron Wiśniewski", "PL"], ["Avery Jensen", "DK"],
  ["River Laurent", "FR"], ["Sage Koch", "DE"], ["Rebel Thompson", "GB"], ["Kit Fernández", "ES"],
  ["Ash Bakker", "NL"], ["Roan Gruber", "AT"], ["Sol Claes", "BE"], ["Wren Zimmermann", "CH"],
  ["Fox Mercier", "FR"], ["Emery Romano", "IT"], ["Nico Krejčí", "CZ"], ["Kai Balogh", "HU"],
  ["Lux Jacobs", "BE"], ["Vale Oliveira", "PT"], ["Rue Kowalski", "PL"], ["Sable Andersen", "DK"],
  ["Zed Moreau", "FR"], ["Rex Schneider", "DE"], ["Max Reid", "GB"], ["Lux Ruiz", "ES"],
];

async function main() {
  console.log("Creating test tournament...");

  // Create players
  const players = [];
  for (let i = 0; i < 32; i++) {
    const [name, country] = PLAYER_NAMES[i] || [`Player ${i}`, "FR"];
    const p = await prisma.player.create({
      data: { name, country, status: "ACTIVE" },
    });
    players.push(p);
  }
  console.log(`Created ${players.length} players`);

  // Create tournament
  const tournament = await prisma.tournament.create({
    data: {
      name: "TEST — Euro Cup Bike Polo 2025",
      continentCode: "EU",
      country: "FR",
      city: "Paris",
      dateStart: SAT,
      dateEnd: SUN,
      format: "Swiss + Double Elimination",
      gameDurationMin: 15,
      maxTeams: 16,
      courtsCount: 4,
      registrationFeePerTeam: 60,
      registrationFeeCurrency: "EUR",
      contactEmail: "test@bikepolo.test",
      saturdayFormat: "SWISS",
      sundayFormat: "DE",
      status: "COMPLETED",
      approved: true,
      submissionStatus: "APPROVED",
      locked: false,
      venueName: "Stade de la Paix",
      venueAddress: "1 Avenue du Polo, 75001 Paris",
    },
  });
  console.log(`Created tournament: ${tournament.id}`);

  // Create 16 teams (2 players each)
  const teams = [];
  for (let i = 0; i < 16; i++) {
    const team = await prisma.team.create({
      data: {
        tournamentId: tournament.id,
        name: TEAM_NAMES[i],
        city: CITIES[i],
        country: COUNTRIES[i],
        seed: i + 1,
        selected: true,
      },
    });
    // Add 2 players per team
    await prisma.teamPlayer.createMany({
      data: [
        { teamId: team.id, playerId: players[i * 2].id, isCaptain: true },
        { teamId: team.id, playerId: players[i * 2 + 1].id, isCaptain: false },
      ],
    });
    teams.push(team);
  }
  console.log(`Created ${teams.length} teams`);

  // ─── SWISS ROUNDS (Saturday, 4 rounds) ───────────────────────────────────

  // Swiss round pairings (simple rotation for 16 teams)
  // Track wins to sort for seeding
  const swissWins = new Array(16).fill(0);
  const swissPoints = new Array(16).fill(0); // for tie-breaking

  const swissRounds = [
    // Round 1: 0v1, 2v3, 4v5, 6v7, 8v9, 10v11, 12v13, 14v15
    [[0,1],[2,3],[4,5],[6,7],[8,9],[10,11],[12,13],[14,15]],
    // Round 2: winners vs winners, losers vs losers
    [[0,2],[1,3],[4,6],[5,7],[8,10],[9,11],[12,14],[13,15]],
    // Round 3
    [[0,4],[2,6],[1,5],[3,7],[8,12],[10,14],[9,13],[11,15]],
    // Round 4
    [[0,8],[4,12],[2,10],[6,14],[1,9],[5,13],[3,11],[7,15]],
  ];

  // Score outcomes: slight variation
  const swissScores = [
    [3,1, 2,3, 4,0, 2,2, 3,2, 1,3, 5,2, 2,4],
    [3,2, 1,4, 3,1, 2,3, 4,1, 2,3, 3,2, 1,2],
    [2,3, 3,2, 4,2, 1,3, 3,1, 2,4, 2,3, 3,1],
    [3,2, 2,4, 3,1, 2,3, 4,2, 1,3, 3,2, 2,3],
  ];

  const courts = ["Court A", "Court B", "Court C", "Court D"];
  const satStartHours = [9, 10, 11, 13];

  for (let r = 0; r < 4; r++) {
    const matchups = swissRounds[r];
    for (let m = 0; m < 8; m++) {
      const [ai, bi] = matchups[m];
      const si = m * 2;
      const sa = swissScores[r][si];
      const sb = swissScores[r][si + 1];
      const winnerId = sa > sb ? teams[ai].id : sb > sa ? teams[bi].id : null;

      await prisma.match.create({
        data: {
          tournamentId: tournament.id,
          phase: "SWISS",
          roundIndex: r,
          positionInRound: m,
          courtName: courts[m % 4],
          startAt: satTime(satStartHours[r], (m % 2) * 30),
          dayIndex: "SAT",
          status: "FINISHED",
          teamAId: teams[ai].id,
          teamBId: teams[bi].id,
          scoreA: sa,
          scoreB: sb,
          winnerTeamId: winnerId,
        },
      });

      if (sa > sb) swissWins[ai]++;
      else if (sb > sa) swissWins[bi]++;
    }
  }
  console.log("Created Swiss rounds");

  // ─── SEED ORDER after Swiss ───────────────────────────────────────────────
  // Sort teams by swiss wins descending → seed 1..16 for bracket
  const sortedTeams = [...teams]
    .map((t, i) => ({ ...t, wins: swissWins[i] }))
    .sort((a, b) => b.wins - a.wins);

  const seed = sortedTeams.map((t) => t.id); // seed[0] = best team

  // ─── DOUBLE ELIMINATION (Sunday, 16 teams) ────────────────────────────────
  // Rounds:
  //   Winners Bracket: R1(8 matches), R2(4), QF(2), SF(1)
  //   Losers Bracket: LR1(4), LR2(4), LR3(2), LR4(2), LSF(1), LF(1)
  //   Grand Final (1) + potential reset (1)
  //
  // We'll complete everything EXCEPT:
  //   - Grand Final (G, roundIndex=10) → SCHEDULED
  //   - Lower Final (L, roundIndex=9) → SCHEDULED
  //
  // WB seeding: 1v16, 8v9, 4v13, 5v12, 2v15, 7v10, 3v14, 6v11

  const wb1 = [
    [seed[0], seed[15]],
    [seed[7], seed[8]],
    [seed[3], seed[12]],
    [seed[4], seed[11]],
    [seed[1], seed[14]],
    [seed[6], seed[9]],
    [seed[2], seed[13]],
    [seed[5], seed[10]],
  ];

  // Outcomes (winners progress, losers drop to LB)
  const wb1Scores = [[3,1],[2,3],[4,2],[1,3],[3,0],[2,3],[3,2],[1,3]];
  const wb1Winners = [];
  const wb1Losers = [];

  const sunMatchHour = [9,10,11,12,13,14];

  for (let i = 0; i < 8; i++) {
    const [a, b] = wb1[i];
    const [sa, sb] = wb1Scores[i];
    const wid = sa > sb ? a : b;
    const lid = sa > sb ? b : a;
    wb1Winners.push(wid);
    wb1Losers.push(lid);
    await prisma.match.create({
      data: {
        tournamentId: tournament.id,
        phase: "BRACKET",
        bracketSide: "W",
        roundIndex: 0,
        positionInRound: i,
        courtName: courts[i % 4],
        startAt: sunTime(9, i * 10),
        dayIndex: "SUN",
        status: "FINISHED",
        teamAId: a,
        teamBId: b,
        scoreA: sa,
        scoreB: sb,
        winnerTeamId: wid,
      },
    });
  }

  // WB Round 2 (QF)
  const wb2 = [[wb1Winners[0], wb1Winners[1]], [wb1Winners[2], wb1Winners[3]], [wb1Winners[4], wb1Winners[5]], [wb1Winners[6], wb1Winners[7]]];
  const wb2Scores = [[3,2],[2,3],[3,1],[2,3]];
  const wb2Winners = [];
  const wb2Losers = [];
  for (let i = 0; i < 4; i++) {
    const [a, b] = wb2[i];
    const [sa, sb] = wb2Scores[i];
    const wid = sa > sb ? a : b;
    const lid = sa > sb ? b : a;
    wb2Winners.push(wid);
    wb2Losers.push(lid);
    await prisma.match.create({
      data: {
        tournamentId: tournament.id,
        phase: "BRACKET",
        bracketSide: "W",
        roundIndex: 1,
        positionInRound: i,
        courtName: courts[i % 4],
        startAt: sunTime(10, i * 15),
        dayIndex: "SUN",
        status: "FINISHED",
        teamAId: a,
        teamBId: b,
        scoreA: sa,
        scoreB: sb,
        winnerTeamId: wid,
      },
    });
  }

  // WB SF
  const wb3 = [[wb2Winners[0], wb2Winners[1]], [wb2Winners[2], wb2Winners[3]]];
  const wb3Scores = [[3,2],[1,3]];
  const wb3Winners = [];
  const wb3Losers = [];
  for (let i = 0; i < 2; i++) {
    const [a, b] = wb3[i];
    const [sa, sb] = wb3Scores[i];
    const wid = sa > sb ? a : b;
    const lid = sa > sb ? b : a;
    wb3Winners.push(wid);
    wb3Losers.push(lid);
    await prisma.match.create({
      data: {
        tournamentId: tournament.id,
        phase: "BRACKET",
        bracketSide: "W",
        roundIndex: 2,
        positionInRound: i,
        courtName: courts[i],
        startAt: sunTime(11, i * 20),
        dayIndex: "SUN",
        status: "FINISHED",
        teamAId: a,
        teamBId: b,
        scoreA: sa,
        scoreB: sb,
        winnerTeamId: wid,
      },
    });
  }

  // WB Final → winner to Grand Final, loser to Lower Final
  const wbF = [wb3Winners[0], wb3Winners[1]];
  const wbFScores = [3, 2];
  const wbFWinner = wbFScores[0] > wbFScores[1] ? wbF[0] : wbF[1];
  const wbFLoser = wbFScores[0] > wbFScores[1] ? wbF[1] : wbF[0];
  await prisma.match.create({
    data: {
      tournamentId: tournament.id,
      phase: "BRACKET",
      bracketSide: "W",
      roundIndex: 3,
      positionInRound: 0,
      courtName: "Court A",
      startAt: sunTime(12, 0),
      dayIndex: "SUN",
      status: "FINISHED",
      teamAId: wbF[0],
      teamBId: wbF[1],
      scoreA: wbFScores[0],
      scoreB: wbFScores[1],
      winnerTeamId: wbFWinner,
    },
  });

  // ─── LOSERS BRACKET ────────────────────────────────────────────────────────
  // LB R1: WB R1 losers (8 teams) → 4 matches
  const lbR1 = [[wb1Losers[0], wb1Losers[1]], [wb1Losers[2], wb1Losers[3]], [wb1Losers[4], wb1Losers[5]], [wb1Losers[6], wb1Losers[7]]];
  const lbR1Scores = [[3,1],[2,3],[3,2],[1,3]];
  const lbR1Winners = [];
  for (let i = 0; i < 4; i++) {
    const [a, b] = lbR1[i];
    const [sa, sb] = lbR1Scores[i];
    const wid = sa > sb ? a : b;
    lbR1Winners.push(wid);
    await prisma.match.create({
      data: {
        tournamentId: tournament.id,
        phase: "BRACKET",
        bracketSide: "L",
        roundIndex: 0,
        positionInRound: i,
        courtName: courts[i],
        startAt: sunTime(10, 30 + i * 10),
        dayIndex: "SUN",
        status: "FINISHED",
        teamAId: a,
        teamBId: b,
        scoreA: sa,
        scoreB: sb,
        winnerTeamId: wid,
      },
    });
  }

  // LB R2: LB R1 winners vs WB R2 losers
  const lbR2 = [[lbR1Winners[0], wb2Losers[0]], [lbR1Winners[1], wb2Losers[1]], [lbR1Winners[2], wb2Losers[2]], [lbR1Winners[3], wb2Losers[3]]];
  const lbR2Scores = [[2,3],[3,1],[1,3],[3,2]];
  const lbR2Winners = [];
  for (let i = 0; i < 4; i++) {
    const [a, b] = lbR2[i];
    const [sa, sb] = lbR2Scores[i];
    const wid = sa > sb ? a : b;
    lbR2Winners.push(wid);
    await prisma.match.create({
      data: {
        tournamentId: tournament.id,
        phase: "BRACKET",
        bracketSide: "L",
        roundIndex: 1,
        positionInRound: i,
        courtName: courts[i],
        startAt: sunTime(11, 30 + i * 10),
        dayIndex: "SUN",
        status: "FINISHED",
        teamAId: a,
        teamBId: b,
        scoreA: sa,
        scoreB: sb,
        winnerTeamId: wid,
      },
    });
  }

  // LB R3: LB R2 winners (4 teams) → 2 matches
  const lbR3 = [[lbR2Winners[0], lbR2Winners[1]], [lbR2Winners[2], lbR2Winners[3]]];
  const lbR3Scores = [[3,2],[2,3]];
  const lbR3Winners = [];
  for (let i = 0; i < 2; i++) {
    const [a, b] = lbR3[i];
    const [sa, sb] = lbR3Scores[i];
    const wid = sa > sb ? a : b;
    lbR3Winners.push(wid);
    await prisma.match.create({
      data: {
        tournamentId: tournament.id,
        phase: "BRACKET",
        bracketSide: "L",
        roundIndex: 2,
        positionInRound: i,
        courtName: courts[i],
        startAt: sunTime(12, 30 + i * 15),
        dayIndex: "SUN",
        status: "FINISHED",
        teamAId: a,
        teamBId: b,
        scoreA: sa,
        scoreB: sb,
        winnerTeamId: wid,
      },
    });
  }

  // LB R4: LB R3 winners vs WB SF losers → 2 matches
  const lbR4 = [[lbR3Winners[0], wb3Losers[0]], [lbR3Winners[1], wb3Losers[1]]];
  const lbR4Scores = [[2,3],[3,1]];
  const lbR4Winners = [];
  for (let i = 0; i < 2; i++) {
    const [a, b] = lbR4[i];
    const [sa, sb] = lbR4Scores[i];
    const wid = sa > sb ? a : b;
    lbR4Winners.push(wid);
    await prisma.match.create({
      data: {
        tournamentId: tournament.id,
        phase: "BRACKET",
        bracketSide: "L",
        roundIndex: 3,
        positionInRound: i,
        courtName: courts[i],
        startAt: sunTime(13, 30 + i * 15),
        dayIndex: "SUN",
        status: "FINISHED",
        teamAId: a,
        teamBId: b,
        scoreA: sa,
        scoreB: sb,
        winnerTeamId: wid,
      },
    });
  }

  // LB Semi-Final → 1 match, winner goes to Lower Final
  const lbSF = [lbR4Winners[0], lbR4Winners[1]];
  const lbSFScores = [3, 2];
  const lbSFWinner = lbSFScores[0] > lbSFScores[1] ? lbSF[0] : lbSF[1];
  await prisma.match.create({
    data: {
      tournamentId: tournament.id,
      phase: "BRACKET",
      bracketSide: "L",
      roundIndex: 4,
      positionInRound: 0,
      courtName: "Court B",
      startAt: sunTime(14, 0),
      dayIndex: "SUN",
      status: "FINISHED",
      teamAId: lbSF[0],
      teamBId: lbSF[1],
      scoreA: lbSFScores[0],
      scoreB: lbSFScores[1],
      winnerTeamId: lbSFWinner,
    },
  });

  // ─── REMAINING 2 MATCHES (SCHEDULED) ─────────────────────────────────────

  // Lower Final (LF): WB Final loser vs LB SF winner → 3rd place
  const lf = await prisma.match.create({
    data: {
      tournamentId: tournament.id,
      phase: "BRACKET",
      bracketSide: "L",
      roundIndex: 5,
      positionInRound: 0,
      courtName: "Court A",
      startAt: sunTime(15, 0),
      dayIndex: "SUN",
      status: "SCHEDULED",
      teamAId: wbFLoser,
      teamBId: lbSFWinner,
    },
  });

  // Grand Final: WB Final winner vs Lower Final winner
  const gf = await prisma.match.create({
    data: {
      tournamentId: tournament.id,
      phase: "BRACKET",
      bracketSide: "G",
      roundIndex: 6,
      positionInRound: 0,
      courtName: "Court A",
      startAt: sunTime(16, 0),
      dayIndex: "SUN",
      status: "SCHEDULED",
      teamAId: wbFWinner,
      // teamBId will be set after Lower Final
    },
  });

  console.log("\n✅ Test tournament created successfully!");
  console.log(`   Tournament ID: ${tournament.id}`);
  console.log(`   Lower Final (scheduled): ${lf.id}`);
  console.log(`   Grand Final (scheduled): ${gf.id}`);
  console.log(`\n   WB Final winner (seeded to GF): ${TEAM_NAMES[teams.indexOf(teams.find(t => t.id === wbFWinner))]}`);

  const teamNameById = Object.fromEntries(teams.map(t => [t.id, t.name]));
  console.log(`   LF: ${teamNameById[wbFLoser]} vs ${teamNameById[lbSFWinner]}`);
  console.log(`   GF: ${teamNameById[wbFWinner]} vs ???`);
  console.log(`\n   URL: /tournament/${tournament.id}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
