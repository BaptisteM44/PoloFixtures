# ROADMAP

Chaque jalon se termine par un rapport `qa/Mx.md` et un essai par Morvan. On ne passe pas au suivant sans son accord.

## M0 — Le contrôle (le seul jalon qui compte au début)
Terrain d'entraînement : un joueur, une balle, une cage, des plots, vue iso. Formes simples, pas encore de beaux modèles.
- [x] Déplacement direct : direction libre, inertie courte, pivot à basse vitesse, surplace
- [x] Conduite de balle avec aimantation légère
- [x] Tir et passe vers le point cliqué, 3 niveaux de force
- [x] Freinage qui prend du temps ; chute si on tourne trop fort à pleine vitesse
- [x] Hors jeu après une chute, retour par tap-in au milieu d'un grand côté
- [x] Balle : roulement, rebond sur la balustrade, hauteur, ombre
- [x] Terrain, cage et balle aux dimensions de `RULES.md`
- [x] Caméra iso qui suit ; clavier + souris
- [x] Manette, tactile (joystick + FRAPPER + FREIN, sous le jeu en portrait)
- [x] Sons synthétisés (frappe selon la force, jauge, rebonds, poteau, plot, but, chute, tap-in), bouton muet
- [x] Poteaux et plots solides
Accepté si : Morvan sent qu'il a la main à 100 % et a envie de continuer après 5 minutes ; tests de simulation verts.

## M0bis — La tranche de qualité
Une seule scène au niveau visuel final : un joueur modélisé et animé, le terrain, la lumière, le son d'une frappe, un ralenti de but.
- [ ] Choix de la source des modèles (voir `STATE.md`) et d'un personnage test
- [ ] Animation : pédalage, mains et pieds par cinématique inverse, frappe
- [ ] Écran de chargement, niveaux de qualité, test sur téléphone
Accepté si : Morvan valide que « c'est ce niveau-là qu'on veut » avant de produire le reste.

## M1 — Un vrai duel
- [x] Buts, score, chrono (arrêté à chaque but), joute de départ
- [x] But valable seulement sur un tir ; balle poussée = arrêt, balle à la défense
- [x] Collisions entre joueurs qui ralentissent ; vol de balle au maillet ; le vélo arrête la balle
- [x] Bot adverse 1 contre 1, 3 niveaux, qui respecte le dab et le tap-in
- [x] Ralentis : but et poteau ; rediffusion du but ; indicateurs de balle et d'adversaire hors champ
Accepté si : on peut gagner et perdre un match complet.

## M2 — 3 contre 3
- [ ] Coéquipiers et adversaires bots, gardien
- [ ] Changement de joueur contrôlé, passes
- [ ] Trois niveaux de difficulté
Accepté si : les bots jouent 200 matchs sans blocage dans les tests, et le match est lisible.

## M3 — Dans Poloperator
- [ ] Page `/polo`, compte du joueur, couleurs de son club
- [ ] Tournoi contre des clubs réels, score enregistré sur le profil
Accepté si : aucun changement de base non validé ; le site reste aussi rapide hors de la page du jeu.

## M4 — Finition
- [ ] Sons, effets, menus, tutoriel de 30 secondes
- [ ] Deux joueurs sur le même écran, manettes
- [ ] Passe de performance sur téléphone

## M5 — En ligne (porte de décision)
À décider avec Morvan : coût mensuel du serveur, méthode de synchronisation, anti-triche.
