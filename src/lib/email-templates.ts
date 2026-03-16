/**
 * Email templates multilingues.
 * La langue est déduite du pays du joueur.
 */

const FR_COUNTRIES = ["FR", "BE", "CH", "LU", "MC", "SN", "CI", "CM", "MG", "ML"];
const DE_COUNTRIES = ["DE", "AT", "CH", "LI"];
const ES_COUNTRIES = ["ES", "MX", "AR", "CO", "CL", "PE", "VE", "EC", "BO", "PY", "UY", "CR", "GT", "HN", "NI", "PA", "DO", "CU"];

export function getLangFromCountry(country: string | null | undefined): "fr" | "en" | "de" | "es" {
  if (!country) return "fr";
  if (FR_COUNTRIES.includes(country)) return "fr";
  if (DE_COUNTRIES.includes(country)) return "de";
  if (ES_COUNTRIES.includes(country)) return "es";
  return "en";
}

const appUrl = process.env.NEXTAUTH_URL ?? "https://poloperator.app";

function emailWrapper(content: string) {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
      <div style="background: #1a1a1a; padding: 20px 24px; border-radius: 8px 8px 0 0;">
        <span style="color: #60c9cf; font-size: 20px; font-weight: 700; letter-spacing: 0.05em;">POLOPERATOR</span>
      </div>
      <div style="background: #f9f9f9; padding: 32px 24px; border: 1px solid #e5e5e5; border-top: none; border-radius: 0 0 8px 8px;">
        ${content}
      </div>
    </div>
  `;
}

// ── Invitation squad ──────────────────────────────────────────────────────────

export function squadInviteEmail(lang: "fr" | "en" | "de" | "es", {
  inviterName, squadName, playerName,
}: { inviterName: string; squadName: string; playerName: string }) {
  const t = {
    fr: {
      subject: `${inviterName} t'invite à rejoindre ${squadName}`,
      title: "Invitation à rejoindre une équipe",
      greeting: `Bonjour ${playerName},`,
      body: `<strong>${inviterName}</strong> t'invite à rejoindre l'équipe <strong>${squadName}</strong> sur Poloperator.`,
      cta: "Voir l'invitation",
      footer: `Tu peux accepter ou refuser depuis ton espace <a href="${appUrl}/my-teams" style="color:#60c9cf;">Mes équipes</a>.`,
    },
    en: {
      subject: `${inviterName} invites you to join ${squadName}`,
      title: "Team invitation",
      greeting: `Hi ${playerName},`,
      body: `<strong>${inviterName}</strong> has invited you to join the team <strong>${squadName}</strong> on Poloperator.`,
      cta: "View invitation",
      footer: `You can accept or decline from your <a href="${appUrl}/my-teams" style="color:#60c9cf;">My Teams</a> page.`,
    },
    de: {
      subject: `${inviterName} lädt dich ein, ${squadName} beizutreten`,
      title: "Teameinladung",
      greeting: `Hallo ${playerName},`,
      body: `<strong>${inviterName}</strong> hat dich eingeladen, dem Team <strong>${squadName}</strong> auf Poloperator beizutreten.`,
      cta: "Einladung ansehen",
      footer: `Du kannst die Einladung in deinem Bereich <a href="${appUrl}/my-teams" style="color:#60c9cf;">Meine Teams</a> annehmen oder ablehnen.`,
    },
    es: {
      subject: `${inviterName} te invita a unirte a ${squadName}`,
      title: "Invitación al equipo",
      greeting: `Hola ${playerName},`,
      body: `<strong>${inviterName}</strong> te ha invitado a unirte al equipo <strong>${squadName}</strong> en Poloperator.`,
      cta: "Ver invitación",
      footer: `Puedes aceptar o rechazar desde tu espacio <a href="${appUrl}/my-teams" style="color:#60c9cf;">Mis equipos</a>.`,
    },
  }[lang];

  return {
    subject: t.subject,
    html: emailWrapper(`
      <h2 style="margin: 0 0 16px;">${t.title}</h2>
      <p>${t.greeting}</p>
      <p>${t.body}</p>
      <p style="margin: 24px 0;">
        <a href="${appUrl}/my-teams"
           style="background:#60c9cf;color:#1a1a1a;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:700;display:inline-block;">
          ${t.cta}
        </a>
      </p>
      <p style="color:#666;font-size:12px;margin-top:32px;">${t.footer}</p>
    `),
  };
}

// ── Réinitialisation mot de passe ─────────────────────────────────────────────

export function resetPasswordEmail(lang: "fr" | "en" | "de" | "es", {
  resetUrl,
}: { resetUrl: string }) {
  const t = {
    fr: {
      subject: "Réinitialisation de votre mot de passe — Poloperator",
      title: "Réinitialisation du mot de passe",
      body: "Vous avez demandé à réinitialiser votre mot de passe.",
      cta: "Réinitialiser le mot de passe",
      expiry: "Ce lien expire dans 1 heure.",
      ignore: "Si vous n'avez pas fait cette demande, ignorez cet email.",
    },
    en: {
      subject: "Reset your password — Poloperator",
      title: "Password reset",
      body: "You requested a password reset.",
      cta: "Reset password",
      expiry: "This link expires in 1 hour.",
      ignore: "If you didn't request this, you can safely ignore this email.",
    },
    de: {
      subject: "Passwort zurücksetzen — Poloperator",
      title: "Passwort zurücksetzen",
      body: "Du hast eine Passwortzurücksetzung angefordert.",
      cta: "Passwort zurücksetzen",
      expiry: "Dieser Link läuft in 1 Stunde ab.",
      ignore: "Falls du diese Anfrage nicht gestellt hast, ignoriere diese E-Mail.",
    },
    es: {
      subject: "Restablecer tu contraseña — Poloperator",
      title: "Restablecer contraseña",
      body: "Has solicitado restablecer tu contraseña.",
      cta: "Restablecer contraseña",
      expiry: "Este enlace caduca en 1 hora.",
      ignore: "Si no hiciste esta solicitud, puedes ignorar este correo.",
    },
  }[lang];

  return {
    subject: t.subject,
    html: emailWrapper(`
      <h2 style="margin: 0 0 16px;">${t.title}</h2>
      <p>${t.body}</p>
      <p style="margin: 24px 0;">
        <a href="${resetUrl}"
           style="background:#60c9cf;color:#1a1a1a;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:700;display:inline-block;">
          ${t.cta}
        </a>
      </p>
      <p style="color:#666;font-size:12px;">${t.expiry}</p>
      <p style="color:#666;font-size:12px;">${t.ignore}</p>
    `),
  };
}

// ── Notification nouveau tournoi ──────────────────────────────────────────────

export function newTournamentEmail(lang: "fr" | "en" | "de" | "es", {
  tournamentName, city, country, dateStart, tournamentId,
}: { tournamentName: string; city: string; country: string; dateStart: string; tournamentId: string }) {
  const t = {
    fr: {
      subject: `Nouveau tournoi : ${tournamentName}`,
      title: "Nouveau tournoi disponible",
      body: `Un nouveau tournoi vient d'être publié dans ta région.`,
      cta: "Voir le tournoi",
      unsub: `Tu reçois cet email car tu as activé les notifications de nouveaux tournois. Tu peux les désactiver dans tes <a href="${appUrl}/settings/notifications" style="color:#60c9cf;">paramètres</a>.`,
    },
    en: {
      subject: `New tournament: ${tournamentName}`,
      title: "New tournament available",
      body: `A new tournament has been published in your region.`,
      cta: "View tournament",
      unsub: `You received this email because you enabled new tournament notifications. You can disable them in your <a href="${appUrl}/settings/notifications" style="color:#60c9cf;">settings</a>.`,
    },
    de: {
      subject: `Neues Turnier: ${tournamentName}`,
      title: "Neues Turnier verfügbar",
      body: `Ein neues Turnier wurde in deiner Region veröffentlicht.`,
      cta: "Turnier ansehen",
      unsub: `Du erhältst diese E-Mail, weil du Benachrichtigungen für neue Turniere aktiviert hast. Du kannst sie in deinen <a href="${appUrl}/settings/notifications" style="color:#60c9cf;">Einstellungen</a> deaktivieren.`,
    },
    es: {
      subject: `Nuevo torneo: ${tournamentName}`,
      title: "Nuevo torneo disponible",
      body: `Se ha publicado un nuevo torneo en tu región.`,
      cta: "Ver torneo",
      unsub: `Recibes este correo porque activaste las notificaciones de nuevos torneos. Puedes desactivarlas en tus <a href="${appUrl}/settings/notifications" style="color:#60c9cf;">ajustes</a>.`,
    },
  }[lang];

  return {
    subject: t.subject,
    html: emailWrapper(`
      <h2 style="margin: 0 0 16px;">${t.title}</h2>
      <p>${t.body}</p>
      <div style="background:#fff;border:1px solid #e5e5e5;border-radius:8px;padding:16px;margin:16px 0;">
        <strong style="font-size:16px;">${tournamentName}</strong>
        <p style="margin:4px 0;color:#666;font-size:13px;">📍 ${city}, ${country}</p>
        <p style="margin:4px 0;color:#666;font-size:13px;">📅 ${dateStart}</p>
      </div>
      <p style="margin: 24px 0;">
        <a href="${appUrl}/tournament/${tournamentId}"
           style="background:#60c9cf;color:#1a1a1a;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:700;display:inline-block;">
          ${t.cta}
        </a>
      </p>
      <p style="color:#666;font-size:11px;margin-top:32px;">${t.unsub}</p>
    `),
  };
}
