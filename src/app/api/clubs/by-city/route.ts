import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { COUNTRIES } from "@/lib/countries";
import { createNotification } from "@/lib/notify";
import { z } from "zod";

const querySchema = z.object({
  city: z.string().min(1).max(80),
  country: z.string().min(1),
});

const postSchema = z.object({
  city: z.string().min(1).max(80).optional(),
  country: z.string().min(1).optional(),
  clubId: z.string().min(1).optional(),
}).refine((v) => !!v.clubId || (!!v.city && !!v.country), {
  message: "clubId ou (city + country) requis",
});

function normalizeCountry(rawCountry: string): string {
  const country = rawCountry.trim();
  if (country.toLowerCase() === "usa") return "United States";
  if (country.length === 2) {
    return COUNTRIES.find((c) => c.code === country.toUpperCase())?.name ?? country;
  }
  return country;
}

// GET : propose les clubs existants d'une ville/pays (aucune creation)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    city: searchParams.get("city") ?? "",
    country: searchParams.get("country") ?? "",
  });
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const city = parsed.data.city.trim();
  const country = normalizeCountry(parsed.data.country);

  const clubs = await prisma.club.findMany({
    where: {
      approved: true,
      city: { equals: city, mode: "insensitive" },
      country: { equals: country, mode: "insensitive" },
    },
    select: { id: true, name: true, city: true, country: true, logoPath: true, approved: true },
    orderBy: { name: "asc" },
  });

  return Response.json({ clubs });
}

// POST : rejoint un club existant (par clubId ou match exact city/pays)
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.playerId) return new Response("Non autorise", { status: 401 });

  const playerId = session.user.playerId;
  const body = await request.json();
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  let club;
  if (parsed.data.clubId) {
    club = await prisma.club.findUnique({ where: { id: parsed.data.clubId } });
    if (!club || !club.approved) {
      return Response.json({ error: "CLUB_NOT_FOUND" }, { status: 404 });
    }
  } else {
    const city = parsed.data.city!.trim();
    const country = normalizeCountry(parsed.data.country!);

    const clubs = await prisma.club.findMany({
      where: {
        approved: true,
        city: { equals: city, mode: "insensitive" },
        country: { equals: country, mode: "insensitive" },
      },
      orderBy: { name: "asc" },
    });

    if (clubs.length === 0) {
      return Response.json({ error: "NO_CLUB_FOR_CITY", clubs: [] }, { status: 404 });
    }

    if (clubs.length > 1) {
      return Response.json({ error: "MULTIPLE_CLUBS_FOR_CITY", clubs }, { status: 409 });
    }

    club = clubs[0];
  }

  // Verifie si le joueur est deja membre de ce club
  const alreadyMember = await prisma.clubMember.findUnique({
    where: { clubId_playerId: { clubId: club.id, playerId } },
  });

  if (alreadyMember?.status === "MEMBER") {
    return Response.json({ club, joined: false });
  }

  // Quitte tous les autres clubs actifs d'abord
  const currentMemberships = await prisma.clubMember.findMany({
    where: { playerId, status: "MEMBER" },
    include: { club: true },
  });
  const changedClub = currentMemberships.some((membership) => membership.clubId !== club.id);

  for (const membership of currentMemberships) {
    if (membership.clubId === club.id) continue;

    // Si le joueur est manager de ce club, transfere le managership
    if (membership.club.managerId === playerId) {
      const nextManager = await prisma.clubMember.findFirst({
        where: { clubId: membership.clubId, playerId: { not: playerId }, status: "MEMBER" },
        orderBy: { joinedAt: "asc" },
      });
      if (nextManager) {
        await prisma.club.update({
          where: { id: membership.clubId },
          data: { managerId: nextManager.playerId },
        });
      }
    }

    await prisma.clubMember.delete({
      where: { clubId_playerId: { clubId: membership.clubId, playerId } },
    });
  }

  // Supprime les demandes/invitations en attente pour les autres clubs
  await prisma.clubMember.deleteMany({
    where: { playerId, clubId: { not: club.id } },
  });

  // Rejoindre le club (upsert pour gerer le cas d'une invitation/demande en attente)
  await prisma.clubMember.upsert({
    where: { clubId_playerId: { clubId: club.id, playerId } },
    update: { status: "MEMBER" },
    create: { clubId: club.id, playerId, status: "MEMBER" },
  });

  if (changedClub) {
    await prisma.player.update({ where: { id: playerId }, data: { clubLogoPath: null } });
  }

  // Notifier le manager du club qu'un nouveau membre a rejoint
  if (club.managerId && club.managerId !== playerId) {
    const player = await prisma.player.findUnique({ where: { id: playerId }, select: { name: true, slug: true } });
    if (player) {
      await createNotification(club.managerId, "CLUB_JOIN_REQUEST", {
        playerName: player.name,
        playerSlug: player.slug ?? playerId,
        clubName: club.name,
        clubId: club.id,
      });
    }
  }

  return Response.json({ club, joined: true }, { status: 201 });
}
