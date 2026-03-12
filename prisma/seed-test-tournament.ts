/**
 * Seed a realistic test tournament: 14-15 March 2026, Paris
 * 16 teams of 3 players registered + 8 teams on waiting list (24 total)
 * Run: npx tsx prisma/seed-test-tournament.ts
 */

import { PrismaClient, PlayerStatus } from "@prisma/client";

const prisma = new PrismaClient();

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function main() {
  // Get existing players
  const players = await prisma.player.findMany({
    where: { status: PlayerStatus.ACTIVE },
    select: { id: true, name: true, country: true, city: true },
    take: 100,
  });

  if (players.length < 72) {
    throw new Error(`Need at least 72 active players, found ${players.length}`);
  }

  const shuffled = shuffle(players);

  // Get the creator (first admin-type player or first player)
  const creator = shuffled[0];

  // Registration window: already closed (tournament is upcoming)
  const regStart = new Date("2026-01-15T10:00:00Z");
  const regEnd = new Date("2026-02-28T23:59:00Z");
  const dateStart = new Date("2026-03-14T09:00:00Z");
  const dateEnd = new Date("2026-03-15T18:00:00Z");

  // Create tournament
  const tournament = await prisma.tournament.create({
    data: {
      name: "Paris Hardcourt Open 2026",
      continentCode: "EU",
      country: "France",
      city: "Paris",
      dateStart,
      dateEnd,
      format: "3v3",
      gameDurationMin: 15,
      maxTeams: 16,
      courtsCount: 2,
      registrationFeePerTeam: 30,
      registrationFeeCurrency: "EUR",
      contactEmail: "contact@hardcourtpolo.fr",
      registrationStart: regStart,
      registrationEnd: regEnd,
      status: "UPCOMING",
      approved: true,
      saturdayFormat: "ALL_DAY",
      sundayFormat: "SE",
      chatMode: "OPEN",
      venueName: "Skatepark de la Chapelle",
      venueAddress: "10 Esplanade Nathalie Sarraute, 75018 Paris",
      creatorId: creator.id,
      locked: true,
    },
  });

  console.log(`Created tournament: ${tournament.id}`);

  // Team names
  const teamNames = [
    "Les Frondeurs", "Pédale Dure", "Coup de Guidon", "Vélo Furioso",
    "Chain Gang", "Freewheelers", "Iron Spoke", "Handlebar Heroes",
    "Le Peloton", "Roue Libre", "Mallet Club", "Fixed Gear FC",
    "Les Bâtons", "Polo Express", "Two Wheels", "Hardcourt Kings",
    // Waiting list teams
    "Les Outsiders", "Wild Rides", "Maillot Jaune", "Spoke & Fury",
    "Pedal Pushers", "Derailleur Gang", "Crash Test", "Last Minute FC",
  ];

  const cityPool = [
    "Paris", "Lyon", "Bordeaux", "Lille", "Nantes", "Berlin",
    "London", "Barcelona", "Amsterdam", "Brussels", "Zurich", "Vienna",
  ];

  let playerIdx = 0;

  for (let i = 0; i < 24; i++) {
    const teamPlayers = shuffled.slice(playerIdx, playerIdx + 3);
    playerIdx += 3;

    const isWaiting = i >= 16;
    const city = cityPool[i % cityPool.length];
    const country = ["Paris", "Lyon", "Bordeaux", "Lille", "Nantes"].includes(city) ? "France"
      : city === "Berlin" ? "Germany"
      : city === "London" ? "United Kingdom"
      : city === "Barcelona" ? "Spain"
      : city === "Amsterdam" ? "Netherlands"
      : city === "Brussels" ? "Belgium"
      : city === "Zurich" ? "Switzerland"
      : "Austria";

    const team = await prisma.team.create({
      data: {
        name: teamNames[i],
        city,
        country,
        tournamentId: tournament.id,
        seed: isWaiting ? 999 : i + 1,
        selected: !isWaiting,
        waitlistPosition: isWaiting ? i - 15 : null,
        players: {
          create: teamPlayers.map((p, pos) => ({
            playerId: p.id,
            isCaptain: pos === 0,
          })),
        },
      },
    });

    console.log(`  ${isWaiting ? "[WL]" : "    "} Team ${i + 1}: ${team.name} (${teamPlayers.map(p => p.name).join(", ")})`);
  }

  console.log(`\nDone! Tournament: /tournament/${tournament.id}`);
  console.log(`Edit: /tournament/${tournament.id}/edit`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
