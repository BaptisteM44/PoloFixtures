import { prisma } from "@/lib/db";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { PlayerStatus } from "@prisma/client";

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  country: z.string().min(2),
  city: z.string().optional().nullable()
});

export async function POST(req: Request) {
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
        create: { email, passwordHash }
      }
    },
    include: { account: true }
  });

  return Response.json({ playerId: player.id, email: player.account!.email }, { status: 201 });
}
