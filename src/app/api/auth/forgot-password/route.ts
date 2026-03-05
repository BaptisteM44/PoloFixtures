import { prisma } from "@/lib/db";
import { sendMail, isMailerConfigured } from "@/lib/mailer";
import { isRateLimited, getIp } from "@/lib/rate-limit";
import { randomBytes } from "crypto";
import { z } from "zod";

const schema = z.object({ email: z.string().email() });

export async function POST(req: Request) {
  // Rate limit : 5 demandes / 15 min par IP
  if (isRateLimited(getIp(req), 5, 15 * 60 * 1000)) {
    return Response.json({ ok: true }); // réponse opaque pour ne pas confirmer l'IP bloquée
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Email invalide" }, { status: 400 });
  }

  const account = await prisma.playerAccount.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
  });

  // Toujours répondre OK pour éviter l'énumération des emails
  if (!account) {
    return Response.json({ ok: true });
  }

  // Génère un token aléatoire
  const token = randomBytes(32).toString("hex");
  const expiry = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1h

  await prisma.playerAccount.update({
    where: { id: account.id },
    data: { resetToken: token, resetTokenExpiry: expiry },
  });

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  const resetUrl = `${baseUrl}/reset-password/${token}`;

  if (isMailerConfigured()) {
    await sendMail({
      to: account.email,
      subject: "Réinitialisation de votre mot de passe — PoloFixtures",
      html: `
        <p>Bonjour,</p>
        <p>Vous avez demandé à réinitialiser votre mot de passe.</p>
        <p><a href="${resetUrl}" style="color:#14b8a6">Cliquez ici pour définir un nouveau mot de passe</a></p>
        <p>Ce lien est valable 1 heure. Si vous n'avez pas fait cette demande, ignorez cet email.</p>
        <p style="color:#888;font-size:12px">PoloFixtures</p>
      `,
    });
  } else {
    // Dev : affiche le lien dans les logs serveur
    console.info("[reset-password] Lien (SMTP non configuré):", resetUrl);
  }

  return Response.json({ ok: true });
}
