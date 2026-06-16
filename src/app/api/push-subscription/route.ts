import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { z } from "zod";

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
});

// POST /api/push-subscription — save push subscription
export async function POST(request: Request) {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!playerId) return NextResponse.json({ error: "Non connecte" }, { status: 401 });

  const body = await request.json();
  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });

  const { endpoint, keys } = parsed.data;

  // Upsert: if endpoint already exists, update it
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { playerId, p256dh: keys.p256dh, auth: keys.auth },
    create: { playerId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
  });

  return NextResponse.json({ ok: true });
}

// DELETE /api/push-subscription — remove push subscription
export async function DELETE(request: Request) {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!playerId) return NextResponse.json({ error: "Non connecte" }, { status: 401 });

  const { endpoint } = await request.json();
  if (!endpoint) return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });

  await prisma.pushSubscription.deleteMany({
    where: { playerId, endpoint },
  });

  return NextResponse.json({ ok: true });
}
