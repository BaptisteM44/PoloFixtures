/**
 * Messages d'erreur des routes API, traduits dans la langue du visiteur.
 * Avant, ~100 phrases en français remontaient telles quelles à tous les
 * joueurs (« Vous êtes déjà inscrit à ce tournoi », « Non connecté »…).
 *
 * La langue vient de la page d'où part la requête (Referer /en/…), sinon du
 * cookie NEXT_LOCALE, sinon de l'en-tête Accept-Language ; français par défaut
 * (et hors requête, ex. tests).
 */
import { cookies, headers } from "next/headers";

type Lang = "fr" | "en" | "de" | "es";
const LANGS: Lang[] = ["fr", "en", "de", "es"];

const MESSAGES = {
  not_logged_in: { fr: "Non connecté", en: "Not logged in", de: "Nicht angemeldet", es: "No has iniciado sesión" },
  login_required: { fr: "Connexion requise", en: "Login required", de: "Anmeldung erforderlich", es: "Tienes que iniciar sesión" },
  not_authorized: { fr: "Non autorisé", en: "Not allowed", de: "Nicht erlaubt", es: "No autorizado" },
  not_found: { fr: "Introuvable", en: "Not found", de: "Nicht gefunden", es: "No encontrado" },
  access_denied: { fr: "Accès refusé", en: "Access denied", de: "Zugriff verweigert", es: "Acceso denegado" },
  invalid_data: { fr: "Données invalides", en: "Invalid data", de: "Ungültige Daten", es: "Datos no válidos" },
  admins_only: { fr: "Réservé aux administrateurs", en: "Admins only", de: "Nur für Admins", es: "Solo para administradores" },
  tournament_not_found: { fr: "Tournoi introuvable", en: "Tournament not found", de: "Turnier nicht gefunden", es: "Torneo no encontrado" },
  club_not_found: { fr: "Club introuvable", en: "Club not found", de: "Club nicht gefunden", es: "Club no encontrado" },
  poll_not_found: { fr: "Sondage introuvable", en: "Poll not found", de: "Umfrage nicht gefunden", es: "Encuesta no encontrada" },
  player_not_found: { fr: "Joueur introuvable", en: "Player not found", de: "Person nicht gefunden", es: "Jugador no encontrado" },
  message_not_found: { fr: "Message introuvable", en: "Message not found", de: "Nachricht nicht gefunden", es: "Mensaje no encontrado" },
  captain_required: { fr: "Capitaine requis", en: "Captain only", de: "Nur für Captains", es: "Solo para capitanes" },
  invalid_message: { fr: "Message invalide", en: "Invalid message", de: "Ungültige Nachricht", es: "Mensaje no válido" },
  name_required: { fr: "Nom requis", en: "Name required", de: "Name erforderlich", es: "Nombre obligatorio" },
  already_member_or_pending: { fr: "Déjà membre ou demande en cours", en: "Already a member or request pending", de: "Bereits Mitglied oder Anfrage läuft", es: "Ya eres miembro o hay una solicitud en curso" },
  too_many_attempts: { fr: "Trop de tentatives, réessayez plus tard.", en: "Too many attempts, try again later.", de: "Zu viele Versuche, versuche es später erneut.", es: "Demasiados intentos, inténtalo más tarde." },
  forbidden: { fr: "Interdit", en: "Forbidden", de: "Verboten", es: "Prohibido" },
  conversation_not_found: { fr: "Conversation introuvable", en: "Conversation not found", de: "Unterhaltung nicht gefunden", es: "Conversación no encontrada" },
  not_team_member: { fr: "Pas membre de cette équipe", en: "Not a member of this team", de: "Kein Mitglied dieses Teams", es: "No eres miembro de este equipo" },
  registration_not_open: { fr: "Les inscriptions ne sont pas encore ouvertes.", en: "Registration isn't open yet.", de: "Die Anmeldung ist noch nicht geöffnet.", es: "Las inscripciones aún no están abiertas." },
  channel_not_found: { fr: "Canal introuvable", en: "Channel not found", de: "Kanal nicht gefunden", es: "Canal no encontrado" },
  too_many_attempts_10min: { fr: "Trop de tentatives. Réessayez dans 10 minutes.", en: "Too many attempts. Try again in 10 minutes.", de: "Zu viele Versuche. Versuche es in 10 Minuten erneut.", es: "Demasiados intentos. Inténtalo en 10 minutos." },
  too_many_clubs: { fr: "Trop de clubs créés récemment, réessayez plus tard.", en: "Too many clubs created recently, try again later.", de: "Zu viele Clubs in letzter Zeit erstellt, versuche es später erneut.", es: "Demasiados clubes creados recientemente, inténtalo más tarde." },
  club_pending_approval: { fr: "Club en attente d'approbation", en: "Club awaiting approval", de: "Club wartet auf Freigabe", es: "Club pendiente de aprobación" },
  club_manager_only: { fr: "Réservé au manager du club", en: "Club manager only", de: "Nur für die Club-Leitung", es: "Solo para el responsable del club" },
  already_member_or_invited: { fr: "Déjà membre ou invitation en cours", en: "Already a member or invitation pending", de: "Bereits Mitglied oder Einladung läuft", es: "Ya es miembro o hay una invitación en curso" },
  player_only: { fr: "Réservé au joueur concerné", en: "Only the player concerned can do this", de: "Nur die betroffene Person", es: "Solo el jugador en cuestión" },
  missing_data: { fr: "Données manquantes", en: "Missing data", de: "Fehlende Daten", es: "Faltan datos" },
  email_taken: { fr: "Cette adresse email est déjà utilisée.", en: "This email address is already in use.", de: "Diese E-Mail-Adresse wird bereits verwendet.", es: "Este correo ya está en uso." },
  invalid_email: { fr: "Email invalide", en: "Invalid email", de: "Ungültige E-Mail", es: "Correo no válido" },
  invalid_or_expired_link: { fr: "Lien invalide ou expiré", en: "Invalid or expired link", de: "Ungültiger oder abgelaufener Link", es: "Enlace no válido o caducado" },
  source_player_not_found: { fr: "Joueur source introuvable", en: "Source player not found", de: "Ausgangsprofil nicht gefunden", es: "Jugador de origen no encontrado" },
  target_player_not_found: { fr: "Joueur cible introuvable", en: "Target player not found", de: "Zielprofil nicht gefunden", es: "Jugador de destino no encontrado" },
  merge_has_account: { fr: "Ce joueur possède un compte — fusion non autorisée", en: "This player has an account — merge not allowed", de: "Dieses Profil hat ein Konto — Zusammenführen nicht erlaubt", es: "Este jugador tiene cuenta — fusión no permitida" },
  cannot_contact_self: { fr: "Impossible de se contacter soi-même", en: "You can't message yourself", de: "Du kannst dir nicht selbst schreiben", es: "No puedes escribirte a ti mismo" },
  no_push_subscription: { fr: "Aucune subscription push trouvée. Active les notifs push dans Paramètres > Notifications.", en: "No push subscription found. Turn on push notifications in Settings > Notifications.", de: "Kein Push-Abo gefunden. Aktiviere Push-Benachrichtigungen unter Einstellungen > Benachrichtigungen.", es: "No se encontró suscripción push. Activa las notificaciones push en Ajustes > Notificaciones." },
  request_not_found: { fr: "Demande introuvable", en: "Request not found", de: "Anfrage nicht gefunden", es: "Solicitud no encontrada" },
  invalid_parameters: { fr: "Paramètres invalides", en: "Invalid parameters", de: "Ungültige Parameter", es: "Parámetros no válidos" },
  same_match: { fr: "Même match", en: "Same match", de: "Gleiches Spiel", es: "Mismo partido" },
  matches_same_tournament: { fr: "Les matchs doivent appartenir au même tournoi", en: "Matches must belong to the same tournament", de: "Die Spiele müssen zum selben Turnier gehören", es: "Los partidos deben pertenecer al mismo torneo" },
  bracket_draw_close: { fr: "Impossible de clôturer un match de bracket sur une égalité. Un vainqueur est obligatoire.", en: "A bracket match can't be closed on a draw. A winner is required.", de: "Ein K.-o.-Spiel kann nicht mit Unentschieden abgeschlossen werden. Es braucht einen Sieger.", es: "Un partido de eliminatoria no puede cerrarse en empate. Hace falta un ganador." },
  next_round_exists: { fr: "Un round suivant existe déjà — utilise « revenir à ce round » dans l'onglet Étapes.", en: "A later round already exists — use \"go back to this round\" in the Stages tab.", de: "Es gibt bereits eine spätere Runde — nutze „zu dieser Runde zurück“ im Tab Etappen.", es: "Ya existe una ronda siguiente — usa «volver a esta ronda» en la pestaña Etapas." },
  match_has_next: { fr: "Ce match a une suite — modifiez les scores plutôt que de le réinitialiser.", en: "This match feeds later matches — edit the scores instead of resetting it.", de: "Dieses Spiel hat Folgespiele — ändere die Ergebnisse, statt es zurückzusetzen.", es: "Este partido tiene continuación — modifica los marcadores en lugar de reiniciarlo." },
  match_finished_reopen: { fr: "Ce match est terminé. Rouvrez-le pour modifier le score.", en: "This match is finished. Reopen it to change the score.", de: "Dieses Spiel ist beendet. Öffne es erneut, um das Ergebnis zu ändern.", es: "Este partido ha terminado. Reábrelo para cambiar el marcador." },
  court_busy: { fr: "Un match est déjà en cours sur ce terrain.", en: "A match is already in progress on this court.", de: "Auf diesem Platz läuft bereits ein Spiel.", es: "Ya hay un partido en curso en esta pista." },
  bracket_draw_end: { fr: "Impossible de terminer un match de bracket sur une égalité. Utilisez le Golden Goal pour désigner un vainqueur.", en: "A bracket match can't end on a draw. Use the Golden Goal to decide a winner.", de: "Ein K.-o.-Spiel kann nicht unentschieden enden. Nutze das Golden Goal, um einen Sieger zu bestimmen.", es: "Un partido de eliminatoria no puede terminar en empate. Usa el Gol de Oro para decidir un ganador." },
  too_many_messages: { fr: "Trop de messages envoyés. Réessayez dans 30 minutes.", en: "Too many messages sent. Try again in 30 minutes.", de: "Zu viele Nachrichten gesendet. Versuche es in 30 Minuten erneut.", es: "Demasiados mensajes enviados. Inténtalo en 30 minutos." },
  already_team_member: { fr: "Déjà membre de l'équipe", en: "Already a team member", de: "Bereits Teammitglied", es: "Ya es miembro del equipo" },
  invitation_already_sent: { fr: "Invitation déjà envoyée", en: "Invitation already sent", de: "Einladung bereits gesendet", es: "Invitación ya enviada" },
  not_member: { fr: "Pas membre", en: "Not a member", de: "Kein Mitglied", es: "No es miembro" },
  captain_required_kick: { fr: "Capitaine requis pour exclure", en: "Only a captain can remove members", de: "Nur Captains können Mitglieder entfernen", es: "Solo un capitán puede expulsar" },
  hand_over_captain: { fr: "Passez la main à un autre capitaine avant de quitter.", en: "Hand the captaincy to someone else before leaving.", de: "Übergib die Captain-Rolle, bevor du gehst.", es: "Pasa la capitanía a otra persona antes de salir." },
  fee_waitlisted: { fr: "Impossible de marquer le paiement d'une équipe en liste d'attente.", en: "A waitlisted team can't be marked as paid.", de: "Ein Team auf der Warteliste kann nicht als bezahlt markiert werden.", es: "No se puede marcar como pagado un equipo en lista de espera." },
  account_not_found: { fr: "Compte introuvable", en: "Account not found", de: "Konto nicht gefunden", es: "Cuenta no encontrada" },
  card_locked: { fr: "Carte non débloquée.", en: "Card not unlocked.", de: "Karte nicht freigeschaltet.", es: "Carta no desbloqueada." },
  tournament_finished: { fr: "Ce tournoi est terminé.", en: "This tournament is over.", de: "Dieses Turnier ist beendet.", es: "Este torneo ha terminado." },
  already_registered_short: { fr: "Déjà inscrit à ce tournoi.", en: "Already registered for this tournament.", de: "Bereits für dieses Turnier angemeldet.", es: "Ya inscrito en este torneo." },
  login_to_create_tournament: { fr: "Connectez-vous pour créer un tournoi", en: "Log in to create a tournament", de: "Melde dich an, um ein Turnier zu erstellen", es: "Inicia sesión para crear un torneo" },
  too_many_tournaments: { fr: "Trop de tournois créés récemment, réessayez plus tard.", en: "Too many tournaments created recently, try again later.", de: "Zu viele Turniere in letzter Zeit erstellt, versuche es später erneut.", es: "Demasiados torneos creados recientemente, inténtalo más tarde." },
  end_before_start: { fr: "La date de fin doit être après la date de début.", en: "The end date must be after the start date.", de: "Das Enddatum muss nach dem Startdatum liegen.", es: "La fecha de fin debe ser posterior a la de inicio." },
  registration_end_before_start: { fr: "La fin des inscriptions doit être après leur ouverture.", en: "Registration must close after it opens.", de: "Das Anmeldeende muss nach dem Anmeldebeginn liegen.", es: "El cierre de inscripciones debe ser posterior a su apertura." },
  cannot_delete_started: { fr: "Impossible de supprimer un tournoi en cours ou terminé.", en: "A tournament in progress or finished can't be deleted.", de: "Ein laufendes oder beendetes Turnier kann nicht gelöscht werden.", es: "No se puede eliminar un torneo en curso o terminado." },
  chat_disabled: { fr: "Chat désactivé", en: "Chat disabled", de: "Chat deaktiviert", es: "Chat desactivado" },
  organizer_only: { fr: "Réservé à l'organisateur", en: "Organizers only", de: "Nur für das Orga-Team", es: "Solo para la organización" },
  too_many_attempts_minutes: { fr: "Trop de tentatives, réessayez dans quelques minutes.", en: "Too many attempts, try again in a few minutes.", de: "Zu viele Versuche, versuche es in ein paar Minuten erneut.", es: "Demasiados intentos, inténtalo en unos minutos." },
  tournament_not_approved: { fr: "Tournoi non encore approuvé", en: "Tournament not approved yet", de: "Turnier noch nicht freigegeben", es: "Torneo aún no aprobado" },
  registration_closed_tournament: { fr: "Les inscriptions sont clôturées pour ce tournoi.", en: "Registration is closed for this tournament.", de: "Die Anmeldung für dieses Turnier ist geschlossen.", es: "Las inscripciones de este torneo están cerradas." },
  duplicate_player_team: { fr: "Un même joueur ne peut pas apparaître deux fois dans la même équipe.", en: "The same player can't appear twice in a team.", de: "Dieselbe Person kann nicht zweimal im selben Team stehen.", es: "Un mismo jugador no puede aparecer dos veces en el mismo equipo." },
  duplicate_player_form: { fr: "Le même joueur apparaît deux fois dans le formulaire.", en: "The same player appears twice in the form.", de: "Dieselbe Person steht zweimal im Formular.", es: "El mismo jugador aparece dos veces en el formulario." },
  registration_closed_contact: { fr: "Les inscriptions sont clôturées, contacte l'organisateur.", en: "Registration is closed, contact the organizers.", de: "Die Anmeldung ist geschlossen, kontaktiere das Orga-Team.", es: "Las inscripciones están cerradas, contacta con la organización." },
  not_team_captain: { fr: "Tu n'es pas capitaine d'une équipe inscrite à ce tournoi.", en: "You're not the captain of a team registered for this tournament.", de: "Du bist nicht Captain eines für dieses Turnier angemeldeten Teams.", es: "No eres capitán de un equipo inscrito en este torneo." },
  account_suspended_register: { fr: "Votre compte est suspendu. Vous ne pouvez pas vous inscrire à un tournoi.", en: "Your account is suspended. You can't register for a tournament.", de: "Dein Konto ist gesperrt. Du kannst dich nicht für ein Turnier anmelden.", es: "Tu cuenta está suspendida. No puedes inscribirte en un torneo." },
  registration_closed: { fr: "Les inscriptions sont clôturées.", en: "Registration is closed.", de: "Die Anmeldung ist geschlossen.", es: "Las inscripciones están cerradas." },
  already_registered: { fr: "Vous êtes déjà inscrit à ce tournoi.", en: "You're already registered for this tournament.", de: "Du bist bereits für dieses Turnier angemeldet.", es: "Ya estás inscrito en este torneo." },
  registration_not_found: { fr: "Inscription introuvable", en: "Registration not found", de: "Anmeldung nicht gefunden", es: "Inscripción no encontrada" },
  player_not_in_tournament: { fr: "Joueur introuvable dans ce tournoi.", en: "Player not found in this tournament.", de: "Person in diesem Turnier nicht gefunden.", es: "Jugador no encontrado en este torneo." },
  comment_required_vote: { fr: "Un commentaire est obligatoire pour ce type de vote", en: "A comment is required for this type of vote", de: "Für diese Art von Stimme ist ein Kommentar Pflicht", es: "Este tipo de voto requiere un comentario" },
  slug_taken: { fr: "Ce slug est déjà utilisé", en: "This slug is already taken", de: "Dieser Slug ist bereits vergeben", es: "Este slug ya está en uso" },
  too_many_uploads: { fr: "Trop d'uploads, réessayez dans quelques minutes.", en: "Too many uploads, try again in a few minutes.", de: "Zu viele Uploads, versuche es in ein paar Minuten erneut.", es: "Demasiadas subidas, inténtalo en unos minutos." },
  images_only: { fr: "Seules les images sont acceptées", en: "Only images are accepted", de: "Nur Bilder sind erlaubt", es: "Solo se aceptan imágenes" },
  invalid_image_file: { fr: "Fichier image invalide ou corrompu", en: "Invalid or corrupted image file", de: "Ungültige oder beschädigte Bilddatei", es: "Archivo de imagen no válido o dañado" },
  invitation_not_found: { fr: "Invitation introuvable", en: "Invitation not found", de: "Einladung nicht gefunden", es: "Invitación no encontrada" },
  not_for_you: { fr: "Pas pour vous", en: "Not for you", de: "Nicht für dich", es: "No es para ti" },
  invitation_already_handled: { fr: "Invitation déjà traitée", en: "Invitation already handled", de: "Einladung bereits bearbeitet", es: "Invitación ya gestionada" },
  team_name_taken: { fr: "Une équipe nommée \"{team}\" est déjà inscrite à ce tournoi.", en: "A team named \"{team}\" is already registered for this tournament.", de: "Ein Team namens „{team}“ ist bereits für dieses Turnier angemeldet.", es: "Ya hay un equipo llamado «{team}» inscrito en este torneo." },
  player_name_taken: { fr: "Un joueur nommé \"{name}\" est déjà inscrit dans une équipe de ce tournoi.", en: "A player named \"{name}\" is already in a team for this tournament.", de: "Eine Person namens „{name}“ ist bereits in einem Team dieses Turniers.", es: "Ya hay un jugador llamado «{name}» en un equipo de este torneo." },
  player_suspended: { fr: "{name} est suspendu·e et ne peut pas participer à un tournoi.", en: "{name} is suspended and can't take part in a tournament.", de: "{name} ist gesperrt und kann an keinem Turnier teilnehmen.", es: "{name} está suspendido/a y no puede participar en un torneo." },
  player_already_in_team: { fr: "{name} est déjà inscrit·e dans une équipe de ce tournoi.", en: "{name} is already in a team for this tournament.", de: "{name} ist bereits in einem Team dieses Turniers.", es: "{name} ya está en un equipo de este torneo." },
} as const;

export type ApiMessageKey = keyof typeof MESSAGES;

function requestLang(): Lang {
  try {
    const h = headers();
    const ref = h.get("referer") ?? "";
    const fromPath = ref.match(/^https?:\/\/[^/]+\/(fr|en|de|es)(?:[/?#]|$)/)?.[1];
    if (fromPath) return fromPath as Lang;
    const cookie = cookies().get("NEXT_LOCALE")?.value;
    if (cookie && (LANGS as string[]).includes(cookie)) return cookie as Lang;
    for (const part of (h.get("accept-language") ?? "").split(",")) {
      const code = part.trim().slice(0, 2).toLowerCase();
      if ((LANGS as string[]).includes(code)) return code as Lang;
    }
  } catch {
    // Hors requête (tests, scripts) : langue par défaut.
  }
  return "fr";
}

/** Message d'erreur traduit ; `{name}`… remplacés par `values`. */
export function apiMsg(key: ApiMessageKey, values?: Record<string, string | number>): string {
  let text: string = MESSAGES[key][requestLang()];
  for (const [k, v] of Object.entries(values ?? {})) text = text.replaceAll(`{${k}}`, String(v));
  return text;
}
