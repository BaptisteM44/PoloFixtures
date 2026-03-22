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
  USA: "NA", Canada: "NA", Mexico: "NA",
  Brazil: "SA", Argentina: "SA", Chile: "SA", Colombia: "SA", Peru: "SA",
  Uruguay: "SA", Ecuador: "SA", Bolivia: "SA", Venezuela: "SA", Paraguay: "SA",
  Japan: "AS", Singapore: "AS", "South Korea": "AS", China: "AS", India: "AS",
  Thailand: "AS", Taiwan: "AS", Philippines: "AS", Indonesia: "AS", Vietnam: "AS",
  Malaysia: "AS", Pakistan: "AS", Bangladesh: "AS", "Hong Kong": "AS",
  Australia: "OC", "New Zealand": "OC", Fiji: "OC", "Papua New Guinea": "OC",
  "South Africa": "AF", Nigeria: "AF", Kenya: "AF", Morocco: "AF", Ghana: "AF",
  Egypt: "AF", Tanzania: "AF", Senegal: "AF", "Côte d'Ivoire": "AF", Cameroon: "AF",
};

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const club = await prisma.club.findUnique({
    where: { id: params.id },
    include: {
      manager: { select: { id: true, name: true, slug: true, photoPath: true } },
      members: {
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
    updateData.continentCode = COUNTRY_TO_CONTINENT[data.data.country] ?? "EU";
  }
  if (data.data.trainingMapLink === "") {
    updateData.trainingMapLink = null;
  }

  const updated = await prisma.club.update({ where: { id: params.id }, data: updateData });
  return Response.json(updated);
}
