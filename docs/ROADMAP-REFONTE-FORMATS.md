# Refonte formats — Passation & feuille de route

> Rédigé le 2026-07-07 en fin de session. Destiné à l'assistant qui reprend le
> travail. Lire ce fichier EN ENTIER avant de coder quoi que ce soit.
> Complète `docs/AUDIT-FORMATS.md` (audit initial des formats cassés).

---

## 0. MÉTHODE DE TRAVAIL AVEC BAPTISTE (non négociable)

Historique : une première version du sandbox a été rejetée (« un pauvre
simulateur ») et un gros malentendu a failli faire capoter le projet. Depuis,
la méthode validée est :

1. **Présenter un plan écrit précis AVANT de coder** (pas de maquette floue,
   une description exacte de ce qui va apparaître à l'écran).
2. Baptiste valide (souvent via AskUserQuestion, options courtes).
3. Coder **UNE page / une livraison à la fois**.
4. Baptiste teste **en conditions réelles dans son navigateur**.
5. Feu vert explicite → seulement alors passer à la suite.
6. **JAMAIS de commit/push sans son feu vert.**

Corollaires :
- Les tests automatisés valident le moteur/l'API, PAS le câblage React
  (le bug « vieux dashboard » venait d'un prop reconstruit à la main dans
  `edit/page.tsx` — les sims étaient vertes, la page cassée).
- Baptiste teste sur `npm run dev` local branché sur la **VRAIE base de prod**
  (voir §2 Pièges). Hot-reload OK pour le code, mais **les fichiers
  `messages/*.json` exigent un redémarrage du serveur dev** (il est tombé
  deux fois sur des clés brutes `tournament.xxx` à cause de ça).

---

## 1. VISION VALIDÉE

- **Un seul moteur générique** (« pipeline ») : des étapes composables
  (RR / SWISS / CROSS_POOL / PLACEMENT / SE / DE) remplacent TOUS les formats
  codés en dur (Graz, Kiosque, MTP, Big Apple, Berlin…). **À terme, le code
  legacy est supprimé** (remplacement complet, pas cohabitation éternelle).
- **Builder custom** : composer n'importe quelle formule
  (ex : « 5 Swiss → cross-pool → 4 groupes × 2 tours → DE »).
- **Sandbox-first** : `/sandbox` (privé : ADMIN + bapmorvan@gmail.com) crée des
  tournois de test qui utilisent les **VRAIES pages** (vraie page publique,
  vrai dashboard, vraie saisie de score). Pas de simulateur à part.
- **Tout unifié** : même rendu bracket, mêmes onglets, mêmes features
  (bouton ⋯ joueurs, etc.) sur tous les tournois.
- Une fois validé en sandbox → intégrer à la création normale → migrer les
  vrais formats → supprimer le legacy.

---

## 2. PIÈGES & RÈGLES TECHNIQUES (à lire absolument)

- **BASE DE PROD** : le `.env` local contient l'URL PUBLIQUE de la base
  Postgres de prod (Coolify, port public 5433) pour que `npm run dev` marche.
  ⚠️ Toute écriture locale touche la prod. Baptiste doit re-désactiver
  l'exposition publique quand la phase de test est finie.
- **JAMAIS** `prisma db push --force-reset` ni aucune commande destructive DB
  (règle mémorisée après incident). Les changements de schéma prod passent par
  du **SQL idempotent** exécuté dans le terminal DB de Coolify :
  `docs/sql/pipeline-prod.sql` (déjà appliqué).
- **Prisma CLI lit `.env` avant les variables shell** : pour pousser le schéma
  sur la base de sim, faire `mv .env .env.simbak` → commande → restaurer.
- **Base de simulation** : Postgres jetable local port **5433**, db
  `bikepolo_sim` (`.simdb/`). Garde-fou : les sims vérifient
  `current_database()`. Lancer : `npx vitest run -c vitest.sim.config.ts`
  (31 tests, tous verts au moment de la passation).
- **`edit/page.tsx` reconstruit le prop `tournament` champ par champ** (~60
  champs). Tout nouveau champ Prisma utilisé par OrgaDashboard doit être
  ajouté À LA MAIN dans cet objet ET dans la query (piège du « vieux
  dashboard »). Même chose pour le select des `stages.matches`
  (`{ id, status, groupKey }` actuellement).
- **La page publique a `// @ts-nocheck`** : tsc ne la couvre pas. Après toute
  modif : `npx next build --experimental-build-mode compile`.
- **i18n : 4 langues** (fr/en/de/es), namespaces `tournament` (clés
  `pipeline_*`), `tournament_edit`, `sandbox`. Toute string UI passe par
  next-intl. Script node pour injecter les clés dans les 4 fichiers d'un coup
  (voir historique git).
- **15 échecs vitest préexistants** dans les tests legacy
  (berlin-mixed/graz/bracket) — PAS causés par la refonte, ne pas « réparer »
  sans comprendre.
- Joueurs fictifs sandbox : créés avec les équipes (3/équipe), status
  `REJECTED` (invisibles publiquement), slug `sandbox-{tournoiId}-{n}`,
  supprimés par `deleteSandboxAction`. Ne pas les indexer/afficher.
- Tournois testMode : exclus des mails (`notify-tournaments`), des badges
  (`achievements.ts`), cachés du public (`hidden`).

---

## 3. ÉTAT DES LIEUX — CE QUI EST FAIT

### Moteur (`src/engine/`)
- `pipeline-server.ts` — LE cerveau : `launchStage` / `launchNextGroup` /
  `applyScore` / `advanceStage` (par groupe) / `resetStages` / `simulate*` /
  `updateStageDef` / `addStageDef` / `removeStageDef` / `moveStageDef` /
  `previewStageEntries` / `setStageManualGroups` / `stageStandings` /
  `finalStandings`.
- `rounds.ts` (RR circle, appariement swiss, cross-pool, placement),
  `se.ts`/`de.ts` (plans de bracket, contraction fantôme pour les byes),
  `bracket-core.ts`, `persist-plan.ts`, `transitions.ts` (EntryRules :
  sources `registration`/`stageRanks`, groupAssign snake/interleave/block/
  **manual**), `stage-standings.ts`, `scheduler.ts` (timezone via Intl,
  `zonedToUtc`, `scheduleRounds`), `pipeline-validation.ts` (zod, miroir des
  types — à maintenir synchronisé), `presets.ts`.
- **Modes terrains** (`courtMode` sur RR/SWISS) :
  - `sequential` (défaut) : le lancement ne génère QUE le groupe A ; bouton
    « Lancer le groupe B » quand prêt (validé : « en général tous les rounds
    du groupe A sont faits puis on lance le groupe B »). L'étape n'est DONE
    que quand tous les groupes (entries) sont lancés ET finis.
  - `dedicated` : terrains répartis par groupe, en parallèle ; chaque groupe
    avance à son rythme (round suivant dès que SON round est fini).
  - `mixed` : ancien comportement entrelacé.
- **Horaires** : `Stage.startAt` (début d'étape) + `config.groupStartAt`
  (ISO UTC par lettre de groupe), appliqués au lancement/à la génération.
  Saisie en heure murale du fuseau du tournoi (`tournament.timezone`).

### Dashboard orga (`/tournament/[id]/edit`)
- Onglet **🧩 Étapes** (défaut pour pipeline, remplace Planning) :
  composant partagé `src/components/PipelinePlanning.tsx` — timeline des
  étapes, récap config visible (rounds · groupes · mode terrains · 🕐 heures),
  lancer étape/groupe, **éditeur d'étapes non lancées** (nom, type, config,
  sources, horaires — réutilise les briques exportées de
  `sandbox/PipelineBuilder.tsx`), dupliquer, ↑↓, supprimer, ajouter, reset
  depuis ici, composition manuelle des groupes, bannière test + simuler.
- Onglet Config : restructuré en sections (Infos générales / Inscriptions /
  Format[legacy] ou panneau « géré dans Étapes » / Statut & visibilité /
  Diffusion & communication / Bannière / Lieux / etc.). Fix : la sauvegarde
  ne réécrit plus les champs format legacy pour un tournoi pipeline.

### Page publique (`/tournament/[id]`)
- Onglets par groupe (Groupe A/B… + « Général » live par étape multi-groupes,
  ordre du pipeline), un seul onglet Planning.
- **Onglet 🧩 Étapes visible orga/co-orga/admin uniquement** — même
  `PipelinePlanning` que le dashboard (validé : piloter sans changer de page).
- Planning (`ScheduleBoard.tsx`) : blocs par étape/groupe/côté de bracket
  (« Winners · Round 2 », « Losers · Round 1 », « Grande finale »), pastilles
  WB/LB, **file d'attente par terrain globale** (« Suivant »/« In the hole »
  calculés sur tous les blocs — sinon chaque bloc affichait « Suivant »),
  colonnes de terrains triées (Court 1 à gauche), **« Vainqueur #n » /
  « Perdant #n » à la place de TBD**, bouton ⋯ joueurs, SSE nouveaux rounds.
- Bracket (`BracketView.tsx`) : vraie mise en page d'arbre pour la DE
  (matchs centrés entre leurs sources), placeholders Vainqueur/Perdant #n.
- Podium : bracket final OU classement moteur si le pipeline finit sans
  bracket ; **GF reset joué = match décisif** (corrigé).
- Fin de tournoi : automatique quand la dernière étape est DONE (couvert par
  les sims) ; badges : phase `STAGE` ajoutée à `BRACKET_PHASES`.

### Sandbox (`/sandbox`)
- Presets + builder custom (le nom d'étape suit le type par défaut), slug,
  équipes fictives + 3 joueurs fictifs/équipe, `/sandbox/[id]` redirige vers
  le vrai dashboard.

### Non commité
⚠️ TOUT ce travail est dans l'arbre de travail local, **non commité, non
poussé** (méthode : pas de push sans feu vert). Premier réflexe de la
prochaine session : `git status`, et proposer un découpage en commits propres
quand Baptiste donne le feu vert.

---

## 4. RESTE À FAIRE — ÉTAPE PAR ÉTAPE

### Étape A — Livraison 2 de l'onglet Étapes (DÉJÀ VALIDÉE, à faire en premier)
1. **« Revenir au round N »** (étape active) : efface les scores du round N
   et supprime les rounds > N (Swiss/CrossPool les régénéreront via
   `advanceStage`) ; pour RR, efface juste les scores (les rounds sont
   pré-générés). Penser : matchEvents, SSE, et le cas séquentiel (rounds d'un
   seul groupe).
2. **Reset d'un match seul** (dans Planning, carte du match) : remettre à
   « non joué » — seulement si aucun match généré n'en dépend
   (`nextMatchWinId`/`nextMatchLoseId` avec équipe propagée, ou round suivant
   déjà généré) ; sinon message renvoyant au reset de round.
3. **« Replanifier les horaires »** (étape active) : recalcule les `startAt`
   des matchs non joués à partir de maintenant (même logique que
   `persistPairings`, sans toucher aux scores). Utile en vrai tournoi quand
   ça déborde.

### Étape B — REFONTE DU DASHBOARD (voir §5 — maquette à valider AVANT)

### Étape C — Intégration à la création normale (`/tournament/new`)
- Le builder (presets + custom) devient une option/le défaut à la création
  d'un vrai tournoi (validé : « d'abord valider via /sandbox, intégrer
  ensuite »). Attention : `usesPipeline=true`, pas de champs legacy, et le
  formulaire de création partage des morceaux avec TournamentEditForm.
- Sauvegarder des **presets custom** par orga (table simple
  `PipelinePreset { ownerId, name, stages Json }`).

### Étape D — Migration des formats legacy → recettes pipeline
- Big Apple est déjà reproduit en recette (84 matchs, parité vérifiée par sim).
- Faire pareil : Graz, Kiosque, MTP Open, Berlin Mixed, SPLIT_SWISS
  (recettes dans `presets.ts` + sims de parité comme
  `pipeline.simtest.ts` le fait pour Big Apple).
- Puis : les vieux tournois restent lisibles (données), mais les NOUVEAUX
  tournois ne peuvent plus choisir les formats legacy → à terme, suppression
  des blocs `GrazPlanning`/`KiosquePlanning`/`MtpPlanning`/… d'OrgaDashboard
  et des ~40 actions legacy d'`edit/actions.ts` (4000+ lignes à terme).

### Étape E — Flexibilité live (phase suivante validée dans l'ambition)
- Forfait d'une équipe en cours de tournoi (retrait propre des rounds futurs).
- Écourter une étape (« le Swiss s'arrête au round 3, on enchaîne »).
- Supprimer/ajouter une étape en cours de tournoi (déjà possible tant que
  PENDING — le cas « au milieu » reste à traiter).
- `MatchEditPanel` : filtrer la liste d'échange d'équipes par étape (bug noté).

### Étape F — Polish tournois terminés & vitrine
- Podium sur les cartes de tournois passés (`/tournaments`) — rien aujourd'hui.
- Récap : vérifier le rendu complet avec un pipeline (MVP, photo finish, ok).
- La complétion par date (24h après dateEnd, `tournament-status.ts`) peut
  terminer un tournoi non fini — décider si on la garde telle quelle pour le
  pipeline ou si on exige toutes étapes DONE.

---

## 5. REFONTE DASHBOARD — DIAGNOSTIC & PROPOSITION (à maquetter pour Baptiste)

Baptiste : « je voudrais que le dashboard soit vraiment bien refait parce que
c'est le bazar ». Diagnostic objectif :

- `OrgaDashboard.tsx` ≈ 2400 lignes : 6 composants de planning legacy (Graz,
  Kiosque, MTP, SplitSwiss, BigApple, standard) + KPI + QR arbitre + onglets.
- `TournamentEditForm.tsx` ≈ 1300 lignes, tout dans un seul form.
- ~50 props d'actions passées à plat (OrgaDashboardProps est illisible).
- Doublons : gestion équipes vs sélection/tirage, infos publiques éparpillées
  entre Config (bannière/lieux/FAQ) et onglet Orga.

Proposition de structure cible (À VALIDER avec lui avant de coder, onglet par
onglet, une livraison par onglet) :

1. **🧩 Étapes** (existant) — devenir le « cockpit » : ajouter en haut une
   carte « Prochaine action » (ex : « Round 2 Groupe B en cours — 3 matchs
   restants », gros bouton contextuel Lancer X / Replanifier), retard estimé
   vs planning.
2. **👥 Équipes** — fusionner inscription/sélection/tirage/waitlist en un seul
   flux clair (UnifiedTeamManager + DrawPanel + SelectionManager aujourd'hui).
3. **⚙️ Config** — garder les sections faites, mais scinder en sous-onglets ou
   accordéons : Essentiel / Inscriptions / Contenu public (bannière, lieux,
   repas, kit, FAQ) / Diffusion / Avancé (test, statut).
4. **🤝 Orga** — tâches, notes, liens, co-organisateurs, arbitres (QR),
   annonces : regrouper tout « l'humain » ici.
5. Supprimer l'onglet Planning legacy pour les pipelines (fait) et, après
   l'étape D, supprimer tous les plannings legacy.

Chantier technique associé : éclater `OrgaDashboard.tsx` en fichiers par
onglet (`src/components/orga/…`) et remplacer la marée de props par un objet
`actions` groupé — sans changer le comportement (refactor mécanique, sims +
build pour valider, puis test manuel de Baptiste).

---

## 6. IDÉES À FORT IMPACT (proposées, non validées)

### Rapides et percutantes (s'appuient sur l'existant)
- **Notification « ton match arrive »** : la file par terrain
  (`courtQueuePos` dans ScheduleBoard) sait qui est « Suivant » / « In the
  hole » ; `web-push`/`notify` existent déjà → push aux joueurs des équipes
  concernées. Énorme valeur terrain.
- **Arbitrage auto** : règle polo classique « les perdants du match précédent
  arbitrent » → proposer l'affectation automatique arbitre/co-arbitre à la
  génération des rounds (champ `refereePlayerId` existe déjà sur Match).
- **Recalage en un clic** (fait partie de A3) : bouton « on a 40 min de
  retard » qui replanifie tout ce qui n'est pas joué.
- **Écran spectateur/TV** : `/multiplex` et `/overlay` existent — une vue
  plein écran par terrain (match en cours + Suivant/In the hole + score live
  SSE) pour projeter au bord du terrain.
- **Dupliquer un tournoi** (« édition N+1 ») : recopier config + pipeline,
  dates décalées d'un an.
- **Fenêtres horaires par jour** : le scheduler enchaîne les matchs sans
  notion de nuit (des matchs à 4h du matin en sim) → config « samedi 9h-19h,
  dimanche 9h-17h » et la planification saute d'un jour à l'autre.
  (Réflexion déjà amorcée avec Baptiste, il n'a pas encore tranché.)

### Plus tard
- Stats croisées joueur/équipe (win rate, buts, historique inter-tournois),
  seeding automatique basé sur les résultats passés.
- Exports PDF/CSV du planning et des classements (impression buvette).
- PWA / mode dégradé hors-ligne pour la table de marque.
- Widget embed (iframe/oEmbed) du bracket/planning pour les sites de clubs.
- Templates de formats partagés entre orgas (marketplace de formules).

---

## 7. COMMANDES UTILES

```bash
# Simulations (base jetable locale, 31 tests)
npx vitest run -c vitest.sim.config.ts

# Typecheck (la page publique est en @ts-nocheck → compléter par un build)
npx tsc --noEmit
npx next build --experimental-build-mode compile

# Base de sim (si à recréer) — voir src/sim/sim-db.ts et .simdb/
```
