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

// ── Sélection d'équipe ────────────────────────────────────────────────────────

export function selectionEmail(lang: "fr" | "en" | "de" | "es", {
  teamName, tournamentName, tournamentId, tournamentSlug,
}: { teamName: string; tournamentName: string; tournamentId: string; tournamentSlug: string }) {
  const url = `${appUrl}/tournament/${tournamentSlug || tournamentId}`;
  const t = {
    fr: {
      subject: `✅ ${teamName} — Sélectionnée pour ${tournamentName}`,
      title: "🎉 Votre équipe est sélectionnée !",
      body: `Bonne nouvelle ! L'équipe <strong>${teamName}</strong> a été sélectionnée pour participer à <strong>${tournamentName}</strong>.`,
      cta: "Voir le tournoi",
    },
    en: {
      subject: `✅ ${teamName} — Selected for ${tournamentName}`,
      title: "🎉 Your team is selected!",
      body: `Great news! Team <strong>${teamName}</strong> has been selected to participate in <strong>${tournamentName}</strong>.`,
      cta: "View tournament",
    },
    de: {
      subject: `✅ ${teamName} — Ausgewählt für ${tournamentName}`,
      title: "🎉 Dein Team ist dabei!",
      body: `Super Neuigkeit! Das Team <strong>${teamName}</strong> wurde für <strong>${tournamentName}</strong> ausgewählt.`,
      cta: "Turnier ansehen",
    },
    es: {
      subject: `✅ ${teamName} — Seleccionado para ${tournamentName}`,
      title: "🎉 ¡Tu equipo ha sido seleccionado!",
      body: `¡Buenas noticias! El equipo <strong>${teamName}</strong> ha sido seleccionado para participar en <strong>${tournamentName}</strong>.`,
      cta: "Ver torneo",
    },
  }[lang];

  return {
    subject: t.subject,
    html: emailWrapper(`
      <h2 style="margin: 0 0 16px;">${t.title}</h2>
      <p>${t.body}</p>
      <p style="margin: 24px 0;">
        <a href="${url}" style="background:#60c9cf;color:#1a1a1a;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:700;display:inline-block;">
          ${t.cta}
        </a>
      </p>
      <p style="color:#666;font-size:11px;margin-top:32px;">Poloperator — <a href="${appUrl}" style="color:#60c9cf;">poloperator.com</a></p>
    `),
  };
}

// ── Liste d'attente ───────────────────────────────────────────────────────────

export function waitlistEmail(lang: "fr" | "en" | "de" | "es", {
  teamName, tournamentName, tournamentId, tournamentSlug, rank,
}: { teamName: string; tournamentName: string; tournamentId: string; tournamentSlug: string; rank: number }) {
  const url = `${appUrl}/tournament/${tournamentSlug || tournamentId}`;
  const t = {
    fr: {
      subject: `⏳ ${teamName} — Liste d'attente #${rank} pour ${tournamentName}`,
      title: `⏳ Liste d'attente #${rank}`,
      body: `L'équipe <strong>${teamName}</strong> est en liste d'attente <strong>#${rank}</strong> pour <strong>${tournamentName}</strong>. Vous serez contactés si une place se libère.`,
      cta: "Voir le tournoi",
    },
    en: {
      subject: `⏳ ${teamName} — Waitlist #${rank} for ${tournamentName}`,
      title: `⏳ Waitlist #${rank}`,
      body: `Team <strong>${teamName}</strong> is on the waitlist at position <strong>#${rank}</strong> for <strong>${tournamentName}</strong>. You'll be notified if a spot opens up.`,
      cta: "View tournament",
    },
    de: {
      subject: `⏳ ${teamName} — Warteliste #${rank} für ${tournamentName}`,
      title: `⏳ Warteliste #${rank}`,
      body: `Das Team <strong>${teamName}</strong> steht auf Warteliste Platz <strong>#${rank}</strong> für <strong>${tournamentName}</strong>. Ihr werdet benachrichtigt, wenn ein Platz frei wird.`,
      cta: "Turnier ansehen",
    },
    es: {
      subject: `⏳ ${teamName} — Lista de espera #${rank} para ${tournamentName}`,
      title: `⏳ Lista de espera #${rank}`,
      body: `El equipo <strong>${teamName}</strong> está en la lista de espera en posición <strong>#${rank}</strong> para <strong>${tournamentName}</strong>. Os avisaremos si se libera un lugar.`,
      cta: "Ver torneo",
    },
  }[lang];

  return {
    subject: t.subject,
    html: emailWrapper(`
      <h2 style="margin: 0 0 16px;">${t.title}</h2>
      <p>${t.body}</p>
      <p style="margin: 24px 0;">
        <a href="${url}" style="background:#60c9cf;color:#1a1a1a;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:700;display:inline-block;">
          ${t.cta}
        </a>
      </p>
      <p style="color:#666;font-size:11px;margin-top:32px;">Poloperator — <a href="${appUrl}" style="color:#60c9cf;">poloperator.com</a></p>
    `),
  };
}

// ── Digest tournois (cron quotidien) ──────────────────────────────────────────

type DigestTournament = { id: string; name: string; city: string; country: string; dateStart?: string; registrationEnd?: string };

export function tournamentDigestEmail(lang: "fr" | "en" | "de" | "es", {
  playerName, newTournaments, closingTournaments,
}: { playerName: string; newTournaments: DigestTournament[]; closingTournaments: DigestTournament[] }) {
  const locale = lang === "fr" ? "fr-FR" : lang === "de" ? "de-DE" : lang === "es" ? "es-ES" : "en-GB";
  const fmt = (iso: string) => new Date(iso).toLocaleDateString(locale);

  const t = {
    fr: {
      subject: (nNew: number, nClose: number) => {
        const parts = [];
        if (nNew > 0) parts.push(`${nNew} nouveau${nNew > 1 ? "x" : ""} tournoi${nNew > 1 ? "s" : ""}`);
        if (nClose > 0) parts.push(`${nClose} inscription${nClose > 1 ? "s ferment" : " ferme"} bientôt`);
        return `Bike Polo — ${parts.join(" · ")}`;
      },
      title: "Bike Polo — Actualités tournois",
      greeting: `Bonjour ${playerName},`,
      sectionNew: "🆕 Nouveaux tournois",
      sectionClosing: "⏳ Inscriptions qui ferment bientôt",
      closingDate: (d: string) => `Inscriptions jusqu'au ${fmt(d)}`,
      ctaNew: "Voir le tournoi",
      ctaRegister: "S'inscrire",
      ctaAll: "Voir tous les tournois",
      unsub: `Vous recevez cet email car vous avez activé les notifications sur Poloperator. <a href="${appUrl}/settings/notifications" style="color:#60c9cf;">Gérer mes préférences</a>`,
    },
    en: {
      subject: (nNew: number, nClose: number) => {
        const parts = [];
        if (nNew > 0) parts.push(`${nNew} new tournament${nNew > 1 ? "s" : ""}`);
        if (nClose > 0) parts.push(`${nClose} registration${nClose > 1 ? "s closing" : " closing"} soon`);
        return `Bike Polo — ${parts.join(" · ")}`;
      },
      title: "Bike Polo — Tournament news",
      greeting: `Hi ${playerName},`,
      sectionNew: "🆕 New tournaments",
      sectionClosing: "⏳ Registrations closing soon",
      closingDate: (d: string) => `Registrations close on ${fmt(d)}`,
      ctaNew: "View tournament",
      ctaRegister: "Register",
      ctaAll: "View all tournaments",
      unsub: `You receive this email because you enabled notifications on Poloperator. <a href="${appUrl}/settings/notifications" style="color:#60c9cf;">Manage preferences</a>`,
    },
    de: {
      subject: (nNew: number, nClose: number) => {
        const parts = [];
        if (nNew > 0) parts.push(`${nNew} neue${nNew > 1 ? "" : "s"} Turnier${nNew > 1 ? "e" : ""}`);
        if (nClose > 0) parts.push(`${nClose} Anmeldung${nClose > 1 ? "en schließen" : " schließt"} bald`);
        return `Bike Polo — ${parts.join(" · ")}`;
      },
      title: "Bike Polo — Turnierneuigkeiten",
      greeting: `Hallo ${playerName},`,
      sectionNew: "🆕 Neue Turniere",
      sectionClosing: "⏳ Anmeldungen schließen bald",
      closingDate: (d: string) => `Anmeldeschluss am ${fmt(d)}`,
      ctaNew: "Turnier ansehen",
      ctaRegister: "Anmelden",
      ctaAll: "Alle Turniere ansehen",
      unsub: `Du erhältst diese E-Mail, weil du Benachrichtigungen auf Poloperator aktiviert hast. <a href="${appUrl}/settings/notifications" style="color:#60c9cf;">Einstellungen verwalten</a>`,
    },
    es: {
      subject: (nNew: number, nClose: number) => {
        const parts = [];
        if (nNew > 0) parts.push(`${nNew} torneo${nNew > 1 ? "s nuevos" : " nuevo"}`);
        if (nClose > 0) parts.push(`${nClose} inscripción${nClose > 1 ? "es cierran" : " cierra"} pronto`);
        return `Bike Polo — ${parts.join(" · ")}`;
      },
      title: "Bike Polo — Noticias de torneos",
      greeting: `Hola ${playerName},`,
      sectionNew: "🆕 Nuevos torneos",
      sectionClosing: "⏳ Inscripciones que cierran pronto",
      closingDate: (d: string) => `Inscripciones hasta el ${fmt(d)}`,
      ctaNew: "Ver torneo",
      ctaRegister: "Inscribirse",
      ctaAll: "Ver todos los torneos",
      unsub: `Recibes este correo porque activaste las notificaciones en Poloperator. <a href="${appUrl}/settings/notifications" style="color:#60c9cf;">Gestionar preferencias</a>`,
    },
  }[lang];

  const newItems = newTournaments.map((tn) => `
    <div style="background:#fff;border:1px solid #e5e5e5;border-radius:8px;padding:14px 16px;margin:8px 0;">
      <strong style="font-size:15px;">${tn.name}</strong>
      <p style="margin:4px 0;color:#666;font-size:13px;">📍 ${tn.city}, ${tn.country}${tn.dateStart ? ` · 📅 ${fmt(tn.dateStart)}` : ""}</p>
      <p style="margin:8px 0 0;"><a href="${appUrl}/tournament/${tn.id}" style="color:#60c9cf;font-size:13px;font-weight:600;">${t.ctaNew} →</a></p>
    </div>`).join("");

  const closingItems = closingTournaments.map((tn) => `
    <div style="background:#fff;border:1px solid #e5e5e5;border-radius:8px;padding:14px 16px;margin:8px 0;">
      <strong style="font-size:15px;">${tn.name}</strong>
      <p style="margin:4px 0;color:#666;font-size:13px;">📍 ${tn.city}, ${tn.country}</p>
      ${tn.registrationEnd ? `<p style="margin:4px 0;color:#e07b39;font-size:13px;font-weight:600;">⏰ ${t.closingDate(tn.registrationEnd)}</p>` : ""}
      <p style="margin:8px 0 0;"><a href="${appUrl}/tournament/${tn.id}" style="color:#60c9cf;font-size:13px;font-weight:600;">${t.ctaRegister} →</a></p>
    </div>`).join("");

  const sections = [
    newTournaments.length > 0 ? `<h3 style="margin:24px 0 8px;">${t.sectionNew}</h3>${newItems}` : "",
    closingTournaments.length > 0 ? `<h3 style="margin:24px 0 8px;">${t.sectionClosing}</h3>${closingItems}` : "",
  ].join("");

  return {
    subject: t.subject(newTournaments.length, closingTournaments.length),
    html: emailWrapper(`
      <h2 style="margin: 0 0 16px;">${t.title}</h2>
      <p>${t.greeting}</p>
      ${sections}
      <p style="margin: 24px 0;">
        <a href="${appUrl}/tournaments" style="background:#60c9cf;color:#1a1a1a;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:700;display:inline-block;">
          ${t.ctaAll}
        </a>
      </p>
      <p style="color:#666;font-size:11px;margin-top:32px;">${t.unsub}</p>
    `),
  };
}

// ── Message orga (announce) ───────────────────────────────────────────────────

export function announceEmail(lang: "fr" | "en" | "de" | "es", {
  tournamentName, tournamentUrl, subject, messageHtml, recipientLabel,
}: { tournamentName: string; tournamentUrl: string; subject: string; messageHtml: string; recipientLabel: string }) {
  const t = {
    fr: { meta: `Message de l'organisation · ${recipientLabel}`, cta: "Voir le tournoi" },
    en: { meta: `Message from the organizers · ${recipientLabel}`, cta: "View tournament" },
    de: { meta: `Nachricht der Organisation · ${recipientLabel}`, cta: "Turnier ansehen" },
    es: { meta: `Mensaje de la organización · ${recipientLabel}`, cta: "Ver torneo" },
  }[lang];

  return {
    subject: `[${tournamentName}] ${subject}`,
    html: emailWrapper(`
      <h2 style="margin: 0 0 4px;">📢 ${tournamentName}</h2>
      <p style="color:#666;font-size:13px;margin:0 0 20px;">${t.meta}</p>
      <div style="background:#fff;border:1px solid #e5e5e5;border-radius:8px;padding:16px 20px;font-size:15px;line-height:1.7;">
        ${messageHtml}
      </div>
      <p style="margin: 24px 0;">
        <a href="${tournamentUrl}" style="background:#60c9cf;color:#1a1a1a;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:700;display:inline-block;">
          ${t.cta}
        </a>
      </p>
      <p style="color:#666;font-size:11px;margin-top:32px;">Poloperator — <a href="${appUrl}" style="color:#60c9cf;">poloperator.com</a></p>
    `),
  };
}

// ── Hébergement ──────────────────────────────────────────────────────────────

export function accommodationAssignedEmail(lang: "fr" | "en" | "de" | "es", {
  hostName, hostContact, tournamentName, tournamentId, tournamentSlug,
}: { hostName: string; hostContact: string | null; tournamentName: string; tournamentId: string; tournamentSlug: string | null }) {
  const url = `${appUrl}/tournament/${tournamentSlug || tournamentId}?tab=hebergement`;
  const t = {
    fr: {
      subject: `🏠 Ton hébergement pour ${tournamentName}`,
      title: "🏠 Hébergement attribué !",
      body: `Tu seras hébergé·e chez <strong>${hostName}</strong> pendant <strong>${tournamentName}</strong>.`,
      contact: hostContact ? `Contact : <strong>${hostContact}</strong>` : "",
      cta: "Voir les détails",
    },
    en: {
      subject: `🏠 Your accommodation for ${tournamentName}`,
      title: "🏠 Accommodation assigned!",
      body: `You'll be hosted by <strong>${hostName}</strong> during <strong>${tournamentName}</strong>.`,
      contact: hostContact ? `Contact: <strong>${hostContact}</strong>` : "",
      cta: "View details",
    },
    de: {
      subject: `🏠 Deine Unterkunft für ${tournamentName}`,
      title: "🏠 Unterkunft zugeteilt!",
      body: `Du wirst während <strong>${tournamentName}</strong> bei <strong>${hostName}</strong> untergebracht.`,
      contact: hostContact ? `Kontakt: <strong>${hostContact}</strong>` : "",
      cta: "Details ansehen",
    },
    es: {
      subject: `🏠 Tu alojamiento para ${tournamentName}`,
      title: "🏠 ¡Alojamiento asignado!",
      body: `Te alojarás con <strong>${hostName}</strong> durante <strong>${tournamentName}</strong>.`,
      contact: hostContact ? `Contacto: <strong>${hostContact}</strong>` : "",
      cta: "Ver detalles",
    },
  }[lang];

  return {
    subject: t.subject,
    html: emailWrapper(`
      <h2 style="margin: 0 0 16px;">${t.title}</h2>
      <p>${t.body}</p>
      ${t.contact ? `<p>${t.contact}</p>` : ""}
      <p style="margin: 24px 0;">
        <a href="${url}" style="background:#60c9cf;color:#1a1a1a;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:700;display:inline-block;">
          ${t.cta}
        </a>
      </p>
      <p style="color:#666;font-size:11px;margin-top:32px;">Poloperator — <a href="${appUrl}" style="color:#60c9cf;">poloperator.com</a></p>
    `),
  };
}

export function accommodationHostEmail(lang: "fr" | "en" | "de" | "es", {
  guestLines, tournamentName, tournamentId, tournamentSlug,
}: { guestLines: string[]; tournamentName: string; tournamentId: string; tournamentSlug: string | null }) {
  const url = `${appUrl}/tournament/${tournamentSlug || tournamentId}?tab=hebergement`;
  const list = `<ul>${guestLines.map((g) => `<li>${g}</li>`).join("")}</ul>`;
  const t = {
    fr: {
      subject: `🏠 Tes invité·es pour ${tournamentName}`,
      title: "🏠 Nouveaux invités chez toi !",
      body: `Voici les joueur·ses qui seront hébergé·es chez toi pendant <strong>${tournamentName}</strong> :`,
      cta: "Voir les détails",
    },
    en: {
      subject: `🏠 Your guests for ${tournamentName}`,
      title: "🏠 New guests at your place!",
      body: `Here are the players staying with you during <strong>${tournamentName}</strong>:`,
      cta: "View details",
    },
    de: {
      subject: `🏠 Deine Gäste für ${tournamentName}`,
      title: "🏠 Neue Gäste bei dir!",
      body: `Diese Spieler:innen übernachten während <strong>${tournamentName}</strong> bei dir:`,
      cta: "Details ansehen",
    },
    es: {
      subject: `🏠 Tus invitados para ${tournamentName}`,
      title: "🏠 ¡Nuevos invitados en tu casa!",
      body: `Estos jugadores se alojarán contigo durante <strong>${tournamentName}</strong>:`,
      cta: "Ver detalles",
    },
  }[lang];

  return {
    subject: t.subject,
    html: emailWrapper(`
      <h2 style="margin: 0 0 16px;">${t.title}</h2>
      <p>${t.body}</p>
      ${list}
      <p style="margin: 24px 0;">
        <a href="${url}" style="background:#60c9cf;color:#1a1a1a;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:700;display:inline-block;">
          ${t.cta}
        </a>
      </p>
      <p style="color:#666;font-size:11px;margin-top:32px;">Poloperator — <a href="${appUrl}" style="color:#60c9cf;">poloperator.com</a></p>
    `),
  };
}
