import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { z } from "zod";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "Le mot de passe doit faire au moins 8 caractères"),
});

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.playerId) {
    return Response.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const account = await prisma.playerAccount.findUnique({
    where: { playerId: session.user.playerId },
  });
  if (!account) {
    return Response.json({ error: "Compte introuvable" }, { status: 404 });
  }

  const ok = await bcrypt.compare(parsed.data.currentPassword, account.passwordHash);
  if (!ok) {
    return Response.json({ error: "Mot de passe actuel incorrect" }, { status: 400 });
  }

  const newHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.playerAccount.update({
    where: { id: account.id },
    data: { passwordHash: newHash },
  });

  return Response.json({ ok: true });
}
