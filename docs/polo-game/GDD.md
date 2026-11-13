# GDD — jeu de bike polo (document de travail)

Statut : **proposition à valider par Morvan**. Les points marqués [À VALIDER] ne sont pas décidés.
Révision du 2026-11-13 : ambition relevée (qualité avant légèreté), contrôle direct du joueur, rythme posé, ralentis.
Révision 2 du 2026-11-13 : tir et passe simples au clic, aimantation légère, chute et pied à terre, règles EHBA 2023 (voir `RULES.md`).

## Vision
Un vrai jeu d'action-sport de bike polo en vue isométrique, dans le navigateur, sur Poloperator.
On n'y pilote pas un véhicule qui tourne en rond : on **incarne un joueur**. Il va où on le décide,
son maillet fait ce qu'on décide. Le jeu est beau, lisible, posé, et chaque geste compte.

Ce qu'on ne veut pas : les mini-jeux de polo existants où des vélos tournent en rond sur un terrain plat.

## Piliers
1. **La main sur le joueur à 100 %.** Déplacement direct (le joueur va dans la direction donnée), tir et
   passe là où on clique. Les aides restent légères (une petite aimantation de la balle), jamais de
   décision prise à la place du joueur.
2. **De la cohérence, pas de la simulation.** Le vélo a du poids : il accélère, il freine, il ne
   téléporte pas. Mais il pivote, fait du surplace et repart quand le joueur le demande.
3. **Un rythme posé.** Vitesses proches du vrai polo, pas un jeu de réflexes frénétique. On a le temps
   de lire le jeu, de se placer, de choisir son geste.
4. **Des temps forts.** Ralentis sur les gestes décisifs, caméra qui se rapproche, son qui s'étouffe.
5. **De la qualité.** Personnages modélisés et animés, vrai terrain, lumière soignée, son travaillé.
   Un écran de chargement est accepté.
6. **C'est notre communauté.** Clubs, joueurs et tournois de Poloperator dans le jeu.

## Contrôle du joueur (V1 : simple, sans en faire des tonnes)

| | Clavier + souris | Manette | Tactile |
|---|---|---|---|
| Se déplacer (direction libre, relative à l'écran) | ZQSD / flèches | stick gauche | joystick gauche |
| Freiner | espace | gâchette gauche | bouton |
| Viser | on clique à l'endroit voulu sur le terrain | stick droit (réticule) | on touche l'endroit voulu |
| Passe ou tir | clic gauche vers le point visé | gâchette droite | relâcher le doigt |
| Force | jauge continue : plus on maintient, plus la frappe est forte (pleine en 1,1 s) | idem | idem |

Le tir et la passe sont le même geste : la balle part vers le point cliqué, avec la force choisie.
Plus on tire fort, moins c'est précis et plus la balle se lève. Une jauge continue montre la force.

**Aimantation légère.** Quand la balle est près du maillet et que le joueur roule dans le même sens,
elle reste « au maillet » sans qu'on ait à la pousser à chaque pas. Elle se décroche si on tourne trop
sec, si on freine fort, si on est percuté, ou si un adversaire la touche. Un tir ou une passe ne part
que si la balle est à portée du maillet.

**Cohérence du déplacement.**
- La direction donnée est la direction voulue ; le vélo s'y aligne vite, avec une inertie visible mais courte.
- À basse vitesse : pivot quasi sur place, surplace possible.
- À pleine vitesse : virages plus larges. **Freiner prend du temps** (distance de freinage visible).
- Vitesse de pointe : 22 km/h (validé par Morvan).

## Tomber, pied à terre (dab) et tap-in
Le joueur peut tomber ou poser le pied. Il est alors **hors jeu** : il ne peut plus toucher la balle
et apparaît en transparence. Pour revenir, il doit rouler jusqu'à l'une des **deux zones de tap-in**,
sur la balustrade des grands côtés, au milieu du terrain, et y taper son maillet (c'est automatique
en arrivant dans la zone, ou sur une touche [À VALIDER]). Il redevient actif aussitôt.

Ce qui fait tomber ou poser le pied en V1 :
- **Tourner trop fort à pleine vitesse** : désactivé pour l'instant, trop dur à éviter au clavier.
  À reprendre plus tard, peut-être seulement à la manette.
- **Percuter la balustrade à grande vitesse** [À VALIDER].
- **Rester à l'arrêt trop longtemps sous pression** : non, pas en V1. Le surplace est libre.

Ce qui ne fait **pas** tomber en V1 : les collisions entre joueurs. Elles **ralentissent** seulement
les deux joueurs. Plus tard : foncer dans quelqu'un sera une faute et pourra le faire tomber
(voir `RULES.md`, contacts et sanctions).

## Ralentis
- **Concentration** : pendant qu'on maintient le clic pour doser un tir, le temps ralentit légèrement
  (jauge limitée, se recharge en jouant). Sert à viser, pas à tricher. [À VALIDER — peut attendre après la V1]
- **Temps forts automatiques** : but, arrêt du gardien, interception de justesse — court ralenti,
  caméra plus proche.
- **Rediffusion** du but sous un autre angle.
- En jeu en ligne, seuls les temps forts et la rediffusion resteront (la concentration ne peut pas
  ralentir le temps des autres) — à trancher au jalon M5.

## Règles
Le jeu suit le règlement EHBA 2023. Le détail, article par article, avec ce qui est en V1 et ce qui
vient plus tard, est dans `RULES.md`. En résumé, la V1 contient :
- le terrain, les cages et la balle aux vraies dimensions ;
- la joute de départ ;
- le but valable seulement sur un tir (pas en poussant la balle dans la cage) ;
- le dab et le tap-in ;
- les collisions qui ralentissent.

Pas d'arbitre, pas de fautes ni de sanctions en V1.
À valider par Morvan : durée du match (10 min ou premier à 5 ?), qui repart avec la balle après un but.

## Caméra
Isométrique, mais **vivante** : elle suit l'action de près (on ne voit pas tout le terrain en permanence),
dézoome quand le jeu s'étire, se rapproche sur les temps forts. Indicateurs en bord d'écran pour
les joueurs et la balle hors champ.

## Modes, dans l'ordre de construction
1. Terrain d'entraînement (un joueur, une balle, une cage, des plots) — sert à valider le contrôle.
2. 1 contre 1 contre un bot.
3. 3 contre 3 avec bots (le jeu complet en solo), avec changement de joueur contrôlé.
4. Tournoi contre les clubs de Poloperator, scores sur le profil.
5. Deux joueurs sur le même écran (manettes).
6. En ligne — seulement si les étapes précédentes sont convaincantes.

## Direction artistique
Low-poly stylisé **soigné** : personnages modélisés avec squelette, vélos détaillés (flasques, maillets),
terrain crédible (balustrade, grillage, lignes, bancs, public), ombres douces, éclairage de fin de journée
ou de nuit sous projecteurs. Palette Poloperator. Personnalisation : couleurs de club, flasques, maillet.
Animation : poses clés + cinématique inverse (mains au guidon, pieds aux pédales, bras du maillet).

## Hors périmètre pour l'instant
Arbitrage détaillé, blessures, météo, éditeur de terrain, boutique payante.
