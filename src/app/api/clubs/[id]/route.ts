import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { countryToContinentOrDefault } from "@/lib/country-utils";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const club = await prisma.club.findUnique({
    where: { id: params.id },
    include: {
      manager: { select: { id: true, name: true, slug: true, photoPath: true } },
      members: {
        where: {
          status: "MEMBER",
          player: { status: { not: "REJECTED" } },
        },
        include: {
          player: { select: { id: true, name: true, slug: true, country: true, city: true, photoPath: true } },
        },
        orderBy: { joinedAt: "asc" },
      },
    },
  });
  if (!club) return new Response("Club introuvable", { status: 404 });
  return Response.json(club);
}

const updateSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  city: z.string().min(1).max(80).optional(),
  country: z.string().min(1).optional(),
  description: z.string().max(500).optional().nullable(),
  website: z.string().optional().nullable(),
  instagram: z.string().optional().nullable(),
  logoPath: z.string().optional().nullable(),
  trainingMapLink: z.string().url().optional().nullable().or(z.literal("")),
});

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.playerId) return new Response("Non autorisé", { status: 401 });

  const club = await prisma.club.findUnique({ where: { id: params.id } });
  if (!club) return new Response("Introuvable", { status: 404 });
  // Tout membre actif du club peut modifier (pas seulement le manager)
  const membership = await prisma.clubMember.findUnique({
    where: { clubId_playerId: { clubId: params.id, playerId: session.user.playerId } },
  });
  const isMember = membership?.status === "MEMBER";
  const isAdmin = session.user.role === "ADMIN";
  if (!isMember && !isAdmin) {
    return new Response("Non autorisé", { status: 403 });
  }

  const body = await request.json();
  const data = updateSchema.safeParse(body);
  if (!data.success) return Response.json({ error: data.error.flatten() }, { status: 400 });

  const updateData: Record<string, unknown> = { ...data.data };
  if (data.data.country) {
    updateData.continentCode = countryToContinentOrDefault(data.data.country, "EU");
  }
  if (data.data.trainingMapLink === "") {
    updateData.trainingMapLink = null;
  }

  // Re-geocode if city or country changed
  if (data.data.city || data.data.country) {
    const city = data.data.city ?? club.city;
    const country = data.data.country ?? club.country;
    try {
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(city + ", " + country)}`,
        { headers: { "User-Agent": "poloperator.com" } }
      );
      const geoData = await geoRes.json();
      if (geoData.length > 0) {
        updateData.lat = parseFloat(geoData[0].lat);
        updateData.lng = parseFloat(geoData[0].lon);
      }
    } catch { /* geocoding is best-effort */ }
  }

  const updated = await prisma.club.update({ where: { id: params.id }, data: updateData });
  return Response.json(updated);
}
