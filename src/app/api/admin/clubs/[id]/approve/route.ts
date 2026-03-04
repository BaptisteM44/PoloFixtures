import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") return new Response("Non autorisé", { status: 403 });

  const club = await prisma.club.update({
    where: { id: params.id },
    data: { approved: true },
  });
  return Response.json(club);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") return new Response("Non autorisé", { status: 403 });

  await prisma.club.delete({ where: { id: params.id } });
  return new Response(null, { status: 204 });
}
