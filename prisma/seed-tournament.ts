import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const t = await prisma.tournament.create({
    data: {
      name: "Bruxelles Open 2026",
      continentCode: "EU",
      country: "Belgium",
      city: "Bruxelles",
      dateStart: new Date("2026-04-18"),
      dateEnd: new Date("2026-04-19"),
      format: "3v3",
      gameDurationMin: 15,
      maxTeams: 12,
      courtsCount: 2,
      registrationFeePerTeam: 30,
      registrationFeeCurrency: "EUR",
      contactEmail: "bxl@bikepolo.eu",
      saturdayFormat: "ALL_DAY",
      sundayFormat: "DE",
      status: "UPCOMING",
      locked: false,
      approved: true,
      links: ["https://instagram.com/bxlbikepolo"],
      otherNotes: "Tournoi annuel de hardcourt bike polo à Bruxelles. Ambiance garantie !"
    }
  });
  console.log("Tournament created:", t.id);

  const teamsData = [
    {
      name: "Les Poulets Frits", city: "Bruxelles", country: "Belgium",
      players: [
        { name: "Baptiste Morvan", city: "Bruxelles", country: "Belgium", startYear: 2016, hand: "RIGHT" },
        { name: "Camille Dupont", city: "Bruxelles", country: "Belgium", startYear: 2018, hand: "LEFT" },
        { name: "Tom Leclercq", city: "Liège", country: "Belgium", startYear: 2020, hand: "RIGHT" },
      ]
    },
    {
      name: "Paris Massif", city: "Paris", country: "France",
      players: [
        { name: "Julien Renard", city: "Paris", country: "France", startYear: 2014, hand: "RIGHT" },
        { name: "Sofia Petit", city: "Paris", country: "France", startYear: 2017, hand: "RIGHT" },
        { name: "Kevin Martin", city: "Lyon", country: "France", startYear: 2019, hand: "LEFT" },
      ]
    },
    {
      name: "Berlin Vollgas", city: "Berlin", country: "Germany",
      players: [
        { name: "Klaus Weber", city: "Berlin", country: "Germany", startYear: 2012, hand: "RIGHT" },
        { name: "Anna Schmidt", city: "Berlin", country: "Germany", startYear: 2015, hand: "LEFT" },
        { name: "Lukas Bauer", city: "Hamburg", country: "Germany", startYear: 2018, hand: "RIGHT" },
      ]
    },
    {
      name: "Amsterdam Stroopwafels", city: "Amsterdam", country: "Netherlands",
      players: [
        { name: "Daan de Vries", city: "Amsterdam", country: "Netherlands", startYear: 2016, hand: "RIGHT" },
        { name: "Emma Bakker", city: "Amsterdam", country: "Netherlands", startYear: 2019, hand: "RIGHT" },
        { name: "Lars Janssen", city: "Utrecht", country: "Netherlands", startYear: 2021, hand: "LEFT" },
      ]
    },
    {
      name: "London Bricklane", city: "London", country: "United Kingdom",
      players: [
        { name: "James Wilson", city: "London", country: "United Kingdom", startYear: 2013, hand: "RIGHT" },
        { name: "Priya Sharma", city: "London", country: "United Kingdom", startYear: 2017, hand: "LEFT" },
        { name: "Dylan Hughes", city: "Manchester", country: "United Kingdom", startYear: 2020, hand: "RIGHT" },
      ]
    },
    {
      name: "Warsaw Bears", city: "Warsaw", country: "Poland",
      players: [
        { name: "Marek Kowalski", city: "Warsaw", country: "Poland", startYear: 2015, hand: "RIGHT" },
        { name: "Zofia Nowak", city: "Warsaw", country: "Poland", startYear: 2018, hand: "RIGHT" },
        { name: "Piotr Wisniewski", city: "Kraków", country: "Poland", startYear: 2022, hand: "LEFT" },
      ]
    },
    {
      name: "Stockholm Foxes", city: "Stockholm", country: "Sweden",
      players: [
        { name: "Erik Lindqvist", city: "Stockholm", country: "Sweden", startYear: 2014, hand: "RIGHT" },
        { name: "Maja Holm", city: "Stockholm", country: "Sweden", startYear: 2016, hand: "RIGHT" },
        { name: "Oscar Berg", city: "Göteborg", country: "Sweden", startYear: 2019, hand: "LEFT" },
      ]
    },
    {
      name: "Geneva Cuckoos", city: "Geneva", country: "Switzerland",
      players: [
        { name: "Luca Rossi", city: "Geneva", country: "Switzerland", startYear: 2017, hand: "RIGHT" },
        { name: "Nina Müller", city: "Zürich", country: "Switzerland", startYear: 2019, hand: "LEFT" },
        { name: "Marc Favre", city: "Lausanne", country: "Switzerland", startYear: 2021, hand: "RIGHT" },
      ]
    },
  ];

  for (let i = 0; i < teamsData.length; i++) {
    const td = teamsData[i];
    const playerIds: string[] = [];
    for (const pd of td.players) {
      const p = await prisma.player.create({
        data: {
          name: pd.name,
          city: pd.city,
          country: pd.country,
          startYear: pd.startYear,
          hand: pd.hand,
          status: "ACTIVE",
          badges: []
        }
      });
      playerIds.push(p.id);
    }
    await prisma.team.create({
      data: {
        tournamentId: t.id,
        name: td.name,
        city: td.city,
        country: td.country,
        seed: i + 1,
        players: {
          create: playerIds.map((pid, j) => ({ playerId: pid, isCaptain: j === 0 }))
        }
      }
    });
    console.log("Team created:", td.name);
  }
  console.log("\nDone! Visit: /tournaments to see the result");
  console.log("Tournament ID:", t.id);
}

main().catch(console.error).finally(() => prisma.$disconnect());
