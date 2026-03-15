import { prisma } from "@/lib/db";
import { isRateLimited, getIp } from "@/lib/rate-limit";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { PlayerStatus } from "@prisma/client";
import { computeCareerBadges } from "@/lib/achievements";

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  country: z.string().min(2),
  city: z.string().optional().nullable(),
  charterAccepted: z.literal(true, { errorMap: () => ({ message: "Vous devez accepter la charte." }) }),
});

export async function POST(req: Request) {
  // Rate limit : 5 créations de compte / 30 min par IP
  if (isRateLimited(getIp(req), 5, 30 * 60 * 1000)) {
    return Response.json({ error: "Trop de tentatives, réessayez plus tard." }, { status: 429 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { name, email, password, country, city } = parsed.data;

  const existing = await prisma.playerAccount.findUnique({ where: { email } });
  if (existing) {
    return Response.json({ error: "Cette adresse email est déjà utilisée." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const player = await prisma.player.create({
    data: {
      name,
      country,
      city: city ?? null,
      status: PlayerStatus.ACTIVE,
      badges: [],
      account: {
        create: { email, passwordHash, charterAcceptedAt: new Date() }
      }
    },
    include: { account: true }
  });

  // Attribuer les badges initiaux (welcome, og, etc.)
  const initialBadges = await computeCareerBadges(player.id);
  if (initialBadges.length > 0) {
    await prisma.player.update({ where: { id: player.id }, data: { badges: initialBadges } });
  }

  return Response.json({ playerId: player.id, email: player.account!.email }, { status: 201 });
}
