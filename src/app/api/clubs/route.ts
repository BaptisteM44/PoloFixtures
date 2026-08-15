import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { countryToContinentOrDefault } from "@/lib/country-utils";
import { notifyAllAdmins } from "@/lib/notify";
import { isRateLimited } from "@/lib/rate-limit";

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
  const mine = searchParams.get("mine");

  // ?mine=true → clubs où l'utilisateur est manager ou admin (tous les clubs pour ADMIN)
  if (mine === "true") {
    const session = await auth();
    const playerId = (session?.user as any)?.playerId;
    const role = (session?.user as any)?.role;
    if (!playerId && role !== "ADMIN") return Response.json([]);
    const clubs = await prisma.club.findMany({
      where: role === "ADMIN" ? {} : {
        OR: [
          { managerId: playerId },
          { admins: { some: { playerId } } },
        ],
      },
      select: { id: true, name: true, city: true, country: true, logoPath: true },
      orderBy: { name: "asc" },
    });
    return Response.json(clubs);
  }

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
  // Anti-spam : un même compte ne crée pas plus de 5 clubs / heure.
  if (isRateLimited(`create-club:${session.user.playerId}`, 5, 60 * 60 * 1000)) {
    return Response.json({ error: "Trop de clubs créés récemment, réessayez plus tard." }, { status: 429 });
  }

  const body = await request.json();
  const data = createSchema.safeParse(body);
  if (!data.success) return Response.json({ error: data.error.flatten() }, { status: 400 });

  const continentCode = countryToContinentOrDefault(data.data.country, "EU");

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

  // Notifie les admins qu'un nouveau club attend leur validation.
  notifyAllAdmins("CLUB_NEEDS_APPROVAL", {
    clubId: club.id,
    clubName: club.name,
    city: club.city,
    country: club.country,
  }).catch(() => {});

  return Response.json(club, { status: 201 });
}
