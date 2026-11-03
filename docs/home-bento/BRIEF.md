# Refonte de la home joueur : disposition en tuiles (bento)

Référence visuelle : `docs/home-bento/maquette.dc.html`. C'est une maquette statique en HTML, avec une syntaxe propre à l'outil de design : `<x-dc>`, `{{ }}`, `<sc-for>`. Elle sert à reprendre la structure, les tailles et les styles. Elle ne se copie pas telle quelle dans le code.

Contrainte générale : **garder le design system existant** de `src/styles/globals.css`. Ça veut dire :
- les variables `--bg`, `--surface`, `--teal`, `--pink`, `--yellow`, `--purple`, `--orange`, `--border`, `--shadow`, `--radius` ;
- les polices Space Grotesk et Chakra Petch ;
- les bordures de 2px et l'ombre décalée ;
- le mode sombre via `[data-theme="dark"]`.

Dans la maquette, les couleurs sont écrites en dur : il faut les remplacer par ces variables.

Ce qui ne change pas : le header, le footer, la largeur de page (`.page`, padding 6vw) et la section « Tournois actifs » (`TournamentCard`, grille 3 colonnes).

Ne concerne que la version **connectée** (`me` non null). La version visiteur (`.hero`) reste telle quelle.

## Fichiers concernés
- `src/app/[locale]/page.tsx` : ordre des sections et données.
- `src/components/HomeHeroPersonal.tsx` : à éclater en tuiles, ou à remplacer par un composant `HomeBento`.
- `src/components/NextTrainingCard.tsx` (`TrainingAgendaRow`) : à réutiliser dans la tuile Entraînement.
- `src/components/TournamentMapClient.tsx` : la carte Leaflet actuelle, à mettre dans une tuile.
- `src/styles/globals.css` : nouvelles classes `.home-bento-grid`, `.bento-tile`, etc.

## Structure

Juste au-dessus de la grille, sur une seule ligne :
- à gauche : la date du jour en surtitre, « Salut {prénom} », le but animé et une phrase de résumé (« 1 tournoi et 1 entraînement dans les deux prochaines semaines ») ;
- à droite : les boutons « Mes tournois » et « Créer un tournoi » (en rose).

Grille CSS de 12 colonnes, `gap: 20px`, `grid-auto-rows: minmax(200px, auto)`. Les tuiles sont rangées dans l'ordre du DOM ci-dessous.

| # | Tuile | Desktop (col × lignes) | Contenu |
|---|-------|------------------------|---------|
| 1 | Prochain tournoi | 8 × 2 | Label « Ton prochain tournoi » + pilule de statut (Inscrit). Compte à rebours en grand (« 11 jours avant le coup d'envoi »). Nom, ville et dates. Trois mini-blocs : Format, Équipes x/y, Ton équipe (ou « Tirage à venir »). Boutons « Voir le tournoi » (noir) et « Calendrier ». Affiche du tournoi à droite (220px de large). |
| 2 | Carte joueur | 4 × 2 | La `PokemonCard` actuelle aux proportions **340×520 exactes**, sans déformation. Elle remplit la largeur de la colonne (max 420px) avec `aspect-ratio`. Elle fixe la hauteur des deux premières lignes. |
| 3 | Entraînement | 4 × 1 | Fond rose clair. Date et heure en grand, nom de la session et du club, lieu, nombre d'inscrits. Bouton « J'y vais » + itinéraire. Données : `trainingTiles[0]`. |
| 4 | Ensuite | 4 × 1 | Le tournoi suivant de l'agenda, avec la pilule « En attente de tirage » si besoin. |
| 5 | Inscriptions ouvertes | 4 × 1 | Les 3 prochains tournois dont les inscriptions sont ouvertes. Par ligne : un bloc date, le nom, la ville, une barre de remplissage des équipes et un bouton « S'inscrire ». **Nouvelle requête** (voir plus bas). |
| 6 | La communauté | 4 × 1 | Fond jaune, compacte. Grand chiffre « 943 » + « joueur·euses · 49 pays · 110 tournois ». Une barre par continent (calée sur le plus grand nombre), qui renvoie vers `/tournaments?continent=XX`. Remplace la grille `.continent-grid`. |
| 7 | Carte du monde | 8 × 2 | `TournamentMapClient` dans la tuile. Les trois rangées de filtres deviennent trois menus déroulants (Continent / Format / Statut) dans l'en-tête de la tuile. La légende passe sous la carte. Les stats ne sont plus affichées ici (elles sont dans La communauté). |
| 8 | Mes prochains tournois | 4 × 1 | Sous La communauté, à gauche de la carte. Les deux tuiles empilées font la hauteur de la carte. Liste `myUpcomingTournaments` : date, nom, ville, J-x, pilule de statut (Inscrit / Tirage). Bouton « Voir mes tournois ». |
| 9 | Nouveaux joueurs | 12 × 1 | **Une seule rangée**, sans retour à la ligne : `display:flex`, éléments en `flex: 1 0 84px`, défilement horizontal si ça déborde. 12 joueurs. |

Ensuite viennent « Tournois actifs », **inchangée**, puis le calendrier. Le calendrier pourra plus tard passer derrière un bouton : à confirmer.

Squads : la tuile est retirée. Le nombre d'invitations en attente pourra revenir sous forme de badge plus tard.

### Responsive
- `≤1100px` : 6 colonnes. Prochain tournoi, carte du monde, Inscriptions ouvertes et Nouveaux joueurs prennent 6 colonnes. La carte joueur aussi (max 360px, centrée). Entraînement, Ensuite, La communauté et Mes prochains tournois prennent 3 colonnes.
- `≤768px` : une seule colonne, tout s'empile. L'affiche du prochain tournoi passe sous le texte. La carte joueur peut rester masquée sur mobile, comme aujourd'hui (`.home-bento__card { display:none }` à 900px).

### Style commun des tuiles
`background: var(--surface)`, `border: 2px solid var(--border)`, `border-radius: 18px`, `box-shadow: var(--shadow)`, `padding: 24px`, `display:flex; flex-direction:column; gap:14px`.

Label de tuile : Chakra Petch 12px, 700, uppercase, `letter-spacing:.1em`, icône SVG de 16px. Plus d'emoji dans les labels.

## But animé à côté de « Salut {prénom} »
- SVG inline d'environ 132×64 : sol, but en vue de côté avec filet, balle orange avec son ombre, maillet (manche, grip, tête cylindrique teal).
- L'animation se déclenche **uniquement au clic**, sur un `<button aria-label="Tirer au but">`. Elle dure 2,3s et ne se répète pas. Un clic pendant qu'elle joue ne la relance pas.
- Au survol, le maillet s'arme légèrement (`rotate(12deg)`).
- Les keyframes `swing`, `shot`, `shotshadow` et `bulge` sont dans la maquette : copie-les telles quelles.
- Pas d'animation si `prefers-reduced-motion: reduce`.
- À faire dans un petit composant client (`"use client"`), qui ajoute la classe `.play` pendant 2350 ms.

## Données à ajouter dans `page.tsx`
1. **Inscriptions ouvertes** :
   ```ts
   prisma.tournament.findMany({
     where: { approved: true, hidden: false, status: "UPCOMING",
       registrationStart: { lte: now }, OR: [{ registrationEnd: null }, { registrationEnd: { gte: now } }],
       // exclure les tournois où je suis déjà inscrit
       id: { notIn: myUpcomingTournaments.map(t => t.id) } },
     include: { teams: { where: { selected: true } } },
     orderBy: { dateStart: "asc" }, take: 3,
   })
   ```
   Le mieux est de trier en priorité les tournois du continent du joueur (`playerContinent`). Vérifie comment le statut « inscriptions ouvertes » est calculé ailleurs (carte ou `TournamentCard`) et réutilise la même règle.
2. **Mes prochains tournois** : `myUpcomingTournaments` existe déjà. Il faut y ajouter le statut de tirage (`selectionLocked`) et le nombre de jours restants.
3. **Résumé sous le titre** : nombre de tournois et d'entraînements dans les 14 prochains jours.

## Bug à corriger au passage
Dans `awaitingDraw`, seul `heroNext` est exclu, alors que `heroOthers` contient déjà les autres tournois. Résultat : un même tournoi (LDC Tours) apparaît deux fois dans « À venir pour toi ». Avec la nouvelle structure, chaque tournoi ne doit apparaître qu'une fois. Fusionne les deux listes en une seule, avec un champ de statut par tournoi.

## Vérifications
- Mode clair et mode sombre.
- Largeurs 1440, 1100, 768 et 390.
- Aucune tuile ne doit couper son contenu.
- La carte joueur garde exactement son ratio 340:520.
- `npm run lint` et `npm test` passent.
