/**
 * Massive seed: ~250 players, 10 completed tournaments across continents,
 * full match events (GOAL/PENALTY), so badges can accumulate cross-tournament.
 *
 * Run: npx ts-node --project tsconfig.json -e "require('./prisma/seed-massive.ts')"
 * Or:  npx tsx prisma/seed-massive.ts
 */

import { PrismaClient } from "@prisma/client";
import { recomputeAllBadges } from "../src/lib/achievements";

const prisma = new PrismaClient();

// ─── Helpers ────────────────────────────────────────────────────────────────

function rng(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function dateAdd(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

// ─── Player pool ─────────────────────────────────────────────────────────────
// ~260 players distributed across continents

const PLAYERS_DATA = [
  // ── Europe ──────────────────────────────────────
  { name: "Baptiste Morvan",    country: "France",         city: "Paris",       startYear: 2016, hand: "RIGHT", gender: "MALE" },
  { name: "Camille Dupont",     country: "France",         city: "Paris",       startYear: 2018, hand: "LEFT",  gender: "NON_BINARY" },
  { name: "Julien Renard",      country: "France",         city: "Bordeaux",    startYear: 2014, hand: "RIGHT", gender: "MALE" },
  { name: "Sofia Petit",        country: "France",         city: "Lyon",        startYear: 2017, hand: "RIGHT", gender: "FEMALE" },
  { name: "Kevin Martin",       country: "France",         city: "Lille",       startYear: 2019, hand: "LEFT",  gender: "MALE" },
  { name: "Léa Bernard",        country: "France",         city: "Nantes",      startYear: 2020, hand: "RIGHT", gender: "FEMALE" },
  { name: "Hugo Lefebvre",      country: "France",         city: "Toulouse",    startYear: 2015, hand: "RIGHT", gender: "MALE" },
  { name: "Inès Garnier",       country: "France",         city: "Marseille",   startYear: 2021, hand: "LEFT",  gender: "FEMALE" },
  { name: "Théo Rousseau",      country: "France",         city: "Paris",       startYear: 2013, hand: "RIGHT", gender: "MALE" },
  { name: "Chloé Fournier",     country: "France",         city: "Rennes",      startYear: 2022, hand: "RIGHT", gender: "FEMALE" },
  { name: "Klaus Weber",        country: "Germany",        city: "Berlin",      startYear: 2012, hand: "RIGHT", gender: "MALE" },
  { name: "Anna Schmidt",       country: "Germany",        city: "Berlin",      startYear: 2015, hand: "LEFT",  gender: "FEMALE" },
  { name: "Lukas Bauer",        country: "Germany",        city: "Hamburg",     startYear: 2018, hand: "RIGHT", gender: "MALE" },
  { name: "Mia Hoffmann",       country: "Germany",        city: "Munich",      startYear: 2016, hand: "RIGHT", gender: "FEMALE" },
  { name: "Felix Wagner",       country: "Germany",        city: "Cologne",     startYear: 2019, hand: "LEFT",  gender: "MALE" },
  { name: "Hannah Richter",     country: "Germany",        city: "Frankfurt",   startYear: 2020, hand: "RIGHT", gender: "NON_BINARY" },
  { name: "Moritz Braun",       country: "Germany",        city: "Stuttgart",   startYear: 2014, hand: "RIGHT", gender: "MALE" },
  { name: "Laura Koch",         country: "Germany",        city: "Düsseldorf",  startYear: 2017, hand: "LEFT",  gender: "FEMALE" },
  { name: "James Wilson",       country: "United Kingdom", city: "London",      startYear: 2013, hand: "RIGHT", gender: "MALE" },
  { name: "Priya Sharma",       country: "United Kingdom", city: "London",      startYear: 2017, hand: "LEFT",  gender: "FEMALE" },
  { name: "Dylan Hughes",       country: "United Kingdom", city: "Manchester",  startYear: 2020, hand: "RIGHT", gender: "MALE" },
  { name: "Chloe Davies",       country: "United Kingdom", city: "Bristol",     startYear: 2018, hand: "RIGHT", gender: "FEMALE" },
  { name: "Liam O'Brien",       country: "United Kingdom", city: "Edinburgh",   startYear: 2016, hand: "LEFT",  gender: "MALE" },
  { name: "Amara Singh",        country: "United Kingdom", city: "Birmingham",  startYear: 2021, hand: "RIGHT", gender: "NON_BINARY" },
  { name: "Daan de Vries",      country: "Netherlands",    city: "Amsterdam",   startYear: 2016, hand: "RIGHT", gender: "MALE" },
  { name: "Emma Bakker",        country: "Netherlands",    city: "Amsterdam",   startYear: 2019, hand: "RIGHT", gender: "FEMALE" },
  { name: "Lars Janssen",       country: "Netherlands",    city: "Utrecht",     startYear: 2021, hand: "LEFT",  gender: "MALE" },
  { name: "Noor van den Berg",  country: "Netherlands",    city: "Rotterdam",   startYear: 2017, hand: "RIGHT", gender: "NON_BINARY" },
  { name: "Marek Kowalski",     country: "Poland",         city: "Warsaw",      startYear: 2015, hand: "RIGHT", gender: "MALE" },
  { name: "Zofia Nowak",        country: "Poland",         city: "Warsaw",      startYear: 2018, hand: "RIGHT", gender: "FEMALE" },
  { name: "Piotr Wisniewski",   country: "Poland",         city: "Kraków",      startYear: 2022, hand: "LEFT",  gender: "MALE" },
  { name: "Karolina Wójcik",    country: "Poland",         city: "Gdańsk",      startYear: 2019, hand: "RIGHT", gender: "FEMALE" },
  { name: "Erik Lindqvist",     country: "Sweden",         city: "Stockholm",   startYear: 2014, hand: "RIGHT", gender: "MALE" },
  { name: "Maja Holm",          country: "Sweden",         city: "Stockholm",   startYear: 2016, hand: "RIGHT", gender: "FEMALE" },
  { name: "Oscar Berg",         country: "Sweden",         city: "Göteborg",    startYear: 2019, hand: "LEFT",  gender: "MALE" },
  { name: "Luca Rossi",         country: "Switzerland",    city: "Geneva",      startYear: 2017, hand: "RIGHT", gender: "MALE" },
  { name: "Nina Müller",        country: "Switzerland",    city: "Zürich",      startYear: 2019, hand: "LEFT",  gender: "FEMALE" },
  { name: "Marc Favre",         country: "Switzerland",    city: "Lausanne",    startYear: 2021, hand: "RIGHT", gender: "MALE" },
  { name: "Sergio García",      country: "Spain",          city: "Barcelona",   startYear: 2015, hand: "RIGHT", gender: "MALE" },
  { name: "María López",        country: "Spain",          city: "Madrid",      startYear: 2018, hand: "LEFT",  gender: "FEMALE" },
  { name: "Pablo Martínez",     country: "Spain",          city: "Valencia",    startYear: 2020, hand: "RIGHT", gender: "MALE" },
  { name: "Nadia Fernández",    country: "Spain",          city: "Seville",     startYear: 2016, hand: "RIGHT", gender: "NON_BINARY" },
  { name: "Marco Ricci",        country: "Italy",          city: "Milan",       startYear: 2014, hand: "RIGHT", gender: "MALE" },
  { name: "Giulia Romano",      country: "Italy",          city: "Rome",        startYear: 2017, hand: "LEFT",  gender: "FEMALE" },
  { name: "Lorenzo Esposito",   country: "Italy",          city: "Florence",    startYear: 2019, hand: "RIGHT", gender: "MALE" },
  { name: "Tom Leclercq",       country: "Belgium",        city: "Brussels",    startYear: 2020, hand: "RIGHT", gender: "MALE" },
  { name: "Axelle Dubois",      country: "Belgium",        city: "Ghent",       startYear: 2018, hand: "LEFT",  gender: "FEMALE" },
  { name: "Pieter Claes",       country: "Belgium",        city: "Bruges",      startYear: 2016, hand: "RIGHT", gender: "MALE" },
  { name: "Mikkel Hansen",      country: "Denmark",        city: "Copenhagen",  startYear: 2015, hand: "RIGHT", gender: "MALE" },
  { name: "Astrid Nielsen",     country: "Denmark",        city: "Aarhus",      startYear: 2018, hand: "RIGHT", gender: "FEMALE" },
  { name: "Jari Mäkinen",       country: "Finland",        city: "Helsinki",    startYear: 2017, hand: "LEFT",  gender: "MALE" },
  { name: "Emilia Virtanen",    country: "Finland",        city: "Tampere",     startYear: 2020, hand: "RIGHT", gender: "FEMALE" },
  { name: "Aleksander Lie",     country: "Norway",         city: "Oslo",        startYear: 2016, hand: "RIGHT", gender: "MALE" },
  { name: "Ingrid Thorsen",     country: "Norway",         city: "Bergen",      startYear: 2019, hand: "LEFT",  gender: "FEMALE" },
  { name: "Stefan Novak",       country: "Czech Republic", city: "Prague",      startYear: 2014, hand: "RIGHT", gender: "MALE" },
  { name: "Eva Procházková",    country: "Czech Republic", city: "Brno",        startYear: 2017, hand: "RIGHT", gender: "FEMALE" },
  { name: "Balázs Nagy",        country: "Hungary",        city: "Budapest",    startYear: 2018, hand: "LEFT",  gender: "MALE" },
  { name: "Veronika Kiss",      country: "Hungary",        city: "Budapest",    startYear: 2021, hand: "RIGHT", gender: "FEMALE" },
  { name: "Andrei Popescu",     country: "Romania",        city: "Bucharest",   startYear: 2020, hand: "RIGHT", gender: "MALE" },
  { name: "Mihaela Ionescu",    country: "Romania",        city: "Cluj",        startYear: 2022, hand: "LEFT",  gender: "FEMALE" },

  // ── Americas ────────────────────────────────────
  { name: "Tyler Johnson",      country: "USA",            city: "Portland",    startYear: 2011, hand: "RIGHT", gender: "MALE" },
  { name: "Maya Rodriguez",     country: "USA",            city: "Chicago",     startYear: 2014, hand: "LEFT",  gender: "FEMALE" },
  { name: "Jake Thompson",      country: "USA",            city: "New York",    startYear: 2016, hand: "RIGHT", gender: "MALE" },
  { name: "Zoe Anderson",       country: "USA",            city: "Seattle",     startYear: 2018, hand: "RIGHT", gender: "NON_BINARY" },
  { name: "Ryan Mitchell",      country: "USA",            city: "Denver",      startYear: 2015, hand: "LEFT",  gender: "MALE" },
  { name: "Destiny Clarke",     country: "USA",            city: "Atlanta",     startYear: 2019, hand: "RIGHT", gender: "FEMALE" },
  { name: "Cole Harrison",      country: "USA",            city: "Austin",      startYear: 2017, hand: "RIGHT", gender: "MALE" },
  { name: "Avery Kim",          country: "USA",            city: "Los Angeles", startYear: 2020, hand: "LEFT",  gender: "NON_BINARY" },
  { name: "Ethan Brooks",       country: "USA",            city: "Boston",      startYear: 2013, hand: "RIGHT", gender: "MALE" },
  { name: "Jasmine Nguyen",     country: "USA",            city: "San Francisco", startYear: 2016, hand: "RIGHT", gender: "FEMALE" },
  { name: "Marcus Williams",    country: "USA",            city: "Minneapolis", startYear: 2012, hand: "LEFT",  gender: "MALE" },
  { name: "Caitlin Murphy",     country: "USA",            city: "Philadelphia", startYear: 2018, hand: "RIGHT", gender: "FEMALE" },
  { name: "Connor Walsh",       country: "Canada",         city: "Toronto",     startYear: 2015, hand: "RIGHT", gender: "MALE" },
  { name: "Sophie Tremblay",    country: "Canada",         city: "Montréal",    startYear: 2017, hand: "LEFT",  gender: "FEMALE" },
  { name: "Alex Bouchard",      country: "Canada",         city: "Québec",      startYear: 2019, hand: "RIGHT", gender: "NON_BINARY" },
  { name: "Jade Leblanc",       country: "Canada",         city: "Vancouver",   startYear: 2020, hand: "RIGHT", gender: "FEMALE" },
  { name: "Noah Gagnon",        country: "Canada",         city: "Calgary",     startYear: 2016, hand: "LEFT",  gender: "MALE" },
  { name: "Carlos Mendes",      country: "Brazil",         city: "São Paulo",   startYear: 2016, hand: "RIGHT", gender: "MALE" },
  { name: "Ana Oliveira",       country: "Brazil",         city: "Rio de Janeiro", startYear: 2018, hand: "LEFT", gender: "FEMALE" },
  { name: "Gabriel Silva",      country: "Brazil",         city: "Belo Horizonte", startYear: 2020, hand: "RIGHT", gender: "MALE" },
  { name: "Larissa Costa",      country: "Brazil",         city: "Curitiba",    startYear: 2019, hand: "RIGHT", gender: "NON_BINARY" },
  { name: "Diego Hernández",    country: "Mexico",         city: "Mexico City", startYear: 2015, hand: "RIGHT", gender: "MALE" },
  { name: "Valentina Cruz",     country: "Mexico",         city: "Guadalajara", startYear: 2018, hand: "LEFT",  gender: "FEMALE" },
  { name: "Mateo Vargas",       country: "Mexico",         city: "Monterrey",   startYear: 2020, hand: "RIGHT", gender: "MALE" },
  { name: "Sebastián Torres",   country: "Argentina",      city: "Buenos Aires", startYear: 2014, hand: "RIGHT", gender: "MALE" },
  { name: "Florencia Ibáñez",   country: "Argentina",      city: "Córdoba",     startYear: 2017, hand: "LEFT",  gender: "FEMALE" },
  { name: "Pablo Vega",         country: "Argentina",      city: "Rosario",     startYear: 2019, hand: "RIGHT", gender: "MALE" },
  { name: "Camila Reyes",       country: "Colombia",       city: "Bogotá",      startYear: 2018, hand: "RIGHT", gender: "FEMALE" },
  { name: "Andrés Morales",     country: "Colombia",       city: "Medellín",    startYear: 2020, hand: "LEFT",  gender: "MALE" },
  { name: "Sofía Fuentes",      country: "Chile",          city: "Santiago",    startYear: 2016, hand: "RIGHT", gender: "FEMALE" },
  { name: "Nicolás Castro",     country: "Chile",          city: "Valparaíso",  startYear: 2019, hand: "RIGHT", gender: "MALE" },

  // ── Asia / Pacific ──────────────────────────────
  { name: "Kenji Tanaka",       country: "Japan",          city: "Tokyo",       startYear: 2013, hand: "RIGHT", gender: "MALE" },
  { name: "Yuki Sato",          country: "Japan",          city: "Osaka",       startYear: 2016, hand: "LEFT",  gender: "FEMALE" },
  { name: "Hiroshi Yamamoto",   country: "Japan",          city: "Kyoto",       startYear: 2018, hand: "RIGHT", gender: "MALE" },
  { name: "Aoi Nakamura",       country: "Japan",          city: "Sapporo",     startYear: 2020, hand: "RIGHT", gender: "NON_BINARY" },
  { name: "Takeshi Kobayashi",  country: "Japan",          city: "Fukuoka",     startYear: 2015, hand: "LEFT",  gender: "MALE" },
  { name: "Ji-ho Park",         country: "South Korea",    city: "Seoul",       startYear: 2015, hand: "RIGHT", gender: "MALE" },
  { name: "Soo-yeon Lee",       country: "South Korea",    city: "Busan",       startYear: 2018, hand: "LEFT",  gender: "FEMALE" },
  { name: "Min-jun Choi",       country: "South Korea",    city: "Incheon",     startYear: 2020, hand: "RIGHT", gender: "MALE" },
  { name: "Wei Chen",           country: "China",          city: "Shanghai",    startYear: 2016, hand: "RIGHT", gender: "MALE" },
  { name: "Mei Lin",            country: "China",          city: "Beijing",     startYear: 2018, hand: "LEFT",  gender: "FEMALE" },
  { name: "Arjun Patel",        country: "India",          city: "Mumbai",      startYear: 2017, hand: "RIGHT", gender: "MALE" },
  { name: "Priya Nair",         country: "India",          city: "Bangalore",   startYear: 2019, hand: "RIGHT", gender: "FEMALE" },
  { name: "Kiran Das",          country: "India",          city: "Delhi",       startYear: 2021, hand: "LEFT",  gender: "NON_BINARY" },
  { name: "Somchai Pongpat",    country: "Thailand",       city: "Bangkok",     startYear: 2018, hand: "RIGHT", gender: "MALE" },
  { name: "Nattaporn Chaiyut",  country: "Thailand",       city: "Chiang Mai",  startYear: 2020, hand: "LEFT",  gender: "FEMALE" },
  { name: "Nguyen Van Tuan",    country: "Vietnam",        city: "Ho Chi Minh", startYear: 2019, hand: "RIGHT", gender: "MALE" },
  { name: "Tran Thi Mai",       country: "Vietnam",        city: "Hanoi",       startYear: 2021, hand: "RIGHT", gender: "FEMALE" },
  { name: "Ali Hassan",         country: "Singapore",      city: "Singapore",   startYear: 2016, hand: "RIGHT", gender: "MALE" },
  { name: "Mei Ling Tan",       country: "Singapore",      city: "Singapore",   startYear: 2018, hand: "LEFT",  gender: "FEMALE" },
  { name: "Rizal Maduro",       country: "Indonesia",      city: "Jakarta",     startYear: 2019, hand: "RIGHT", gender: "MALE" },
  { name: "Juan dela Cruz",     country: "Philippines",    city: "Manila",      startYear: 2020, hand: "RIGHT", gender: "MALE" },
  { name: "Ma. Santos",         country: "Philippines",    city: "Cebu",        startYear: 2022, hand: "LEFT",  gender: "FEMALE" },
  { name: "Chen Wei",           country: "Taiwan",         city: "Taipei",      startYear: 2017, hand: "RIGHT", gender: "MALE" },
  { name: "Lin Hsiao",          country: "Taiwan",         city: "Kaohsiung",   startYear: 2019, hand: "RIGHT", gender: "NON_BINARY" },
  { name: "Jack Turner",        country: "Australia",      city: "Melbourne",   startYear: 2014, hand: "RIGHT", gender: "MALE" },
  { name: "Sarah Collins",      country: "Australia",      city: "Sydney",      startYear: 2017, hand: "LEFT",  gender: "FEMALE" },
  { name: "Liam Cooper",        country: "Australia",      city: "Brisbane",    startYear: 2019, hand: "RIGHT", gender: "MALE" },
  { name: "Isla MacKenzie",     country: "Australia",      city: "Perth",       startYear: 2021, hand: "RIGHT", gender: "FEMALE" },
  { name: "Tom Watson",         country: "New Zealand",    city: "Auckland",    startYear: 2016, hand: "RIGHT", gender: "MALE" },
  { name: "Hana Tane",          country: "New Zealand",    city: "Wellington",  startYear: 2018, hand: "LEFT",  gender: "FEMALE" },

  // ── Africa ──────────────────────────────────────
  { name: "Sipho Dlamini",      country: "South Africa",   city: "Johannesburg", startYear: 2015, hand: "RIGHT", gender: "MALE" },
  { name: "Naledi Khumalo",     country: "South Africa",   city: "Cape Town",   startYear: 2018, hand: "LEFT",  gender: "FEMALE" },
  { name: "Lethabo Sithole",    country: "South Africa",   city: "Pretoria",    startYear: 2020, hand: "RIGHT", gender: "NON_BINARY" },
  { name: "Youssef Benali",     country: "Morocco",        city: "Casablanca",  startYear: 2017, hand: "RIGHT", gender: "MALE" },
  { name: "Fatima Ait Brahim",  country: "Morocco",        city: "Marrakech",   startYear: 2019, hand: "LEFT",  gender: "FEMALE" },
  { name: "Amara Diallo",       country: "Senegal",        city: "Dakar",       startYear: 2018, hand: "RIGHT", gender: "MALE" },
  { name: "Fatou Ndiaye",       country: "Senegal",        city: "Dakar",       startYear: 2020, hand: "RIGHT", gender: "FEMALE" },
  { name: "Kofi Mensah",        country: "Ghana",          city: "Accra",       startYear: 2016, hand: "LEFT",  gender: "MALE" },
  { name: "Ama Owusu",          country: "Ghana",          city: "Kumasi",      startYear: 2019, hand: "RIGHT", gender: "FEMALE" },
  { name: "Emeka Okafor",       country: "Nigeria",        city: "Lagos",       startYear: 2017, hand: "RIGHT", gender: "MALE" },
  { name: "Chidinma Eze",       country: "Nigeria",        city: "Abuja",       startYear: 2020, hand: "LEFT",  gender: "FEMALE" },
  { name: "David Kamau",        country: "Kenya",          city: "Nairobi",     startYear: 2018, hand: "RIGHT", gender: "MALE" },
  { name: "Grace Wanjiru",      country: "Kenya",          city: "Mombasa",     startYear: 2021, hand: "RIGHT", gender: "FEMALE" },
  { name: "Ahmed Hassan",       country: "Egypt",          city: "Cairo",       startYear: 2016, hand: "RIGHT", gender: "MALE" },
  { name: "Nour El-Din",        country: "Egypt",          city: "Alexandria",  startYear: 2019, hand: "LEFT",  gender: "FEMALE" },

  // ── Extra Europe (to hit 250+) ───────────────────
  { name: "Rasmus Berg",        country: "Denmark",        city: "Copenhagen",  startYear: 2017, hand: "RIGHT", gender: "MALE" },
  { name: "Frida Lindberg",     country: "Sweden",         city: "Malmö",       startYear: 2020, hand: "LEFT",  gender: "FEMALE" },
  { name: "Tomáš Kratochvíl",   country: "Czech Republic", city: "Prague",      startYear: 2016, hand: "RIGHT", gender: "MALE" },
  { name: "Helena Svobodová",   country: "Czech Republic", city: "Ostrava",     startYear: 2019, hand: "RIGHT", gender: "FEMALE" },
  { name: "Riku Mäkinen",       country: "Finland",        city: "Helsinki",    startYear: 2018, hand: "LEFT",  gender: "MALE" },
  { name: "Siiri Heikkinen",    country: "Finland",        city: "Oulu",        startYear: 2021, hand: "RIGHT", gender: "FEMALE" },
  { name: "Eirik Haugen",       country: "Norway",         city: "Oslo",        startYear: 2015, hand: "RIGHT", gender: "MALE" },
  { name: "Synne Olsen",        country: "Norway",         city: "Trondheim",   startYear: 2018, hand: "LEFT",  gender: "FEMALE" },
  { name: "Simon Durand",       country: "France",         city: "Strasbourg",  startYear: 2016, hand: "RIGHT", gender: "MALE" },
  { name: "Anaïs Morel",        country: "France",         city: "Montpellier", startYear: 2019, hand: "RIGHT", gender: "NON_BINARY" },
  { name: "Ben Harris",         country: "United Kingdom", city: "Leeds",       startYear: 2017, hand: "LEFT",  gender: "MALE" },
  { name: "Ellie Turner",       country: "United Kingdom", city: "Cardiff",     startYear: 2020, hand: "RIGHT", gender: "FEMALE" },
  { name: "Finn Braun",         country: "Germany",        city: "Leipzig",     startYear: 2018, hand: "RIGHT", gender: "MALE" },
  { name: "Jana Fischer",       country: "Germany",        city: "Dresden",     startYear: 2021, hand: "LEFT",  gender: "FEMALE" },
  { name: "Ruben Vermeer",      country: "Netherlands",    city: "Eindhoven",   startYear: 2017, hand: "RIGHT", gender: "MALE" },
  { name: "Fleur Visser",       country: "Netherlands",    city: "Den Haag",    startYear: 2020, hand: "LEFT",  gender: "FEMALE" },
  { name: "Tomasz Kaczmarek",   country: "Poland",         city: "Poznań",      startYear: 2016, hand: "RIGHT", gender: "MALE" },
  { name: "Agnieszka Lewandowska", country: "Poland",      city: "Wrocław",     startYear: 2019, hand: "RIGHT", gender: "FEMALE" },
  { name: "Antonio Greco",      country: "Italy",          city: "Naples",      startYear: 2018, hand: "LEFT",  gender: "MALE" },
  { name: "Francesca Bianchi",  country: "Italy",          city: "Turin",       startYear: 2020, hand: "RIGHT", gender: "FEMALE" },
  { name: "Carlos Ruiz",        country: "Spain",          city: "Bilbao",      startYear: 2015, hand: "RIGHT", gender: "MALE" },
  { name: "Elena Vidal",        country: "Spain",          city: "Zaragoza",    startYear: 2018, hand: "LEFT",  gender: "FEMALE" },
  { name: "Mathieu Dupuis",     country: "Belgium",        city: "Antwerp",     startYear: 2017, hand: "RIGHT", gender: "MALE" },
  { name: "Julie Hanssens",     country: "Belgium",        city: "Liège",       startYear: 2020, hand: "LEFT",  gender: "FEMALE" },
  { name: "Gábor Fekete",       country: "Hungary",        city: "Debrecen",    startYear: 2019, hand: "RIGHT", gender: "MALE" },
  { name: "Zsófia Takács",      country: "Hungary",        city: "Pécs",        startYear: 2021, hand: "LEFT",  gender: "FEMALE" },
  { name: "Vlad Ionescu",       country: "Romania",        city: "Timișoara",   startYear: 2018, hand: "RIGHT", gender: "MALE" },
  { name: "Raluca Munteanu",    country: "Romania",        city: "Iași",        startYear: 2020, hand: "LEFT",  gender: "FEMALE" },

  // ── Extra Americas ───────────────────────────────
  { name: "Brett Nelson",       country: "USA",            city: "Phoenix",     startYear: 2014, hand: "RIGHT", gender: "MALE" },
  { name: "Kayla Peterson",     country: "USA",            city: "Detroit",     startYear: 2017, hand: "LEFT",  gender: "FEMALE" },
  { name: "Jordan Davis",       country: "USA",            city: "Nashville",   startYear: 2019, hand: "RIGHT", gender: "NON_BINARY" },
  { name: "Megan Torres",       country: "USA",            city: "Houston",     startYear: 2016, hand: "RIGHT", gender: "FEMALE" },
  { name: "Liam Foster",        country: "USA",            city: "Columbus",    startYear: 2020, hand: "LEFT",  gender: "MALE" },
  { name: "Brianna Scott",      country: "USA",            city: "Charlotte",   startYear: 2018, hand: "RIGHT", gender: "FEMALE" },
  { name: "Marco Leal",         country: "Canada",         city: "Ottawa",      startYear: 2016, hand: "RIGHT", gender: "MALE" },
  { name: "Danielle Côté",      country: "Canada",         city: "Winnipeg",    startYear: 2019, hand: "LEFT",  gender: "FEMALE" },
  { name: "Rafael Santos",      country: "Brazil",         city: "Brasília",    startYear: 2018, hand: "RIGHT", gender: "MALE" },
  { name: "Isabela Ferreira",   country: "Brazil",         city: "Porto Alegre", startYear: 2020, hand: "LEFT", gender: "FEMALE" },
  { name: "Elena Gutiérrez",    country: "Mexico",         city: "Puebla",      startYear: 2019, hand: "RIGHT", gender: "FEMALE" },
  { name: "Julián Ramírez",     country: "Argentina",      city: "Mendoza",     startYear: 2018, hand: "LEFT",  gender: "MALE" },
  { name: "Valentina Herrera",  country: "Colombia",       city: "Cali",        startYear: 2020, hand: "RIGHT", gender: "FEMALE" },
  { name: "Diego Pérez",        country: "Chile",          city: "Concepción",  startYear: 2019, hand: "RIGHT", gender: "MALE" },
  { name: "Lucía Mamani",       country: "Peru",           city: "Lima",        startYear: 2020, hand: "LEFT",  gender: "FEMALE" },
  { name: "Rodrigo Varela",     country: "Peru",           city: "Arequipa",    startYear: 2021, hand: "RIGHT", gender: "MALE" },

  // ── Extra Asia/Pacific ───────────────────────────
  { name: "Sota Inoue",         country: "Japan",          city: "Nagoya",      startYear: 2017, hand: "RIGHT", gender: "MALE" },
  { name: "Haruka Fujii",       country: "Japan",          city: "Kobe",        startYear: 2019, hand: "LEFT",  gender: "FEMALE" },
  { name: "Jae-won Oh",         country: "South Korea",    city: "Daegu",       startYear: 2018, hand: "RIGHT", gender: "MALE" },
  { name: "Ye-jin Kim",         country: "South Korea",    city: "Gwangju",     startYear: 2020, hand: "LEFT",  gender: "FEMALE" },
  { name: "Zhang Wei",          country: "China",          city: "Chengdu",     startYear: 2019, hand: "RIGHT", gender: "MALE" },
  { name: "Wang Fang",          country: "China",          city: "Guangzhou",   startYear: 2021, hand: "LEFT",  gender: "FEMALE" },
  { name: "Rohan Sharma",       country: "India",          city: "Pune",        startYear: 2020, hand: "RIGHT", gender: "MALE" },
  { name: "Divya Menon",        country: "India",          city: "Chennai",     startYear: 2022, hand: "LEFT",  gender: "FEMALE" },
  { name: "Nathan Foster",      country: "Australia",      city: "Adelaide",    startYear: 2018, hand: "RIGHT", gender: "MALE" },
  { name: "Grace Park",         country: "New Zealand",    city: "Christchurch", startYear: 2020, hand: "RIGHT", gender: "FEMALE" },
];

// ─── Tournament definitions ──────────────────────────────────────────────────

interface TournamentDef {
  name: string;
  country: string;
  city: string;
  continentCode: string;
  dateStart: Date;
  dateEnd: Date;
  teamCount: number; // must be divisible by 3
}

const TOURNAMENT_DEFS: TournamentDef[] = [
  {
    name: "Paris Hardcourt Open 2025",
    country: "France", city: "Paris", continentCode: "EU",
    dateStart: new Date("2025-03-15"), dateEnd: new Date("2025-03-16"),
    teamCount: 12,
  },
  {
    name: "Berlin Cup 2025",
    country: "Germany", city: "Berlin", continentCode: "EU",
    dateStart: new Date("2025-04-26"), dateEnd: new Date("2025-04-27"),
    teamCount: 12,
  },
  {
    name: "North American Champs 2025",
    country: "USA", city: "Portland", continentCode: "NA",
    dateStart: new Date("2025-06-07"), dateEnd: new Date("2025-06-08"),
    teamCount: 15,
  },
  {
    name: "Tokyo Polo Fest 2025",
    country: "Japan", city: "Tokyo", continentCode: "AS",
    dateStart: new Date("2025-07-19"), dateEnd: new Date("2025-07-20"),
    teamCount: 9,
  },
  {
    name: "London Open 2025",
    country: "United Kingdom", city: "London", continentCode: "EU",
    dateStart: new Date("2025-09-06"), dateEnd: new Date("2025-09-07"),
    teamCount: 12,
  },
  {
    name: "Oceania Invitational 2025",
    country: "Australia", city: "Melbourne", continentCode: "OC",
    dateStart: new Date("2025-10-18"), dateEnd: new Date("2025-10-19"),
    teamCount: 9,
  },
  {
    name: "African Cup 2025",
    country: "South Africa", city: "Cape Town", continentCode: "AF",
    dateStart: new Date("2025-11-22"), dateEnd: new Date("2025-11-23"),
    teamCount: 9,
  },
  {
    name: "Latin America Open 2026",
    country: "Brazil", city: "São Paulo", continentCode: "SA",
    dateStart: new Date("2026-01-10"), dateEnd: new Date("2026-01-11"),
    teamCount: 12,
  },
  {
    name: "Brussels Open 2026",
    country: "Belgium", city: "Brussels", continentCode: "EU",
    dateStart: new Date("2026-02-07"), dateEnd: new Date("2026-02-08"),
    teamCount: 12,
  },
  {
    name: "Global Polo Masters 2026",
    country: "Switzerland", city: "Geneva", continentCode: "EU",
    dateStart: new Date("2026-02-21"), dateEnd: new Date("2026-02-22"),
    teamCount: 15,
  },
];

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🗑  Clearing existing data (matchEvents, matches, pools, teams, players, tournaments)...");

  await prisma.matchEvent.deleteMany();
  await prisma.match.deleteMany();
  await prisma.poolTeam.deleteMany();
  await prisma.pool.deleteMany();
  await prisma.teamPlayer.deleteMany();
  await prisma.teamMessage.deleteMany();
  await prisma.tournamentMessage.deleteMany();
  await prisma.freeAgent.deleteMany();
  await prisma.sponsor.deleteMany();
  await prisma.team.deleteMany();
  await prisma.playerAccount.deleteMany();
  // Keep operators/access codes — don't blow away admin credentials
  await prisma.player.deleteMany();
  await prisma.tournament.deleteMany();

  // ── Create players ──────────────────────────────────────────────────────
  console.log(`\n👤 Creating ${PLAYERS_DATA.length} players...`);

  const createdPlayers: { id: string; name: string; country: string; city: string | null }[] = [];

  for (const pd of PLAYERS_DATA) {
    const p = await prisma.player.create({
      data: {
        name: pd.name,
        country: pd.country,
        city: pd.city,
        startYear: pd.startYear,
        hand: pd.hand,
        gender: pd.gender as "MALE" | "FEMALE" | "NON_BINARY" | "PREFER_NOT_SAY",
        showGender: Math.random() > 0.4, // 60% show gender
        status: "ACTIVE",
        badges: [],
        bio: Math.random() > 0.5
          ? `Passioné(e) de bike polo depuis ${pd.startYear}. Toujours prêt(e) à rouler !`
          : null,
        createdAt: new Date(2025, Math.floor(Math.random() * 8), rng(1, 28)),
      },
    });
    createdPlayers.push({ id: p.id, name: p.name, country: p.country, city: p.city });
  }

  console.log(`✅ ${createdPlayers.length} players created`);

  // ── Create tournaments ──────────────────────────────────────────────────
  console.log("\n🏆 Creating tournaments and teams...");

  // Shuffle the full player pool once; we'll slice windows per tournament
  // so many players appear in multiple tournaments
  const shuffledPlayers = shuffle(createdPlayers);
  const totalPlayers = shuffledPlayers.length;

  for (let tIdx = 0; tIdx < TOURNAMENT_DEFS.length; tIdx++) {
    const def = TOURNAMENT_DEFS[tIdx];
    const teamCount = def.teamCount; // 9, 12, or 15
    const playersNeeded = teamCount * 3;

    // Rotate window so there's good overlap between tournaments
    const offset = (tIdx * 30) % totalPlayers;
    const tournamentPlayers: typeof createdPlayers = [];
    for (let i = 0; i < playersNeeded; i++) {
      tournamentPlayers.push(shuffledPlayers[(offset + i) % totalPlayers]);
    }

    const tournament = await prisma.tournament.create({
      data: {
        name: def.name,
        continentCode: def.continentCode,
        country: def.country,
        city: def.city,
        dateStart: def.dateStart,
        dateEnd: def.dateEnd,
        format: "3v3",
        gameDurationMin: 15,
        maxTeams: teamCount,
        courtsCount: teamCount >= 12 ? 2 : 1,
        registrationFeePerTeam: pick([0, 20, 25, 30, 40]),
        registrationFeeCurrency: (def.continentCode === "NA" || def.continentCode === "SA") ? "USD" : def.continentCode === "AS" ? "JPY" : "EUR",
        contactEmail: `contact@${def.city.toLowerCase().replace(/\s/g, "")}.polo`,
        saturdayFormat: "ALL_DAY",
        sundayFormat: "DE",
        status: "COMPLETED",
        locked: true,
        approved: true,
        chatMode: "OPEN",
        links: [],
        creatorId: null,
      },
    });

    // ── Create teams ────────────────────────────────────────────────────
    const teams: { id: string; playerIds: string[] }[] = [];

    for (let t = 0; t < teamCount; t++) {
      const teamPlayerSlice = tournamentPlayers.slice(t * 3, t * 3 + 3);
      const teamCountry = teamPlayerSlice[0].country;
      const teamCity = teamPlayerSlice[0].city ?? def.city;

      const team = await prisma.team.create({
        data: {
          tournamentId: tournament.id,
          name: generateTeamName(teamCity, t),
          city: teamCity,
          country: teamCountry,
          seed: t + 1,
          selected: true,
          players: {
            create: teamPlayerSlice.map((p, j) => ({
              playerId: p.id,
              isCaptain: j === 0,
            })),
          },
        },
      });
      teams.push({ id: team.id, playerIds: teamPlayerSlice.map((p) => p.id) });
    }

    // ── Create pool phase ────────────────────────────────────────────────
    // Split teams into pools of 3
    const poolCount = teamCount / 3;
    const pools: { id: string; teamIds: string[] }[] = [];

    for (let p = 0; p < poolCount; p++) {
      const pool = await prisma.pool.create({
        data: {
          tournamentId: tournament.id,
          name: String.fromCharCode(65 + p), // A, B, C, D, E
          session: "MORNING",
        },
      });
      const poolTeamSlice = teams.slice(p * 3, p * 3 + 3);
      for (const team of poolTeamSlice) {
        await prisma.poolTeam.create({ data: { poolId: pool.id, teamId: team.id } });
      }
      pools.push({ id: pool.id, teamIds: poolTeamSlice.map((t) => t.id) });
    }

    // ── Create pool matches (round-robin: 3 matches per pool) ────────────
    const allMatches: { id: string; teamAId: string; teamBId: string; scoreA: number; scoreB: number; winnerTeamId: string }[] = [];
    let matchStart = new Date(def.dateStart);
    matchStart.setHours(9, 0, 0, 0);

    for (const pool of pools) {
      const [t0, t1, t2] = pool.teamIds;
      const poolRoundRobins = [
        [t0, t1], [t1, t2], [t0, t2],
      ];

      for (const [aId, bId] of poolRoundRobins) {
        const scoreA = rng(0, 7);
        const scoreB = rng(0, 7);
        const winnerTeamId = scoreA > scoreB ? aId : scoreB > scoreA ? bId : aId; // tie → team A wins

        const match = await prisma.match.create({
          data: {
            tournamentId: tournament.id,
            phase: "POOL",
            poolId: pool.id,
            roundIndex: 0,
            positionInRound: 0,
            courtName: "Court 1",
            startAt: new Date(matchStart),
            dayIndex: "SAT",
            status: "FINISHED",
            teamAId: aId,
            teamBId: bId,
            scoreA,
            scoreB,
            winnerTeamId,
          },
        });

        allMatches.push({ id: match.id, teamAId: aId, teamBId: bId, scoreA, scoreB, winnerTeamId });

        // Advance time slot
        matchStart = new Date(matchStart.getTime() + 20 * 60 * 1000);

        // ── Create match events (goals + penalties) ───────────────────
        const teamAPlayers = teams.find((t) => t.id === aId)!.playerIds;
        const teamBPlayers = teams.find((t) => t.id === bId)!.playerIds;

        await createMatchEvents(match.id, teamAPlayers, teamBPlayers, scoreA, scoreB);
      }
    }

    // ── Bracket (DE): finals + 3rd place (simplified: just play winners) ─
    // Determine pool winners and create bracket matches
    const poolWinners = getPoolWinners(pools, allMatches);

    // Grand final: best 2 pool winners
    if (poolWinners.length >= 2) {
      const [fA, fB] = poolWinners;
      const scoreA = rng(0, 5);
      const scoreB = rng(0, 5);
      const wId = scoreA >= scoreB ? fA : fB;

      const finalMatch = await prisma.match.create({
        data: {
          tournamentId: tournament.id,
          phase: "BRACKET",
          bracketSide: "W",
          roundIndex: 0,
          positionInRound: 0,
          courtName: "Court 1",
          startAt: dateAdd(def.dateStart, 1),
          dayIndex: "SUN",
          status: "FINISHED",
          teamAId: fA,
          teamBId: fB,
          scoreA,
          scoreB,
          winnerTeamId: wId,
        },
      });

      const teamAPlayers = teams.find((t) => t.id === fA)!.playerIds;
      const teamBPlayers = teams.find((t) => t.id === fB)!.playerIds;
      await createMatchEvents(finalMatch.id, teamAPlayers, teamBPlayers, scoreA, scoreB);

      allMatches.push({ id: finalMatch.id, teamAId: fA, teamBId: fB, scoreA, scoreB, winnerTeamId: wId });
    }

    console.log(`  ✅ ${def.name}: ${teams.length} teams, ${allMatches.length} matches`);
  }

  // ── Recompute all badges ─────────────────────────────────────────────────
  console.log("\n🏅 Recomputing career badges for all players...");
  const result = await recomputeAllBadges();
  console.log(`  ✅ Badges updated: ${result.updated} players, ${result.errors} errors`);

  // ── Summary stats ────────────────────────────────────────────────────────
  const badgeSample = await prisma.player.findMany({
    where: { badges: { isEmpty: false } },
    select: { name: true, badges: true },
    orderBy: { name: "asc" },
    take: 10,
  });

  console.log("\n📊 Sample badge results:");
  for (const p of badgeSample) {
    console.log(`  ${p.name}: [${p.badges.join(", ")}]`);
  }

  const totalWithBadges = await prisma.player.count({ where: { badges: { isEmpty: false } } });
  console.log(`\n  Total players with at least 1 badge: ${totalWithBadges}/${PLAYERS_DATA.length}`);
  console.log("\n🎉 Massive seed complete!");
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TEAM_NAME_PREFIXES = [
  "Thunder", "Storm", "Iron", "Steel", "Wild", "Savage", "Urban", "Street",
  "Night", "Dark", "Fast", "Crazy", "Rogue", "Ghost", "Neon", "Rust",
];
const TEAM_NAME_SUFFIXES = [
  "Riders", "Wolves", "Foxes", "Hawks", "Bulls", "Bears", "Sharks", "Crows",
  "Kings", "Outlaws", "Rebels", "Crushers", "Hammers", "Rollers", "Smashers",
];

function generateTeamName(city: string, idx: number): string {
  const prefix = TEAM_NAME_PREFIXES[idx % TEAM_NAME_PREFIXES.length];
  const suffix = TEAM_NAME_SUFFIXES[idx % TEAM_NAME_SUFFIXES.length];
  return `${city} ${prefix} ${suffix}`;
}

function getPoolWinners(
  pools: { id: string; teamIds: string[] }[],
  matches: { teamAId: string; teamBId: string; scoreA: number; scoreB: number; winnerTeamId: string }[]
): string[] {
  const winners: string[] = [];

  for (const pool of pools) {
    const wins = new Map<string, number>();
    for (const tid of pool.teamIds) wins.set(tid, 0);

    for (const m of matches) {
      if (pool.teamIds.includes(m.teamAId) && pool.teamIds.includes(m.teamBId)) {
        wins.set(m.winnerTeamId, (wins.get(m.winnerTeamId) ?? 0) + 1);
      }
    }

    const sorted = [...wins.entries()].sort((a, b) => b[1] - a[1]);
    winners.push(sorted[0][0]);
  }

  return winners;
}

async function createMatchEvents(
  matchId: string,
  teamAPlayerIds: string[],
  teamBPlayerIds: string[],
  scoreA: number,
  scoreB: number
) {
  const events: {
    matchId: string;
    type: "GOAL" | "PENALTY";
    matchClockSec: number;
    payload: object;
  }[] = [];

  // Goals for team A
  for (let g = 0; g < scoreA; g++) {
    const scorer = pick(teamAPlayerIds);
    events.push({
      matchId,
      type: "GOAL",
      matchClockSec: rng(30, 870),
      payload: { playerId: scorer, teamId: teamAPlayerIds[0], delta: 1 },
    });
  }

  // Goals for team B
  for (let g = 0; g < scoreB; g++) {
    const scorer = pick(teamBPlayerIds);
    events.push({
      matchId,
      type: "GOAL",
      matchClockSec: rng(30, 870),
      payload: { playerId: scorer, teamId: teamBPlayerIds[0], delta: 1 },
    });
  }

  // Random penalties (0-2 per team)
  const penaltiesA = rng(0, 2);
  const penaltiesB = rng(0, 2);

  for (let p = 0; p < penaltiesA; p++) {
    events.push({
      matchId,
      type: "PENALTY",
      matchClockSec: rng(30, 870),
      payload: { playerId: pick(teamAPlayerIds), teamId: teamAPlayerIds[0] },
    });
  }
  for (let p = 0; p < penaltiesB; p++) {
    events.push({
      matchId,
      type: "PENALTY",
      matchClockSec: rng(30, 870),
      payload: { playerId: pick(teamBPlayerIds), teamId: teamBPlayerIds[0] },
    });
  }

  if (events.length > 0) {
    await prisma.matchEvent.createMany({ data: events });
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
