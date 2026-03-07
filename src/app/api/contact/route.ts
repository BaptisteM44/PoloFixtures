import { z } from "zod";
import { sendMail, isMailerConfigured } from "@/lib/mailer";
import { isRateLimited, getIp } from "@/lib/rate-limit";

const contactSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  subject: z.string().min(1).max(200),
  message: z.string().min(10).max(3000),
});

export async function POST(req: Request) {
  if (isRateLimited(getIp(req), 3, 10 * 60 * 1000)) {
    return Response.json({ error: "Trop de tentatives. Réessayez dans 10 minutes." }, { status: 429 });
  }

  const body = await req.json();
  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { name, email, subject, message } = parsed.data;
  const adminEmail = process.env.ADMIN_EMAIL ?? "bapmorvan@gmail.com";

  if (!isMailerConfigured()) {
    // Log it server-side if SMTP not configured
    console.log("[contact]", { name, email, subject, message });
    return Response.json({ ok: true, warning: "SMTP non configuré — message enregistré en log." });
  }

  await sendMail({
    to: adminEmail,
    subject: `[Polo Fixtures] Contact : ${subject}`,
    html: `
      <h2 style="font-family:sans-serif">Message depuis Polo Fixtures</h2>
      <table style="font-family:sans-serif;font-size:14px;line-height:1.6">
        <tr><td><strong>De :</strong></td><td>${name} &lt;${email}&gt;</td></tr>
        <tr><td><strong>Sujet :</strong></td><td>${subject}</td></tr>
      </table>
      <hr style="margin:16px 0">
      <p style="font-family:sans-serif;font-size:14px;line-height:1.7;white-space:pre-wrap">${message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
      <hr style="margin:16px 0">
      <p style="font-family:sans-serif;font-size:12px;color:#888">Répondre à : <a href="mailto:${email}">${email}</a></p>
    `,
  });

  // Also send a confirmation to the sender
  await sendMail({
    to: email,
    subject: "On a bien reçu ton message — Polo Fixtures",
    html: `
      <h2 style="font-family:sans-serif">Merci ${name} !</h2>
      <p style="font-family:sans-serif;font-size:14px;line-height:1.6">
        On a bien reçu ton message et on te répondra dès que possible.
      </p>
      <blockquote style="font-family:sans-serif;font-size:13px;color:#666;border-left:3px solid #60c9cf;padding-left:12px;margin:16px 0">
        ${message.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}
      </blockquote>
      <p style="font-family:sans-serif;font-size:12px;color:#888">— L'équipe Polo Fixtures</p>
    `,
  });

  return Response.json({ ok: true });
}
