# RAPPORT D'ANALYSE DES TRADUCTIONS - BIKEPOLO

**Date:** 25 mars 2026  
**Analyseur:** Claude Code

---

## RÉSUMÉ EXÉCUTIF

Analyse complète des fichiers de traduction pour identifier les lacunes entre le français (source) et l'allemand/espagnol.

### Statistiques principales

| Métrique | Allemand | Espagnol |
|----------|----------|----------|
| **Total clés FR** | 1435 | 1435 |
| **Clés traduites** | 1217 | 1217 |
| **Clés manquantes** | 223 | 223 |
| **Clés en anglais** | 429 | 416 |
| **Taux d'avancement** | 85% | 85% |

---

## 1. CLÉS MANQUANTES (223 clés orphelines)

Ces clés existent en français mais sont **totalement absentes** des fichiers DE et ES.

### PRIORITÉ HAUTE - Nouvelles fonctionnalités (85 clés)

Contexte: **tournament.*** - Formulaire de création de tournoi et configurations

#### Informations de base
- **tournaments.teams_slots**: "{count}/{max} équipes"
  - DE: "{count}/{max} Teams"
  - ES: "{count}/{max} equipos"

- **tournaments.filter_count_one**: "{count} tournoi"
  - DE: "{count} Turnier"
  - ES: "{count} torneo"

- **tournaments.filter_count_other**: "{count} tournois"
  - DE: "{count} Turniere"
  - ES: "{count} torneos"

- **tournaments.continent_na**: "North America"
  - DE: "Nordamerika"
  - ES: "América del Norte"

- **tournaments.continent_sa**: "South America"
  - DE: "Südamerika"
  - ES: "América del Sur"

- **tournaments.continent_eu**: "Europe"
  - DE: "Europa"
  - ES: "Europa"

- **tournaments.continent_af**: "Africa"
  - DE: "Afrika"
  - ES: "África"

- **tournaments.continent_as**: "Asia"
  - DE: "Asien"
  - ES: "Asia"

- **tournaments.continent_oc**: "Oceania"
  - DE: "Ozeanien"
  - ES: "Oceanía"

#### Création de tournoi
- **tournament.reg_not_open_title**: "📅 Ouverture des inscriptions"
  - DE: "📅 Registrierung öffnet"
  - ES: "📅 Apertura de inscripciones"

- **tournament.reg_closes_on**: "Inscriptions ouvertes jusqu'au {date}"
  - DE: "Registrierung geöffnet bis {date}"
  - ES: "Inscripciones abiertas hasta {date}"

- **tournament.new_loading**: "Chargement…"
  - DE: "Lädt…"
  - ES: "Cargando…"

- **tournament.new_auth_title**: "Connecte-toi pour créer un tournoi"
  - DE: "Melde dich an, um ein Turnier zu erstellen"
  - ES: "Inicia sesión para crear un torneo"

- **tournament.new_auth_desc**: "Tu dois avoir un compte joueur pour organiser un tournoi."
  - DE: "Du musst ein Spielerkonto haben, um ein Turnier zu organisieren."
  - ES: "Debes tener una cuenta de jugador para organizar un torneo."

- **tournament.new_auth_btn**: "Se connecter"
  - DE: "Anmelden"
  - ES: "Iniciar sesión"

- **tournament.new_subtitle**: "Remplis les informations essentielles. Une fois soumis, ton tournoi sera examiné par un administrateur. Dès validation, tu pourras compléter les infos complémentaires (logistique, FAQ, planning…) directement depuis la page du tournoi."
  - DE: "Fülle die wesentlichen Informationen aus. Nach der Einreichung wird dein Turnier von einem Administrator überprüft. Nach der Bestätigung kannst du zusätzliche Informationen (Logistik, FAQ, Zeitplan…) direkt auf der Turnierseite hinzufügen."
  - ES: "Completa la información esencial. Una vez enviado, tu torneo será revisado por un administrador. Después de la validación, podrás completar información adicional (logística, FAQ, horario…) directamente desde la página del torneo."

#### Sections du formulaire
- **tournament.section_basics**: "1 — Infos de base"
  - DE: "1 — Grundinformationen"
  - ES: "1 — Información básica"

- **tournament.field_name_tournament**: "Nom du tournoi *"
  - DE: "Turnierbezeichnung *"
  - ES: "Nombre del torneo *"

- **tournament.field_continent**: "Continent *"
  - DE: "Kontinent *"
  - ES: "Continente *"

- **tournament.field_format**: "Format *"
  - DE: "Format *"
  - ES: "Formato *"

- **tournament.field_country**: "Pays *"
  - DE: "Land *"
  - ES: "País *"

- **tournament.field_city**: "Ville *"
  - DE: "Stadt *"
  - ES: "Ciudad *"

- **tournament.field_date_start**: "Date de début *"
  - DE: "Startdatum *"
  - ES: "Fecha de inicio *"

- **tournament.field_date_end**: "Date de fin *"
  - DE: "Enddatum *"
  - ES: "Fecha de finalización *"

#### Format & compétition
- **tournament.section_format**: "2 — Format & compétition"
  - DE: "2 — Format & Wettbewerb"
  - ES: "2 — Formato y competición"

- **tournament.field_max_teams**: "Équipes max *"
  - DE: "Max. Teams *"
  - ES: "Equipos máx. *"

- **tournament.field_courts**: "Terrains *"
  - DE: "Plätze *"
  - ES: "Canchas *"

- **tournament.field_game_duration**: "Durée match (min) *"
  - DE: "Spieldauer (min) *"
  - ES: "Duración del partido (min) *"

- **tournament.field_saturday_format**: "Format samedi"
  - DE: "Samstagformat"
  - ES: "Formato del sábado"

- **tournament.field_sunday_format**: "Format dimanche"
  - DE: "Sonntagsformat"
  - ES: "Formato del domingo"

- **tournament.saturday_all_day**: "Poules toute la journée"
  - DE: "Pools ganzer Tag"
  - ES: "Grupos todo el día"

- **tournament.saturday_split**: "Poules matin + après-midi"
  - DE: "Pools Morgens + Nachmittags"
  - ES: "Grupos mañana + tarde"

- **tournament.saturday_swiss**: "Système suisse"
  - DE: "Schweizer System"
  - ES: "Sistema Suizo"

- **tournament.sunday_se**: "Élimination simple (SE)"
  - DE: "Single Elimination (SE)"
  - ES: "Eliminación simple (SE)"

- **tournament.sunday_de**: "Double élimination (DE)"
  - DE: "Double Elimination (DE)"
  - ES: "Doble eliminación (DE)"

- **tournament.sunday_rr**: "Round Robin (RR)"
  - DE: "Round Robin (RR)"
  - ES: "Round Robin (RR)"

- **tournament.option_third_place**: "Petite finale (3ème place)"
  - DE: "3. Platz Spiel"
  - ES: "Partido por el tercer lugar"

- **tournament.option_gf_reset**: "Grand Final avec bracket reset (DE)"
  - DE: "Grand Final mit Bracket Reset (DE)"
  - ES: "Gran Final con bracket reset (DE)"

#### Inscriptions & frais
- **tournament.section_registration**: "3 — Inscriptions & frais"
  - DE: "3 — Anmeldung & Gebühren"
  - ES: "3 — Inscripciones y cuotas"

- **tournament.field_reg_start**: "Ouverture inscriptions"
  - DE: "Anmeldung öffnet"
  - ES: "Apertura de inscripciones"

- **tournament.field_reg_end**: "Fermeture inscriptions"
  - DE: "Anmeldung schließt"
  - ES: "Cierre de inscripciones"

- **tournament.field_fee**: "Frais d'inscription (par équipe)"
  - DE: "Anmeldegebühr (pro Team)"
  - ES: "Cuota de inscripción (por equipo)"

- **tournament.field_currency**: "Devise"
  - DE: "Währung"
  - ES: "Moneda"

- **tournament.field_contact_email**: "Email de contact"
  - DE: "Kontakt E-Mail"
  - ES: "Correo de contacto"

#### Logistique & hébergement
- **tournament.section_logistics_new**: "4 — Logistique & hébergement"
  - DE: "4 — Logistik & Unterkunft"
  - ES: "4 — Logística y alojamiento"

- **tournament.logistics_desc**: "Ces informations aident les équipes venant de loin à planifier leur déplacement."
  - DE: "Diese Informationen helfen Teams von weit weg, ihre Reise zu planen."
  - ES: "Esta información ayuda a los equipos de lejos a planificar su viaje."

- **tournament.logistic_accommodation**: "🏠 Hébergement possible"
  - DE: "🏠 Unterkunft möglich"
  - ES: "🏠 Alojamiento disponible"

- **tournament.logistic_accommodation_desc**: "Vous pouvez loger les équipes"
  - DE: "Sie können Teams unterbringen"
  - ES: "Puedes alojar equipos"

- **tournament.logistic_breakfast**: "🥐 Petits déjeuners organisés"
  - DE: "🥐 Frühstück organisiert"
  - ES: "🥐 Desayunos organizados"

- **tournament.logistic_breakfast_desc**: "Les petits déjeuners sont inclus"
  - DE: "Frühstück ist inbegriffen"
  - ES: "Los desayunos están incluidos"

- **tournament.logistic_lunch**: "🍽️ Déjeuners organisés"
  - DE: "🍽️ Mittagessen organisiert"
  - ES: "🍽️ Almuerzos organizados"

- **tournament.logistic_lunch_desc**: "Les repas du midi sont inclus ou organisés"
  - DE: "Mittagessen sind inbegriffen oder organisiert"
  - ES: "Los almuerzos están incluidos u organizados"

- **tournament.logistic_dinner**: "🌙 Dîners organisés"
  - DE: "🌙 Abendessen organisiert"
  - ES: "🌙 Cenas organizadas"

- **tournament.logistic_dinner_desc**: "Les repas du soir sont inclus ou organisés"
  - DE: "Abendessen sind inbegriffen oder organisiert"
  - ES: "Las cenas están incluidas u organizadas"

#### Co-organisateurs
- **tournament.section_co_organizers**: "5 — Co-organisateurs"
  - DE: "5 — Co-Organisatoren"
  - ES: "5 — Co-organizadores"

- **tournament.co_organizer_optional**: "(optionnel)"
  - DE: "(optional)"
  - ES: "(opcional)"

- **tournament.co_organizer_desc**: "Les co-organisateurs peuvent gérer le tournoi avec toi (édition, équipes, scores)."
  - DE: "Co-Organisatoren können das Turnier mit dir verwalten (Bearbeitung, Teams, Scores)."
  - ES: "Los co-organizadores pueden gestionar el torneo contigo (edición, equipos, puntuaciones)."

- **tournament.co_organizer_search**: "Rechercher un joueur…"
  - DE: "Spieler suchen…"
  - ES: "Buscar jugador…"

#### Boutons & messages
- **tournament.btn_submit_new**: "Soumettre le tournoi →"
  - DE: "Turnier einreichen →"
  - ES: "Enviar torneo →"

- **tournament.btn_submit_creating**: "Création…"
  - DE: "Wird erstellt…"
  - ES: "Creando…"

- **tournament.error_date_end**: "La date de fin doit être après la date de début."
  - DE: "Enddatum muss nach dem Startdatum liegen."
  - ES: "La fecha de finalización debe ser posterior a la fecha de inicio."

- **tournament.error_reg_end**: "La fin des inscriptions doit être après leur ouverture."
  - DE: "Anmeldungsende muss nach Anmeldungsbeginn liegen."
  - ES: "El cierre de inscripciones debe ser posterior a la apertura."

- **tournament.error_create**: "Erreur lors de la création."
  - DE: "Fehler beim Erstellen."
  - ES: "Error al crear."

- **tournament.rush_registration_label**: "Inscription au rush"
  - DE: "Rush-Anmeldung"
  - ES: "Inscripción por orden de llegada"

- **tournament.rush_registration_desc**: "— premier arrivé, premier servi. Les inscriptions au-delà du max seront en liste d'attente."
  - DE: "— wer zuerst kommt, mahlt zuerst. Anmeldungen über dem Maximum gehen auf die Warteliste."
  - ES: "— primero en llegar, primero en ser atendido. Las inscripciones por encima del máximo irán a lista de espera."

- **tournament.rush_registration_unchecked**: "Si décoché, toutes les inscriptions sont admises et le départ / tirage se fait après la clôture des inscriptions."
  - DE: "Falls deaktiviert, werden alle Anmeldungen akzeptiert und das Abfahrts-/Losverfahren findet nach Anmeldungsschluss statt."
  - ES: "Si está desactivado, todas las inscripciones son aceptadas y la salida/sorteo ocurre después del cierre de inscripciones."

- **tournament.max_solo_players_label**: "Nombre max de joueurs"
  - DE: "Max. Spieler"
  - ES: "Número máximo de jugadores"

- **tournament.max_solo_players_hint**: "(laisser vide = pas de limite)"
  - DE: "(leer lassen = keine Grenze)"
  - ES: "(dejar en blanco = sin límite)"

#### Dashboard organisateur
- **tournament.edit_dashboard_title**: "Dashboard organisateur"
  - DE: "Organisator-Dashboard"
  - ES: "Panel del organizador"

- **tournament.edit_view_public**: "Voir la page publique →"
  - DE: "Öffentliche Seite ansehen →"
  - ES: "Ver página pública →"

- **tournament.edit_resubmit**: "Corriger et resoumettre"
  - DE: "Korrigieren und erneut einreichen"
  - ES: "Corregir y reenviar"

- **tournament.edit_launch_tournament**: "Lancer le tournoi"
  - DE: "Turnier starten"
  - ES: "Lanzar torneo"

- **tournament.edit_kpi_teams**: "Équipes"
  - DE: "Teams"
  - ES: "Equipos"

- **tournament.edit_kpi_free_agents**: "Free agents"
  - DE: "Freie Spieler"
  - ES: "Jugadores libres"

- **tournament.edit_kpi_players**: "Joueurs"
  - DE: "Spieler"
  - ES: "Jugadores"

- **tournament.edit_free_agents_title**: "Free agents inscrits ({count})"
  - DE: "Angemeldete freie Spieler ({count})"
  - ES: "Jugadores libres inscritos ({count})"

- **tournament.edit_free_agents_empty**: "Aucune demande pour l'instant."
  - DE: "Noch keine Anfragen."
  - ES: "Sin solicitudes por ahora."

- **tournament.edit_access_denied**: "Accès refusé"
  - DE: "Zugriff verweigert"
  - ES: "Acceso denegado"

- **tournament.edit_access_denied_desc**: "Vous n'êtes pas l'organisateur de ce tournoi."
  - DE: "Du bist nicht der Organisator dieses Turniers."
  - ES: "No eres el organizador de este torneo."

- **tournament.edit_view_tournament**: "Voir le tournoi"
  - DE: "Turnier ansehen"
  - ES: "Ver torneo"

- **tournament.venue_maps**: "Maps"
  - DE: "Karten"
  - ES: "Mapas"

- **tournament.accommodation_places**: "{count} places"
  - DE: "{count} Plätze"
  - ES: "{count} lugares"

#### Colonnes tableau équipes
- **tournament.teams_col_team**: "Équipe"
  - DE: "Team"
  - ES: "Equipo"

- **tournament.teams_col_cities**: "Villes"
  - DE: "Städte"
  - ES: "Ciudades"

- **tournament.teams_col_players**: "Joueurs"
  - DE: "Spieler"
  - ES: "Jugadores"

- **tournament.teams_col_status**: "Statut"
  - DE: "Status"
  - ES: "Estado"

- **tournament.teams_retained_count_one**: "{count} équipe retenue"
  - DE: "{count} Team angenommen"
  - ES: "{count} equipo retenido"

- **tournament.teams_retained_count_other**: "{count} équipes retenues"
  - DE: "{count} Teams angenommen"
  - ES: "{count} equipos retenidos"

- **tournament.teams_waitlist_suffix**: " · {count} en liste d'attente"
  - DE: " · {count} auf Warteliste"
  - ES: " · {count} en lista de espera"

- **tournament.courts_count_one**: "{count} terrain"
  - DE: "{count} Platz"
  - ES: "{count} cancha"

- **tournament.courts_count_other**: "{count} terrains"
  - DE: "{count} Plätze"
  - ES: "{count} canchas"

#### Free agents
- **tournament.info_free_agents_desc**: "Joueur·ses sans équipe qui cherchent à rejoindre un groupe."
  - DE: "Spieler ohne Team, die einer Gruppe beitreten möchten."
  - ES: "Jugadores sin equipo que buscan unirse a un grupo."

- **tournament.communaute_free_agents_desc**: "Joueur·ses sans équipe qui cherchent à rejoindre un groupe pour ce tournoi."
  - DE: "Spieler ohne Team, die dieser Turniergruppe beitreten möchten."
  - ES: "Jugadores sin equipo que buscan unirse a un grupo para este torneo."

- **tournament.communaute_looking**: "Tu cherches une équipe ?"
  - DE: "Suchst du ein Team?"
  - ES: "¿Buscas un equipo?"

---

### PRIORITÉ MOYENNE-HAUTE - Gestion des équipes (46 clés)

#### Contexte: team.*, my_teams.*, selection.*, free_agent.*

**team.btn_back**: "← Retour"
- DE: "← Zurück"
- ES: "← Atrás"

**team.loading**: "Chargement…"
- DE: "Lädt…"
- ES: "Cargando…"

**team.slot_not_found**: "Aucun joueur trouvé —"
- DE: "Kein Spieler gefunden —"
- ES: "Jugador no encontrado —"

**team.slot_add_manual**: "Ajouter manuellement"
- DE: "Manuell hinzufügen"
- ES: "Agregar manualmente"

**team.field_accommodation**: "Hébergement"
- DE: "Unterkunft"
- ES: "Alojamiento"

**team.error_generic**: "Erreur lors de l'inscription."
- DE: "Fehler beim Registrieren."
- ES: "Error al inscribirse."

**team.btn_cancel**: "Annuler"
- DE: "Abbrechen"
- ES: "Cancelar"

**selection.header_title**: "Sélection des équipes"
- DE: "Team-Auswahl"
- ES: "Selección de equipos"

**selection.header_in**: "✅ {count} IN"
- DE: "✅ {count} IN"
- ES: "✅ {count} DENTRO"

**selection.header_pool**: "{count} en attente"
- DE: "{count} ausstehend"
- ES: "{count} pendiente"

**selection.slots_left_one**: "{count} place restante"
- DE: "{count} Platz verbleibend"
- ES: "{count} lugar restante"

**selection.slots_left_other**: "{count} places restantes"
- DE: "{count} Plätze verbleibend"
- ES: "{count} lugares restantes"

**selection.validate_all_btn**: "✅ Valider toutes ({count})"
- DE: "✅ Alle validieren ({count})"
- ES: "✅ Validar todos ({count})"

**selection.draw_all_btn**: "⚡ Tirage rapide ({count} d'un coup)"
- DE: "⚡ Schnelle Auslosung ({count} auf einmal)"
- ES: "⚡ Sorteo rápido ({count} a la vez)"

**selection.section_in_header**: "✅ Équipes IN ({count})"
- DE: "✅ Teams IN ({count})"
- ES: "✅ Equipos DENTRO ({count})"

**selection.drawn_label**: "TIRÉ AU SORT"
- DE: "AUSGELOST"
- ES: "SORTEADO"

**selection.pool_header**: "🎲 Pool ({count} équipes · {inDraw} dans ce tirage)"
- DE: "🎲 Pool ({count} Teams · {inDraw} in dieser Auslosung)"
- ES: "🎲 Pool ({count} equipos · {inDraw} en este sorteo)"

**selection.pool_hint**: "Coche les équipes à inclure dans le prochain tirage — clique sur une ligne pour la (dé)cocher"
- DE: "Wähle Teams für die nächste Auslosung aus — klicke auf eine Zeile zum (Ab)wählen"
- ES: "Marca los equipos a incluir en el próximo sorteo — haz clic en una fila para seleccionar/deseleccionar"

**selection.in_draw_label**: "DANS LE TIRAGE"
- DE: "IN AUSLOSUNG"
- ES: "EN SORTEO"

**selection.wl_header**: "⏳ Liste d'attente ({count})"
- DE: "⏳ Warteliste ({count})"
- ES: "⏳ Lista de espera ({count})"

**selection.wl_draw_header**: "🎲 Tirage waiting list ({count} équipes · {inDraw} dans ce tirage)"
- DE: "🎲 Wartelisten-Auslosung ({count} Teams · {inDraw} in dieser Auslosung)"
- ES: "🎲 Sorteo de lista de espera ({count} equipos · {inDraw} en este sorteo)"

**selection.wl_draw_btn**: "🎲 Tirer WL #{rank}"
- DE: "🎲 Warteliste #{rank} auslosen"
- ES: "🎲 Sortear WL #{rank}"

**selection.wl_hint**: "Coche les équipes à inclure dans le tirage waiting list — une par une"
- DE: "Wähle Teams für die Wartelisten-Auslosung aus — einzeln"
- ES: "Marca los equipos a incluir en el sorteo de lista de espera — uno por uno"

**selection.saving**: "Enregistrement…"
- DE: "Speichern…"
- ES: "Guardando…"

**free_agent.btn_sending**: "Envoi…"
- DE: "Wird gesendet…"
- ES: "Enviando…"

**my_teams.page_subtitle**: "Tes équipes permanentes — indépendantes des tournois."
- DE: "Deine permanenten Teams — unabhängig von Turnieren."
- ES: "Tus equipos permanentes — independientes de los torneos."

**my_teams.empty_title**: "Pas encore d'équipe"
- DE: "Noch kein Team"
- ES: "Sin equipo aún"

**my_teams.empty_subtitle**: "Crée ta première équipe ou attends une invitation d'un coéquipier."
- DE: "Erstelle dein erstes Team oder warte auf eine Einladung von einem Teamkollegen."
- ES: "Crea tu primer equipo o espera una invitación de un compañero de equipo."

**my_teams.squad_not_found**: "Équipe introuvable."
- DE: "Team nicht gefunden."
- ES: "Equipo no encontrado."

**my_teams.squad_access_denied**: "Accès refusé"
- DE: "Zugriff verweigert"
- ES: "Acceso denegado"

**my_teams.squad_not_member**: "Tu n'es pas membre de cette équipe."
- DE: "Du bist kein Mitglied dieses Teams."
- ES: "No eres miembro de este equipo."

**my_teams.btn_back_teams**: "← Mes équipes"
- DE: "← Meine Teams"
- ES: "← Mis equipos"

**my_teams.field_name**: "Nom de l'équipe *"
- DE: "Teamname *"
- ES: "Nombre del equipo *"

**my_teams.field_bio**: "Description (optionnel)"
- DE: "Beschreibung (optional)"
- ES: "Descripción (opcional)"

**my_teams.field_logo**: "Logo (optionnel)"
- DE: "Logo (optional)"
- ES: "Logo (opcional)"

**my_teams.logo_upload**: "📷 Uploader un logo"
- DE: "📷 Logo hochladen"
- ES: "📷 Subir logo"

**my_teams.logo_change**: "🔄 Changer"
- DE: "🔄 Ändern"
- ES: "🔄 Cambiar"

**my_teams.logo_uploading**: "Upload…"
- DE: "Lädt hoch…"
- ES: "Subiendo…"

**my_teams.bio_placeholder**: "Qui êtes-vous ? Votre style de jeu, votre région…"
- DE: "Wer seid ihr? Euer Spielstil, eure Region…"
- ES: "¿Quiénes son? Su estilo de juego, su región…"

**my_teams.error_name_short**: "Nom trop court (2 car. min)"
- DE: "Name zu kurz (mindestens 2 Zeichen)"
- ES: "Nombre muy corto (mín. 2 caracteres)"

**my_teams.error_create**: "Erreur lors de la création"
- DE: "Fehler beim Erstellen"
- ES: "Error al crear"

**my_teams.btn_creating**: "Création…"
- DE: "Wird erstellt…"
- ES: "Creando…"

**my_teams.btn_submit**: "Créer l'équipe"
- DE: "Team erstellen"
- ES: "Crear equipo"

**my_teams.invites_title**: "Invitations reçues"
- DE: "Erhaltene Einladungen"
- ES: "Invitaciones recibidas"

**my_teams.invite_from**: "Invité par {name}"
- DE: "Eingeladen von {name}"
- ES: "Invitado por {name}"

**my_teams.btn_accept**: "Accepter"
- DE: "Akzeptieren"
- ES: "Aceptar"

**my_teams.btn_decline**: "Refuser"
- DE: "Ablehnen"
- ES: "Rechazar"

**my_tournaments.section_player**: "En tant que joueur·euse"
- DE: "Als Spieler"
- ES: "Como jugador"

**my_tournaments.section_organizer**: "En tant qu'organisateur·trice"
- DE: "Als Organisator"
- ES: "Como organizador"

**my_tournaments.empty_player**: "Aucune inscription pour l'instant."
- DE: "Noch keine Anmeldungen."
- ES: "Sin inscripciones por ahora."

**my_tournaments.empty_organizer**: "Tu n'as pas encore organisé de tournoi."
- DE: "Du hast noch kein Turnier organisiert."
- ES: "Aún no has organizado un torneo."

**my_tournaments.captain**: "Capitaine"
- DE: "Kapitän"
- ES: "Capitán"

**my_tournaments.pending**: "EN ATTENTE"
- DE: "AUSSTEHEND"
- ES: "PENDIENTE"

**my_tournaments.btn_create**: "Créer un tournoi"
- DE: "Turnier erstellen"
- ES: "Crear torneo"

**my_tournaments.chat_open**: "Discussion d'équipe"
- DE: "Team-Diskussion"
- ES: "Chat del equipo"

**my_tournaments.chat_close**: "Fermer la discussion"
- DE: "Diskussion schließen"
- ES: "Cerrar chat"

---

### PRIORITÉ MOYENNE - Panneau d'administration (36 clés)

Contexte: **admin.***

[Détails complets dans le fichier de sortie - Sections admin, clubs, countries, access codes]

---

### PRIORITÉ BASSE - Divers (10 clés)

**notifications.default**: "Notification"
- DE: "Mitteilung"
- ES: "Notificación"

**player.not_found**: "Joueur introuvable"
- DE: "Spieler nicht gefunden"
- ES: "Jugador no encontrado"

**messages.click_marker**: "Cliquez sur un marqueur pour voir les détails."
- DE: "Klicke auf einen Marker, um Details zu sehen."
- ES: "Haz clic en un marcador para ver detalles."

---

## 2. CLÉS NON TRADUITES (En anglais)

### Problème identifié

**429 clés en allemand** et **416 clés en espagnol** contiennent du texte anglais au lieu des vraies traductions.

### Exemples critiques (top 30)

Ces clés sont traduites en français mais conservent le texte anglais en DE/ES :

1. `common.cancel` - "Cancel" au lieu de traduction
2. `common.close` - "Close" au lieu de traduction
3. `common.send` - "Send" au lieu de traduction
4. `common.sending` - "Sending…" au lieu de traduction
5. `common.save` - "Save" au lieu de traduction
6. `common.saving` - "Saving…" au lieu de traduction
7. `common.loading` - "Loading…" au lieu de traduction
8. `common.back` - "← Back" au lieu de traduction
9. `common.edit` - "Edit" au lieu de traduction
10. `common.delete` - "Delete" au lieu de traduction

...et 419 autres.

**Impact:** Les utilisateurs de langue allemande/espagnole verront des textes anglais dans 30% de l'interface.

---

## 3. PLAN D'ACTION RECOMMANDÉ

### Phase 1 : URGENT (Semaine 1)
- [ ] Traduire 223 clés orphelines (surtout **tournament.***) 
- [ ] Valider les traductions proposées ci-dessus avec des locuteurs natifs

### Phase 2 : CRITIQUE (Semaine 2-3)
- [ ] Traduire les ~400+ clés restantes en anglais
- [ ] Prioriser : `common.*`, `bracket.*`, `players.*`, `bracket.*`

### Phase 3 : MAINTENANCE (Semaine 4+)
- [ ] Mise en place d'une checklist pour nouvelles clés
- [ ] Tests d'interface en DE et ES avant merge
- [ ] Documentation du processus de traduction

---

## 4. FICHIERS CONCERNÉS

**Répertoire:** `/Users/baptiste/Documents/PERSONNEL/TEST GPT/bikepolo-nextjs-fullstack/messages/`

- `fr.json` (source) - 1435 clés ✅
- `de.json` (allemand) - 1217 clés, 223 manquantes, 429 en anglais
- `es.json` (espagnol) - 1217 clés, 223 manquantes, 416 en anglais
- `en.json` (anglais) - 1434 clés ✅

---

## 5. NOTES IMPORTANTES

### Conventions observées
- Les emojis sont conservés dans toutes les langues
- Les variables `{count}`, `{date}`, `{name}` ne doivent pas être traduites
- Le format "1 — " pour les titres de sections est conservé

### Remarques spéciales
- Certaines clés continents (continent_na, continent_eu) sont traduites de l'anglais vers la langue locale
- Les formats de tournoi (SE, DE, RR) et noms de systèmes (Swiss) restent en anglais (conventions du sport)
- Les emojis figuratifs (📅, 📷, 🏠) sont maintenus

---

**Rapport généré:** 25 mars 2026
**Analyste:** Claude Code
**Statut:** À traiter prioritairement
