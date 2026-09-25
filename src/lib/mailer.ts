import nodemailer from "nodemailer";

const host = process.env.SMTP_HOST;
const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;
const from = process.env.SMTP_FROM ?? user ?? "no-reply@poloperator.app";

export function isMailerConfigured() {
  return !!(host && user && pass);
}

// Une seule connexion SMTP partagée, un seul login, et un envoi par seconde
// au plus. Recréer un transport à chaque email = un login SMTP par destinataire :
// une annonce à tout un tournoi déclenchait des dizaines de connexions en
// quelques secondes, que Mailo bloquait comme une tentative de piratage.
let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      pool: true,
      maxConnections: 1,
      maxMessages: 100,
      rateDelta: 1000,
      rateLimit: 1,
    });
  }
  return transporter;
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

  try {
    await getTransporter().sendMail({ from, to, subject, html });
    console.log("[mailer] Email envoyé à", to, "—", subject);
  } catch (err) {
    console.error("[mailer] Échec envoi à", to, ":", err);
    throw err;
  }
}
