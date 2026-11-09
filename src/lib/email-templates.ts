/**
 * Email templates multilingues (fr, en, de, es, pt).
 *
 * Langue : celle de la page quand c'est la personne qui déclenche l'envoi
 * (mot de passe oublié, vote…) — voir requestLang() ; sinon déduite du pays du
 * joueur (getLangFromCountry), le pays pouvant être stocké en code (« FR ») ou
 * en toutes lettres (« France », « Deutschland »).
 *
 * Mise en page : celle du site (papier crème, carte blanche à bord noir et
 * « ombre » dure, bouton jaune), en tableaux + styles en ligne pour Gmail,
 * Apple Mail et Outlook.
 */

import { countryToIso } from "@/lib/country-utils";

export type EmailLang = "fr" | "en" | "de" | "es" | "pt";

const FR_COUNTRIES = ["FR", "BE", "CH", "LU", "MC", "SN", "CI", "CM", "MG", "ML", "RE", "GP", "MQ", "NC", "PF"];
const DE_COUNTRIES = ["DE", "AT", "LI"];
const ES_COUNTRIES = ["ES", "MX", "AR", "CO", "CL", "PE", "VE", "EC", "BO", "PY", "UY", "CR", "GT", "HN", "NI", "PA", "DO", "CU", "SV", "PR"];
const PT_COUNTRIES = ["PT", "BR", "AO", "MZ", "CV", "GW", "ST", "TL"];

export function getLangFromCountry(country: string | null | undefined): EmailLang {
  if (!country) return "fr";
  // Les comptes stockent le plus souvent le nom (« France ») : avant, seuls
  // les codes étaient reconnus et presque tout le monde recevait de l'anglais.
  const iso = countryToIso(country);
  if (!iso) return "en";
  if (FR_COUNTRIES.includes(iso)) return "fr";
  if (DE_COUNTRIES.includes(iso)) return "de";
  if (ES_COUNTRIES.includes(iso)) return "es";
  if (PT_COUNTRIES.includes(iso)) return "pt";
  return "en";
}

const appUrl = (process.env.NEXTAUTH_URL ?? "https://poloperator.com").replace(/\/$/, "");
const host = appUrl.replace(/^https?:\/\//, "");

// ── Mise en page commune ──────────────────────────────────────────────────────

const INK = "#1a1a1a";
const MUTED = "#666660";
const FONT = "Arial, Helvetica, sans-serif";
export const ACCENT = { yellow: "#fffc8a", teal: "#60c9cf", pink: "#ffa2af", purple: "#c9a8f5", orange: "#ffb347" } as const;
type Accent = keyof typeof ACCENT;

const FOOTER: Record<EmailLang, { tagline: string; prefs: string }> = {
  fr: { tagline: "La plateforme des tournois de bike polo", prefs: "Gérer mes notifications" },
  en: { tagline: "The bike polo tournament platform", prefs: "Manage my notifications" },
  de: { tagline: "Die Plattform für Bike-Polo-Turniere", prefs: "Benachrichtigungen verwalten" },
  es: { tagline: "La plataforma de torneos de bike polo", prefs: "Gestionar mis notificaciones" },
  pt: { tagline: "A plataforma de torneios de bike polo", prefs: "Gerir as minhas notificações" },
};

/** Bouton « à l'épreuve des clients mail » (tableau, pas de CSS externe). */
export function emailButton(label: string, url: string, accent: Accent = "yellow") {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 6px;">
      <tr><td style="background:${ACCENT[accent]};border:2px solid ${INK};border-right-width:4px;border-bottom-width:4px;border-radius:10px;">
        <a href="${url}" style="display:inline-block;padding:12px 22px;font:800 15px/1.2 ${FONT};color:${INK};text-decoration:none;">${label}&nbsp;→</a>
      </td></tr>
    </table>`;
}

/** Encadré gris (fiche tournoi, contact…). */
export function emailBox(inner: string) {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;">
      <tr><td style="background:#f0efea;border:2px solid ${INK};border-radius:10px;padding:14px 16px;font:14px/1.55 ${FONT};color:${INK};">${inner}</td></tr>
    </table>`;
}

/** Petite ligne grise (dates, lieu, rappel…). */
export const emailMeta = (text: string) => `<p style="margin:4px 0 0;font:13px/1.5 ${FONT};color:${MUTED};">${text}</p>`;

export function emailLayout({
  lang, preheader, kicker, accent = "yellow", title, body, cta, note, showPrefs = true,
}: {
  lang: EmailLang;
  /** Texte d'aperçu affiché par la boîte mail à côté du sujet */
  preheader: string;
  /** Pastille au-dessus du titre (« Sélection », « Hébergement »…) */
  kicker?: string;
  accent?: Accent;
  title: string;
  body: string;
  cta?: { label: string; url: string };
  /** Petite note sous le bouton (expiration du lien, raison de l'envoi…) */
  note?: string;
  /** Lien « Gérer mes notifications » (pas pour le mot de passe oublié) */
  showPrefs?: boolean;
}) {
  const f = FOOTER[lang];
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>Poloperator</title>
</head>
<body style="margin:0;padding:0;background:#fcfbf5;-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fcfbf5;">
  <tr><td align="center" style="padding:28px 12px 36px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
      <tr><td style="padding:0 4px 14px;">
        <a href="${appUrl}" style="text-decoration:none;color:${INK};font:800 19px/1 ${FONT};letter-spacing:0.02em;">
          <img src="${appUrl}/icons/icon-192.png" width="30" height="30" alt="" style="vertical-align:middle;border:0;border-radius:7px;margin-right:8px;">Poloperator
        </a>
      </td></tr>
      <tr><td style="background:#ffffff;border:2px solid ${INK};border-right-width:5px;border-bottom-width:5px;border-radius:14px;padding:28px 26px 26px;font:15px/1.6 ${FONT};color:${INK};">
        ${kicker ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;"><tr><td style="background:${ACCENT[accent]};border:2px solid ${INK};border-radius:6px;padding:4px 10px;font:800 11px/1.2 ${FONT};letter-spacing:0.12em;text-transform:uppercase;color:${INK};">${kicker}</td></tr></table>` : ""}
        <h1 style="margin:0 0 14px;font:800 23px/1.25 ${FONT};color:${INK};">${title}</h1>
        ${body}
        ${cta ? emailButton(cta.label, cta.url, accent) : ""}
        ${note ? `<p style="margin:18px 0 0;font:12px/1.55 ${FONT};color:${MUTED};">${note}</p>` : ""}
      </td></tr>
      <tr><td align="center" style="padding:18px 8px 0;font:12px/1.7 ${FONT};color:${MUTED};">
        <strong style="color:${INK};">Poloperator</strong> · ${f.tagline}<br>
        <a href="${appUrl}" style="color:${MUTED};">${host}</a>${showPrefs ? ` · <a href="${appUrl}/settings/notifications" style="color:${MUTED};">${f.prefs}</a>` : ""}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

const p = (html: string) => `<p style="margin:0 0 12px;">${html}</p>`;

// ── Invitation squad ──────────────────────────────────────────────────────────

export function squadInviteEmail(lang: EmailLang, {
  inviterName, squadName, playerName,
}: { inviterName: string; squadName: string; playerName: string }) {
  const t = {
    fr: { subject: `${inviterName} t'invite à rejoindre ${squadName}`, kicker: "Invitation", title: `Rejoins ${squadName} !`, greeting: `Salut ${playerName},`, body: `<strong>${inviterName}</strong> t'invite à rejoindre l'équipe <strong>${squadName}</strong> sur Poloperator.`, cta: "Voir l'invitation", note: "Tu peux accepter ou refuser depuis « Mes équipes »." },
    en: { subject: `${inviterName} invites you to join ${squadName}`, kicker: "Invitation", title: `Join ${squadName}!`, greeting: `Hi ${playerName},`, body: `<strong>${inviterName}</strong> has invited you to join the team <strong>${squadName}</strong> on Poloperator.`, cta: "View invitation", note: "You can accept or decline from “My teams”." },
    de: { subject: `${inviterName} lädt dich ein, ${squadName} beizutreten`, kicker: "Einladung", title: `Komm zu ${squadName}!`, greeting: `Hallo ${playerName},`, body: `<strong>${inviterName}</strong> hat dich eingeladen, dem Team <strong>${squadName}</strong> auf Poloperator beizutreten.`, cta: "Einladung ansehen", note: "Du kannst unter „Meine Teams“ annehmen oder ablehnen." },
    es: { subject: `${inviterName} te invita a unirte a ${squadName}`, kicker: "Invitación", title: `¡Únete a ${squadName}!`, greeting: `Hola ${playerName},`, body: `<strong>${inviterName}</strong> te ha invitado a unirte al equipo <strong>${squadName}</strong> en Poloperator.`, cta: "Ver invitación", note: "Puedes aceptar o rechazar desde «Mis equipos»." },
    pt: { subject: `${inviterName} convida-te para entrar em ${squadName}`, kicker: "Convite", title: `Junta-te a ${squadName}!`, greeting: `Olá ${playerName},`, body: `<strong>${inviterName}</strong> convidou-te para entrar na equipa <strong>${squadName}</strong> no Poloperator.`, cta: "Ver o convite", note: "Podes aceitar ou recusar em «As minhas equipas»." },
  }[lang];
  return {
    subject: t.subject,
    html: emailLayout({
      lang, preheader: t.body.replace(/<[^>]+>/g, ""), kicker: t.kicker, accent: "purple", title: t.title,
      body: p(t.greeting) + p(t.body), cta: { label: t.cta, url: `${appUrl}/my-teams` }, note: t.note,
    }),
  };
}

// ── Réinitialisation mot de passe ─────────────────────────────────────────────

export function resetPasswordEmail(lang: EmailLang, { resetUrl }: { resetUrl: string }) {
  const t = {
    fr: { subject: "Réinitialise ton mot de passe — Poloperator", title: "Nouveau mot de passe", body: "Tu as demandé à réinitialiser ton mot de passe. Clique sur le bouton pour en choisir un nouveau.", cta: "Choisir un nouveau mot de passe", note: "Ce lien expire dans 1 heure. Si tu n'as rien demandé, ignore cet email : ton mot de passe ne change pas." },
    en: { subject: "Reset your password — Poloperator", title: "New password", body: "You asked to reset your password. Click the button to choose a new one.", cta: "Choose a new password", note: "This link expires in 1 hour. If you didn't ask for this, ignore this email: your password stays the same." },
    de: { subject: "Passwort zurücksetzen — Poloperator", title: "Neues Passwort", body: "Du hast angefordert, dein Passwort zurückzusetzen. Klicke auf den Button, um ein neues zu wählen.", cta: "Neues Passwort wählen", note: "Dieser Link läuft in 1 Stunde ab. Falls du nichts angefordert hast, ignoriere diese E-Mail: dein Passwort bleibt unverändert." },
    es: { subject: "Restablece tu contraseña — Poloperator", title: "Nueva contraseña", body: "Has pedido restablecer tu contraseña. Haz clic en el botón para elegir una nueva.", cta: "Elegir una nueva contraseña", note: "Este enlace caduca en 1 hora. Si no lo has pedido, ignora este correo: tu contraseña no cambia." },
    pt: { subject: "Repõe a tua palavra-passe — Poloperator", title: "Nova palavra-passe", body: "Pediste para repor a tua palavra-passe. Clica no botão para escolher uma nova.", cta: "Escolher uma nova palavra-passe", note: "Este link expira em 1 hora. Se não pediste nada, ignora este email: a tua palavra-passe não muda." },
  }[lang];
  return {
    subject: t.subject,
    html: emailLayout({
      lang, preheader: t.body, kicker: "🔑", accent: "teal", title: t.title,
      body: p(t.body), cta: { label: t.cta, url: resetUrl }, note: t.note, showPrefs: false,
    }),
  };
}

// ── Notification nouveau tournoi ──────────────────────────────────────────────

export function newTournamentEmail(lang: EmailLang, {
  tournamentName, city, country, dateStart, tournamentId,
}: { tournamentName: string; city: string; country: string; dateStart: string; tournamentId: string }) {
  const t = {
    fr: { subject: `Nouveau tournoi : ${tournamentName}`, kicker: "Nouveau tournoi", body: "Un nouveau tournoi vient d'être publié dans ta région.", cta: "Voir le tournoi", note: "Tu reçois cet email car tu as activé les alertes de nouveaux tournois." },
    en: { subject: `New tournament: ${tournamentName}`, kicker: "New tournament", body: "A new tournament has just been published in your region.", cta: "View tournament", note: "You get this email because you turned on new tournament alerts." },
    de: { subject: `Neues Turnier: ${tournamentName}`, kicker: "Neues Turnier", body: "In deiner Region wurde gerade ein neues Turnier veröffentlicht.", cta: "Turnier ansehen", note: "Du bekommst diese E-Mail, weil du Benachrichtigungen für neue Turniere aktiviert hast." },
    es: { subject: `Nuevo torneo: ${tournamentName}`, kicker: "Nuevo torneo", body: "Se acaba de publicar un nuevo torneo en tu región.", cta: "Ver torneo", note: "Recibes este correo porque activaste los avisos de nuevos torneos." },
    pt: { subject: `Novo torneio: ${tournamentName}`, kicker: "Novo torneio", body: "Acaba de ser publicado um novo torneio na tua região.", cta: "Ver o torneio", note: "Recebes este email porque ativaste os alertas de novos torneios." },
  }[lang];
  return {
    subject: t.subject,
    html: emailLayout({
      lang, preheader: `${tournamentName} · ${city} · ${dateStart}`, kicker: t.kicker, accent: "teal", title: tournamentName,
      body: p(t.body) + emailBox(`<strong style="font-size:16px;">${tournamentName}</strong>${emailMeta(`📍 ${city}, ${country}`)}${emailMeta(`📅 ${dateStart}`)}`),
      cta: { label: t.cta, url: `${appUrl}/tournament/${tournamentId}` }, note: t.note,
    }),
  };
}

// ── Sélection d'équipe ────────────────────────────────────────────────────────

export function selectionEmail(lang: EmailLang, {
  teamName, tournamentName, tournamentId, tournamentSlug,
}: { teamName: string; tournamentName: string; tournamentId: string; tournamentSlug: string }) {
  const url = `${appUrl}/tournament/${tournamentSlug || tournamentId}`;
  const t = {
    fr: { subject: `✅ ${teamName} est sélectionnée pour ${tournamentName}`, kicker: "Sélection", title: "🎉 Ton équipe est sélectionnée !", body: `Bonne nouvelle : l'équipe <strong>${teamName}</strong> jouera <strong>${tournamentName}</strong>. On se voit sur le terrain !`, cta: "Voir le tournoi" },
    en: { subject: `✅ ${teamName} is selected for ${tournamentName}`, kicker: "Selection", title: "🎉 Your team is in!", body: `Great news: team <strong>${teamName}</strong> will play <strong>${tournamentName}</strong>. See you on court!`, cta: "View tournament" },
    de: { subject: `✅ ${teamName} ist bei ${tournamentName} dabei`, kicker: "Auswahl", title: "🎉 Dein Team ist dabei!", body: `Super Neuigkeit: das Team <strong>${teamName}</strong> spielt bei <strong>${tournamentName}</strong>. Wir sehen uns auf dem Court!`, cta: "Turnier ansehen" },
    es: { subject: `✅ ${teamName} está seleccionado para ${tournamentName}`, kicker: "Selección", title: "🎉 ¡Tu equipo está dentro!", body: `Buenas noticias: el equipo <strong>${teamName}</strong> jugará <strong>${tournamentName}</strong>. ¡Nos vemos en la pista!`, cta: "Ver torneo" },
    pt: { subject: `✅ ${teamName} foi selecionada para ${tournamentName}`, kicker: "Seleção", title: "🎉 A tua equipa está dentro!", body: `Boas notícias: a equipa <strong>${teamName}</strong> vai jogar <strong>${tournamentName}</strong>. Até já no campo!`, cta: "Ver o torneio" },
  }[lang];
  return {
    subject: t.subject,
    html: emailLayout({ lang, preheader: t.body.replace(/<[^>]+>/g, ""), kicker: t.kicker, accent: "yellow", title: t.title, body: p(t.body), cta: { label: t.cta, url } }),
  };
}

// ── Liste d'attente ───────────────────────────────────────────────────────────

export function waitlistEmail(lang: EmailLang, {
  teamName, tournamentName, tournamentId, tournamentSlug, rank,
}: { teamName: string; tournamentName: string; tournamentId: string; tournamentSlug: string; rank: number }) {
  const url = `${appUrl}/tournament/${tournamentSlug || tournamentId}`;
  const t = {
    fr: { subject: `⏳ ${teamName} — liste d'attente n°${rank} pour ${tournamentName}`, kicker: "Liste d'attente", title: `⏳ Liste d'attente n°${rank}`, body: `L'équipe <strong>${teamName}</strong> est n°<strong>${rank}</strong> sur la liste d'attente de <strong>${tournamentName}</strong>. Tu seras prévenu·e si une place se libère.`, cta: "Voir le tournoi" },
    en: { subject: `⏳ ${teamName} — waitlist #${rank} for ${tournamentName}`, kicker: "Waitlist", title: `⏳ Waitlist #${rank}`, body: `Team <strong>${teamName}</strong> is <strong>#${rank}</strong> on the waitlist for <strong>${tournamentName}</strong>. You'll hear from us if a spot opens up.`, cta: "View tournament" },
    de: { subject: `⏳ ${teamName} — Warteliste Nr. ${rank} für ${tournamentName}`, kicker: "Warteliste", title: `⏳ Warteliste Nr. ${rank}`, body: `Das Team <strong>${teamName}</strong> ist Nr. <strong>${rank}</strong> auf der Warteliste für <strong>${tournamentName}</strong>. Du wirst benachrichtigt, wenn ein Platz frei wird.`, cta: "Turnier ansehen" },
    es: { subject: `⏳ ${teamName} — lista de espera n.º ${rank} para ${tournamentName}`, kicker: "Lista de espera", title: `⏳ Lista de espera n.º ${rank}`, body: `El equipo <strong>${teamName}</strong> es el n.º <strong>${rank}</strong> en la lista de espera de <strong>${tournamentName}</strong>. Te avisaremos si se libera una plaza.`, cta: "Ver torneo" },
    pt: { subject: `⏳ ${teamName} — lista de espera n.º ${rank} para ${tournamentName}`, kicker: "Lista de espera", title: `⏳ Lista de espera n.º ${rank}`, body: `A equipa <strong>${teamName}</strong> é a n.º <strong>${rank}</strong> na lista de espera de <strong>${tournamentName}</strong>. Vais ser avisado·a se abrir uma vaga.`, cta: "Ver o torneio" },
  }[lang];
  return {
    subject: t.subject,
    html: emailLayout({ lang, preheader: t.body.replace(/<[^>]+>/g, ""), kicker: t.kicker, accent: "orange", title: t.title, body: p(t.body), cta: { label: t.cta, url } }),
  };
}

// ── Digest tournois (cron quotidien) ──────────────────────────────────────────

type DigestTournament = { id: string; name: string; city: string; country: string; dateStart?: string; registrationEnd?: string };

const DATE_LOCALE: Record<EmailLang, string> = { fr: "fr-FR", en: "en-GB", de: "de-DE", es: "es-ES", pt: "pt-PT" };

export function tournamentDigestEmail(lang: EmailLang, {
  playerName, newTournaments, closingTournaments,
}: { playerName: string; newTournaments: DigestTournament[]; closingTournaments: DigestTournament[] }) {
  const fmt = (iso: string) => new Date(iso).toLocaleDateString(DATE_LOCALE[lang], { day: "numeric", month: "long", year: "numeric" });
  const plural = (n: number, one: string, many: string) => (n > 1 ? many : one).replace("#", String(n));

  const t = {
    fr: {
      subject: (a: number, b: number) => [a && plural(a, "# nouveau tournoi", "# nouveaux tournois"), b && plural(b, "# inscription ferme bientôt", "# inscriptions ferment bientôt")].filter(Boolean).join(" · "),
      kicker: "Bike polo", title: "Les nouvelles des tournois", greeting: `Salut ${playerName},`,
      sectionNew: "🆕 Nouveaux tournois", sectionClosing: "⏳ Inscriptions qui ferment bientôt",
      closingDate: (d: string) => `Inscriptions jusqu'au ${fmt(d)}`, ctaNew: "Voir le tournoi", ctaRegister: "S'inscrire", ctaAll: "Voir tous les tournois",
      note: "Tu reçois cet email car tu as activé les alertes de tournois sur Poloperator.",
    },
    en: {
      subject: (a: number, b: number) => [a && plural(a, "# new tournament", "# new tournaments"), b && plural(b, "# registration closing soon", "# registrations closing soon")].filter(Boolean).join(" · "),
      kicker: "Bike polo", title: "Tournament news", greeting: `Hi ${playerName},`,
      sectionNew: "🆕 New tournaments", sectionClosing: "⏳ Registrations closing soon",
      closingDate: (d: string) => `Registration closes on ${fmt(d)}`, ctaNew: "View tournament", ctaRegister: "Register", ctaAll: "View all tournaments",
      note: "You get this email because you turned on tournament alerts on Poloperator.",
    },
    de: {
      subject: (a: number, b: number) => [a && plural(a, "# neues Turnier", "# neue Turniere"), b && plural(b, "# Anmeldung schließt bald", "# Anmeldungen schließen bald")].filter(Boolean).join(" · "),
      kicker: "Bike Polo", title: "Turnierneuigkeiten", greeting: `Hallo ${playerName},`,
      sectionNew: "🆕 Neue Turniere", sectionClosing: "⏳ Anmeldungen schließen bald",
      closingDate: (d: string) => `Anmeldeschluss am ${fmt(d)}`, ctaNew: "Turnier ansehen", ctaRegister: "Anmelden", ctaAll: "Alle Turniere ansehen",
      note: "Du bekommst diese E-Mail, weil du Turnier-Benachrichtigungen auf Poloperator aktiviert hast.",
    },
    es: {
      subject: (a: number, b: number) => [a && plural(a, "# torneo nuevo", "# torneos nuevos"), b && plural(b, "# inscripción cierra pronto", "# inscripciones cierran pronto")].filter(Boolean).join(" · "),
      kicker: "Bike polo", title: "Novedades de torneos", greeting: `Hola ${playerName},`,
      sectionNew: "🆕 Torneos nuevos", sectionClosing: "⏳ Inscripciones que cierran pronto",
      closingDate: (d: string) => `Inscripciones hasta el ${fmt(d)}`, ctaNew: "Ver torneo", ctaRegister: "Inscribirse", ctaAll: "Ver todos los torneos",
      note: "Recibes este correo porque activaste los avisos de torneos en Poloperator.",
    },
    pt: {
      subject: (a: number, b: number) => [a && plural(a, "# torneio novo", "# torneios novos"), b && plural(b, "# inscrição fecha em breve", "# inscrições fecham em breve")].filter(Boolean).join(" · "),
      kicker: "Bike polo", title: "Novidades dos torneios", greeting: `Olá ${playerName},`,
      sectionNew: "🆕 Torneios novos", sectionClosing: "⏳ Inscrições a fechar em breve",
      closingDate: (d: string) => `Inscrições até ${fmt(d)}`, ctaNew: "Ver o torneio", ctaRegister: "Inscrever-me", ctaAll: "Ver todos os torneios",
      note: "Recebes este email porque ativaste os alertas de torneios no Poloperator.",
    },
  }[lang];

  const card = (tn: DigestTournament, extra: string, link: string) => emailBox(
    `<strong style="font-size:15px;">${tn.name}</strong>
     ${emailMeta(`📍 ${tn.city}, ${tn.country}${tn.dateStart ? ` · 📅 ${fmt(tn.dateStart)}` : ""}`)}
     ${extra}
     <p style="margin:8px 0 0;"><a href="${appUrl}/tournament/${tn.id}" style="font:700 13px ${FONT};color:${INK};">${link}&nbsp;→</a></p>`,
  );
  const h2 = (s: string) => `<h2 style="margin:22px 0 4px;font:800 16px/1.3 ${FONT};color:${INK};">${s}</h2>`;
  const sections = [
    newTournaments.length ? h2(t.sectionNew) + newTournaments.map((tn) => card(tn, "", t.ctaNew)).join("") : "",
    closingTournaments.length ? h2(t.sectionClosing) + closingTournaments.map((tn) => card(tn,
      tn.registrationEnd ? `<p style="margin:4px 0 0;font:700 13px ${FONT};color:#c2410c;">⏰ ${t.closingDate(tn.registrationEnd)}</p>` : "", t.ctaRegister)).join("") : "",
  ].join("");

  const subject = `Bike Polo — ${t.subject(newTournaments.length, closingTournaments.length)}`;
  return {
    subject,
    html: emailLayout({
      lang, preheader: [...newTournaments, ...closingTournaments].map((x) => x.name).slice(0, 3).join(" · "),
      kicker: t.kicker, accent: "teal", title: t.title,
      body: p(t.greeting) + sections, cta: { label: t.ctaAll, url: `${appUrl}/tournaments` }, note: t.note,
    }),
  };
}

// ── Message orga (announce) ───────────────────────────────────────────────────

export function announceEmail(lang: EmailLang, {
  tournamentName, tournamentUrl, subject, messageHtml, recipientLabel,
}: { tournamentName: string; tournamentUrl: string; subject: string; messageHtml: string; recipientLabel: string }) {
  const t = {
    fr: { kicker: "Message de l'orga", meta: `Envoyé à : ${recipientLabel}`, cta: "Voir le tournoi" },
    en: { kicker: "From the organizers", meta: `Sent to: ${recipientLabel}`, cta: "View tournament" },
    de: { kicker: "Von der Orga", meta: `Gesendet an: ${recipientLabel}`, cta: "Turnier ansehen" },
    es: { kicker: "De la organización", meta: `Enviado a: ${recipientLabel}`, cta: "Ver torneo" },
    pt: { kicker: "Da organização", meta: `Enviado para: ${recipientLabel}`, cta: "Ver o torneio" },
  }[lang];
  return {
    subject: `[${tournamentName}] ${subject}`,
    html: emailLayout({
      lang, preheader: subject, kicker: `📢 ${t.kicker}`, accent: "pink", title: tournamentName,
      body: emailMeta(t.meta) + emailBox(`<div style="font-size:15px;line-height:1.7;">${messageHtml}</div>`),
      cta: { label: t.cta, url: tournamentUrl },
    }),
  };
}

// ── Hébergement ──────────────────────────────────────────────────────────────

export function accommodationAssignedEmail(lang: EmailLang, {
  hostName, hostContact, tournamentName, tournamentId, tournamentSlug,
}: { hostName: string; hostContact: string | null; tournamentName: string; tournamentId: string; tournamentSlug: string | null }) {
  const url = `${appUrl}/tournament/${tournamentSlug || tournamentId}?tab=hebergement`;
  const t = {
    fr: { subject: `🏠 Ton hébergement pour ${tournamentName}`, kicker: "Hébergement", title: "🏠 Tu as un toit !", body: `Tu seras hébergé·e chez <strong>${hostName}</strong> pendant <strong>${tournamentName}</strong>.`, contact: "Contact", cta: "Voir les détails" },
    en: { subject: `🏠 Your accommodation for ${tournamentName}`, kicker: "Accommodation", title: "🏠 You've got a place to stay!", body: `You'll be hosted by <strong>${hostName}</strong> during <strong>${tournamentName}</strong>.`, contact: "Contact", cta: "View details" },
    de: { subject: `🏠 Deine Unterkunft für ${tournamentName}`, kicker: "Unterkunft", title: "🏠 Du hast eine Unterkunft!", body: `Du übernachtest während <strong>${tournamentName}</strong> bei <strong>${hostName}</strong>.`, contact: "Kontakt", cta: "Details ansehen" },
    es: { subject: `🏠 Tu alojamiento para ${tournamentName}`, kicker: "Alojamiento", title: "🏠 ¡Ya tienes dónde dormir!", body: `Te alojarás con <strong>${hostName}</strong> durante <strong>${tournamentName}</strong>.`, contact: "Contacto", cta: "Ver detalles" },
    pt: { subject: `🏠 O teu alojamento para ${tournamentName}`, kicker: "Alojamento", title: "🏠 Já tens onde ficar!", body: `Vais ficar em casa de <strong>${hostName}</strong> durante <strong>${tournamentName}</strong>.`, contact: "Contacto", cta: "Ver detalhes" },
  }[lang];
  return {
    subject: t.subject,
    html: emailLayout({
      lang, preheader: t.body.replace(/<[^>]+>/g, ""), kicker: t.kicker, accent: "purple", title: t.title,
      body: p(t.body) + (hostContact ? emailBox(`<strong>${t.contact} :</strong> ${hostContact}`) : ""),
      cta: { label: t.cta, url },
    }),
  };
}

export function accommodationHostEmail(lang: EmailLang, {
  guestLines, tournamentName, tournamentId, tournamentSlug,
}: { guestLines: string[]; tournamentName: string; tournamentId: string; tournamentSlug: string | null }) {
  const url = `${appUrl}/tournament/${tournamentSlug || tournamentId}?tab=hebergement`;
  const list = `<ul style="margin:0;padding-left:20px;">${guestLines.map((g) => `<li style="margin:2px 0;">${g}</li>`).join("")}</ul>`;
  const t = {
    fr: { subject: `🏠 Tes invité·es pour ${tournamentName}`, kicker: "Hébergement", title: "🏠 Du monde chez toi !", body: `Voici les joueur·ses que tu héberges pendant <strong>${tournamentName}</strong> — merci !`, cta: "Voir les détails" },
    en: { subject: `🏠 Your guests for ${tournamentName}`, kicker: "Accommodation", title: "🏠 Guests at your place!", body: `Here are the players staying with you during <strong>${tournamentName}</strong> — thank you!`, cta: "View details" },
    de: { subject: `🏠 Deine Gäste für ${tournamentName}`, kicker: "Unterkunft", title: "🏠 Gäste bei dir!", body: `Diese Spieler:innen übernachten während <strong>${tournamentName}</strong> bei dir — danke!`, cta: "Details ansehen" },
    es: { subject: `🏠 Tus invitados para ${tournamentName}`, kicker: "Alojamiento", title: "🏠 ¡Invitados en tu casa!", body: `Estos jugadores se alojan contigo durante <strong>${tournamentName}</strong>. ¡Gracias!`, cta: "Ver detalles" },
    pt: { subject: `🏠 Os teus convidados para ${tournamentName}`, kicker: "Alojamento", title: "🏠 Convidados em tua casa!", body: `Estes jogadores ficam contigo durante <strong>${tournamentName}</strong>. Obrigado!`, cta: "Ver detalhes" },
  }[lang];
  return {
    subject: t.subject,
    html: emailLayout({
      lang, preheader: t.body.replace(/<[^>]+>/g, ""), kicker: t.kicker, accent: "purple", title: t.title,
      body: p(t.body) + emailBox(list), cta: { label: t.cta, url },
    }),
  };
}

// ── Confirmation de vote (sondage) ───────────────────────────────────────────

export function pollVoteConfirmEmail(lang: EmailLang, { confirmUrl, pollQuestion }: { confirmUrl: string; pollQuestion?: string | null }) {
  const t = {
    fr: { subject: "Confirme ton vote — Poloperator", kicker: "Sondage", title: "Confirme ton vote", body: "Merci de participer au sondage de la communauté bike polo ! Clique sur le bouton pour valider ton vote.", cta: "Confirmer mon vote", note: "Ce lien est valable 48 h. Si tu n'as pas voté, ignore cet email." },
    en: { subject: "Confirm your vote — Poloperator", kicker: "Poll", title: "Confirm your vote", body: "Thanks for taking part in the bike polo community poll! Click the button to confirm your vote.", cta: "Confirm my vote", note: "This link is valid for 48 hours. If you didn't vote, ignore this email." },
    de: { subject: "Bestätige deine Stimme — Poloperator", kicker: "Umfrage", title: "Bestätige deine Stimme", body: "Danke, dass du bei der Umfrage der Bike-Polo-Community mitmachst! Klicke auf den Button, um deine Stimme zu bestätigen.", cta: "Stimme bestätigen", note: "Dieser Link ist 48 Stunden gültig. Falls du nicht abgestimmt hast, ignoriere diese E-Mail." },
    es: { subject: "Confirma tu voto — Poloperator", kicker: "Encuesta", title: "Confirma tu voto", body: "¡Gracias por participar en la encuesta de la comunidad de bike polo! Haz clic en el botón para validar tu voto.", cta: "Confirmar mi voto", note: "Este enlace es válido 48 h. Si no has votado, ignora este correo." },
    pt: { subject: "Confirma o teu voto — Poloperator", kicker: "Sondagem", title: "Confirma o teu voto", body: "Obrigado por participares na sondagem da comunidade de bike polo! Clica no botão para validar o teu voto.", cta: "Confirmar o meu voto", note: "Este link é válido durante 48 h. Se não votaste, ignora este email." },
  }[lang];
  return {
    subject: t.subject,
    html: emailLayout({
      lang, preheader: t.body, kicker: `🗳️ ${t.kicker}`, accent: "teal", title: t.title,
      body: (pollQuestion ? emailBox(`<strong>${pollQuestion}</strong>`) : "") + p(t.body),
      cta: { label: t.cta, url: confirmUrl }, note: t.note, showPrefs: false,
    }),
  };
}
