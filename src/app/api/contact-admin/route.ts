import { isRateLimited, getIp } from "@/lib/rate-limit";
import { sendMail } from "@/lib/mailer";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email().max(200),
  subject: z.string().min(3).max(200),
  message: z.string().min(10).max(2000),
});

export async function POST(request: Request) {
  // Rate limit : 3 messages / 30 min par IP
  if (isRateLimited(getIp(request), 3, 30 * 60 * 1000)) {
    return Response.json({ error: "Trop de messages envoyés. Réessayez dans 30 minutes." }, { status: 429 });
  }

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "Données invalides." }, { status: 400 });
  }

  const { name, email, subject, message } = parsed.data;
  const adminEmail = process.env.ADMIN_EMAIL;

  if (!adminEmail) {
    console.warn("[contact-admin] ADMIN_EMAIL non configuré — message ignoré");
    // On répond OK quand même (comportement opaque)
    return Response.json({ ok: true });
  }

  await sendMail({
    to: adminEmail,
    subject: `[PoloFixtures] Contact : ${subject}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px;">
        <h2 style="color: #0d9488;">Message via PoloFixtures</h2>
        <table style="width:100%; border-collapse:collapse;">
          <tr><td style="padding:6px 0; font-weight:700; width:100px;">De</td><td>${name} &lt;${email}&gt;</td></tr>
          <tr><td style="padding:6px 0; font-weight:700;">Sujet</td><td>${subject}</td></tr>
        </table>
        <hr style="margin:16px 0; border:none; border-top:1px solid #e5e7eb;"/>
        <p style="white-space:pre-wrap; line-height:1.6;">${message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
        <hr style="margin:16px 0; border:none; border-top:1px solid #e5e7eb;"/>
        <p style="font-size:12px; color:#6b7280;">Envoyé depuis polo-fixtures.vercel.app</p>
      </div>
    `,
  });

  return Response.json({ ok: true });
}
