import { sendMail, isMailerConfigured } from "@/lib/mailer";

export async function GET() {
  const config = {
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS ? "***défini***" : "MANQUANT",
    SMTP_FROM: process.env.SMTP_FROM,
    configured: isMailerConfigured(),
  };

  if (!isMailerConfigured()) {
    return Response.json({ error: "SMTP non configuré", config });
  }

  try {
    await sendMail({
      to: process.env.SMTP_USER!,
      subject: "Test mail Poloperator",
      html: "<p>Si tu reçois ça, le SMTP fonctionne !</p>",
    });
    return Response.json({ ok: true, config });
  } catch (err: unknown) {
    return Response.json({ error: String(err), config }, { status: 500 });
  }
}
