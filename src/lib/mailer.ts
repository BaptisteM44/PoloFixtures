import nodemailer from "nodemailer";

const host = process.env.SMTP_HOST;
const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;
const from = process.env.SMTP_FROM ?? user ?? "no-reply@polofixtures.app";

export function isMailerConfigured() {
  return !!(host && user && pass);
}

export async function sendMail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  if (!isMailerConfigured()) {
    console.warn("[mailer] SMTP non configuré — email ignoré:", subject);
    return;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  await transporter.sendMail({ from, to, subject, html });
}
