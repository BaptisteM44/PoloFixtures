import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const COUNTRY_TO_CONTINENT: Record<string, string> = {
  France: "EU", Germany: "EU", "United Kingdom": "EU", Spain: "EU", Italy: "EU",
  Netherlands: "EU", Belgium: "EU", Portugal: "EU", Switzerland: "EU", Austria: "EU",
  Poland: "EU", Sweden: "EU", Norway: "EU", Denmark: "EU", Finland: "EU",
  "Czech Republic": "EU", Hungary: "EU", Romania: "EU", Slovakia: "EU", Croatia: "EU",
  Ireland: "EU", Greece: "EU", Serbia: "EU", Ukraine: "EU", Turkey: "EU", Iceland: "EU",
  Luxembourg: "EU", Slovenia: "EU", Estonia: "EU", Latvia: "EU", Lithuania: "EU",
  Bulgaria: "EU",
  USA: "NA", "United States": "NA", Canada: "NA", Mexico: "NA",
  Brazil: "SA", Argentina: "SA", Chile: "SA", Colombia: "SA", Peru: "SA",
  Uruguay: "SA", Ecuador: "SA", Bolivia: "SA", Venezuela: "SA", Paraguay: "SA",
  Japan: "AS", Singapore: "AS", "South Korea": "AS", China: "AS", India: "AS",
  Thailand: "AS", Taiwan: "AS", Philippines: "AS", Indonesia: "AS", Vietnam: "AS",
  Malaysia: "AS", Pakistan: "AS", Bangladesh: "AS", "Hong Kong": "AS",
  Australia: "OC", "New Zealand": "OC", Fiji: "OC", "Papua New Guinea": "OC",
  "South Africa": "AF", Nigeria: "AF", Kenya: "AF", Morocco: "AF", Ghana: "AF",
  Egypt: "AF", Tanzania: "AF", Senegal: "AF", "Côte d'Ivoire": "AF", Cameroon: "AF",
};

const createSchema = z.object({
  name: z.string().min(2).max(80),
  city: z.string().min(1).max(80),
  country: z.string().min(1),
  description: z.string().max(500).optional().nullable(),
  website: z.string().url().optional().nullable().or(z.literal("")),
  logoPath: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const continentCode = searchParams.get("continent");
  const country = searchParams.get("country");
  const search = searchParams.get("search");

  const clubs = await prisma.club.findMany({
    where: {
      approved: true,
      ...(continentCode ? { continentCode } : {}),
      ...(country ? { country } : {}),
      ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
    },
    include: {
      manager: { select: { id: true, name: true, slug: true } },
      _count: { select: { members: { where: { status: "MEMBER" } } } },
    },
    orderBy: { name: "asc" },
  });

  return Response.json(clubs);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.playerId) {
    return new Response("Connexion requise", { status: 401 });
  }

  const body = await request.json();
  const data = createSchema.safeParse(body);
  if (!data.success) return Response.json({ error: data.error.flatten() }, { status: 400 });

  const continentCode = COUNTRY_TO_CONTINENT[data.data.country] ?? "EU";

  // Auto-geocode city+country via Nominatim
  let lat: number | null = null;
  let lng: number | null = null;
  try {
    const geoRes = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(data.data.city + ", " + data.data.country)}`,
      { headers: { "User-Agent": "poloperator.com" } }
    );
    const geoData = await geoRes.json();
    if (geoData.length > 0) {
      lat = parseFloat(geoData[0].lat);
      lng = parseFloat(geoData[0].lon);
    }
  } catch { /* geocoding is best-effort */ }

  const club = await prisma.club.create({
    data: {
      name: data.data.name,
      city: data.data.city,
      country: data.data.country,
      continentCode,
      description: data.data.description ?? null,
      website: data.data.website || null,
      logoPath: data.data.logoPath ?? null,
      lat,
      lng,
      approved: false,
      managerId: session.user.playerId,
    },
  });

  // Le manager est automatiquement member
  await prisma.clubMember.create({
    data: { clubId: club.id, playerId: session.user.playerId, status: "MEMBER" },
  });

  return Response.json(club, { status: 201 });
}
