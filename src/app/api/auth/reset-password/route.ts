import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { z } from "zod";

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Le mot de passe doit faire au moins 8 caractères"),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const account = await prisma.playerAccount.findUnique({
    where: { resetToken: parsed.data.token },
  });

  if (!account || !account.resetTokenExpiry || account.resetTokenExpiry < new Date()) {
    return Response.json({ error: "Lien invalide ou expiré" }, { status: 400 });
  }

  const newHash = await bcrypt.hash(parsed.data.password, 12);
  await prisma.playerAccount.update({
    where: { id: account.id },
    data: {
      passwordHash: newHash,
      resetToken: null,
      resetTokenExpiry: null,
    },
  });

  return Response.json({ ok: true });
}
