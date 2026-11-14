# STATE — état du projet

Mis à jour : 2026-11-13

## Où on en est
**M1 (premier vrai match) : terminé côté code, en attente de l'essai de Morvan.** M0 attend aussi sa validation sur téléphone.
Match 1 contre 1 contre un bot (3 niveaux) : `src/polo-game/sim/match.ts`, `src/polo-game/ai/bot.ts`. Rapport : `qa/M1.md`.

## Pour essayer
`npm run dev`, puis ouvrir `/fr/polo`. ZQSD ou flèches pour rouler, espace pour freiner,
clic vers l'endroit visé ; maintenir pour remplir la jauge et frapper plus fort.
Manette et téléphone : voir l'aide en bas du jeu.

## Bloquant
1. Deuxième essai de Morvan après réglages (22 km/h, sans chute en virage, jauge continue). Valeurs dans `src/polo-game/sim/constantes.ts`.
2. Réponses aux réglages pris par défaut (voir `DECISIONS.md`, 2026-11-13) et aux points [À VALIDER] du GDD.
3. Skills gamedev : toujours pas installés, à décider.

## Tâche en cours
Aucune.

## Prochaines tâches
1. Morvan joue des matchs : difficulté, rythme (trop de buts ?), durée, ressenti du vol de balle et de la défense.
2. M0bis — tranche de qualité avec des packs gratuits (CC0) : trouver un personnage et un vélo utilisables, les intégrer dans une scène, les adapter si besoin. Décision de Morvan : packs gratuits d'abord, avec ou sans retouches.
3. Ensuite M2 (3 contre 3).

## Notes pour le prochain agent
- Les règles sont dans `RULES.md` (résumé du règlement EHBA 2023) : ne pas relire le PDF.
- `sim/pas.ts` modifie l'état en place et le renvoie ; tout le hasard passe par `alea(etat)`.
- Repère : x le long du terrain (40 m), y en largeur (20 m), z la hauteur. Dans la scène three.js, y du terrain = z.
- Côté droit du joueur = (−sin cap, cos cap). L'équipe 0 attaque vers +x, en haut à droite de l'écran.
- `window.__polo` expose `etat`, `match`, `lancerMatch`, `lancerEntrainement` pour les essais automatiques.
- Le bot ne lit que l'état et renvoie une `Commande`, comme un joueur humain ; sa difficulté est dans `NIVEAUX`.
- `src/engine/` et `src/sim/` appartiennent au moteur de tournois du site : ne pas y toucher.

## M0bis — cyclistes 3D (13/11/2026)
- Personnages Quaternius « Universal Base Characters » (CC0), homme et femme, tenue peinte en shader aux couleurs de l'équipe, casque ajouté.
- Vélo et maillet faits maison (`render/modeles.ts`) ; roue avant avancée (plus de contact avec le tube diagonal), guidon remonté.
- Pose par cinématique inverse (`render/cycliste.ts`) : pieds aux pédales, mains fermées sur le guidon et la poignée du maillet, buste penché.
- En jeu (`render/scene.ts`) : équipes mixtes au hasard, pédalage selon la vitesse, braquage, armé pendant la charge, frappe fouettée.
- Chargement en arrière-plan (`render/ressources.ts`, ~2 Mo dans `public/polo-game/`) ; formes simples en attendant ou si échec.
- À vérifier : fluidité sur téléphone (6 cyclistes en M2), pied à terre et retour tap-in à animer, chute.

## M2 — 3 contre 3, passes et combos (13/11/2026)
- Pans coupés à 45° dans les 4 coins (1,5 m) : joueurs et balle (`horsPan`), dessinés en jeu.
- La balle reste dans le filet après un but (avant : elle traversait la cage) ; la balle avance en sous-pas quand elle va vite.
- Aimant renforcé : 0,85 m normal, 1,05 m sur balle libre lente (récupération), 1,3 m sur une passe d'un coéquipier.
- Duel : au contact, chance de récupérer la balle tenue (plus forte si on arrive vite, plus faible si le porteur est lancé).
- Passes : `Commande.passe` plafonne la vitesse (14 m/s) ; le joueur humain a une passe assistée en visant vers un coéquipier.
- Combos : une-deux (2 passes) = tir +25 %, triangle (3 joueurs) = tir +50 %, fenêtre 3,5 s ; événements `passe` et `tirCombo`.
- Bots en équipe : rôles (porteur, soutien, couverture, marquage), passes sous pression ou pour enchaîner, réception au-devant.
- Menu : Match 3 contre 3 (Facile, Moyen, Difficile). 40 tests.
- À régler au jeu : fréquence des passes des bots, taille de la fenêtre de combo, force du duel.

## M2 — IA d'équipe façon hockey 3 contre 3 (13/11/2026)
- `ai/tactique.ts` : rôles partagés par équipe, recalculés à chaque pas avec inertie — porteur, premier (seul à aller à la balle / au pressing), soutien (large et devant en attaque, marquage individuel en défense), arrière (haut en sécurité en attaque, devant la cage en défense). L'humain compte : s'il est le plus près de la balle, aucun bot n'y va ; on ne lui confie pas le rôle d'arrière.
- Porteur : tir seulement si le couloir est ouvert ; passe sous pression, vers le soutien écarté, ou en repli vers l'arrière quand c'est bouché ; sinon conduit le long du côté avant de rentrer.
- Simulation : le porteur garde la balle dans un simple contact (le duel au maillet peut la lui prendre) ; une balle captée de loin ne s'échappe plus aussitôt.
- Mesures bots contre bots (4 min) : ~0,65 joueur par équipe à moins de 4 m de la balle, écart en largeur ~8 m, balle tenue ~35 % du temps, 35 à 55 passes réussies par match.

## Pied à terre et tap-in animés (13/11/2026)
- Règle : en dessous de 0,8 m/s pendant 2,2 s, le joueur pose le pied → hors jeu jusqu'au tap-in (événement `piedAterre`). L'anneau rougit et un message prévient avant.
- Pas de pied à terre pendant la pause après un but. Les bots repartent en petit cercle avant de perdre l'équilibre.
- Rendu : pied gauche posé au sol, vélo penché ; geste de maillet au tap-in. Son dédié.
- Correctif : les versions de `bot.ts` (tactique d'équipe), `index.ts` et `scene.ts` (caméra) poussées en ligne au commit 2821307 étaient d'une version antérieure ; remises à jour.
