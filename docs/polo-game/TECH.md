# TECH — architecture et budgets

## Choix
- **Rendu** : three.js, caméra orthographique fixe en iso, WebGL (pas WebGPU).
- **Simulation** : maison, 2D + hauteur de balle, pas fixe à 60 Hz, déterministe, TypeScript pur
  sans DOM ni three.js. Pas de moteur physique externe.
- **Joueur** : contrôleur de personnage direct (direction voulue -> vitesse, avec inertie courte), pas
  un modèle de véhicule à rayon de braquage. Tir et passe vers un point visé du terrain, 3 niveaux
  de force. Aimantation légère de la balle au maillet. États du joueur : actif, tombé / pied à terre
  (hors jeu), retour par tap-in. Les règles suivent `RULES.md`.
- **Échelle de temps** : la simulation accepte un facteur de temps (ralentis) sans changer le pas fixe.
- **Personnages** : modèles glTF avec squelette, poses clés + cinématique inverse (mains, pieds, maillet).
- **Chargement** : écran de chargement avec progression ; modèles compressés (Draco/Meshopt), textures KTX2.
- **Intégration** : composant client chargé à la demande (`dynamic`, `ssr: false`) sur une page
  `src/app/[locale]/polo/`. Le jeu n'importe rien de Prisma ; il parle au site par des actions serveur.
- **Tests** : vitest existant (`npm test`). Les tests du jeu sont des `*.test.ts` dans `src/polo-game/`.
  Ne pas toucher à `vitest.sim.config.ts` ni à `src/sim/` (harnais des tournois, autre sujet).

## Arborescence prévue (rien n'est créé)
```
src/polo-game/
  sim/      état, pas de simulation, vélo, balle, collisions, règles   (aucun import de rendu)
  input/    clavier, manette, tactile -> commandes abstraites
  ai/       bots : lisent l'état, produisent des commandes
  render/   scène three.js, modèles en code, caméra, effets
  ui/       HUD et menus (React), sons
  index.ts  boucle : entrées -> sim (pas fixe) -> rendu (interpolé)
```
Règle d'or : `sim/` ne dépend de rien. C'est ce qui permet les tests sans navigateur, les bots
qui jouent mille matchs pour l'équilibrage, et plus tard le jeu en ligne.

## Budgets (à vérifier par polo-qa à chaque jalon)
| Sujet | Budget |
|---|---|
| Code du jeu (gzip, three.js compris) | ≤ 2 Mo |
| Assets au premier lancement (modèles, textures, sons) | ≤ 25 Mo, avec progression, mis en cache ensuite |
| Images par seconde | 60 sur ordinateur, ≥ 45 sur téléphone milieu de gamme |
| Appels de dessin | ≤ 250 |
| Réglages de qualité | 3 niveaux (ombres, post-traitement, public) choisis automatiquement |
| Un pas de simulation (6 vélos + balle) | ≤ 1 ms |
| Texture | ≤ 1024 px sauf exception notée ; sons compressés |

## Garde-fous
- Aucun changement de `prisma/schema.prisma`, aucune migration, aucune écriture en base sans accord explicite de Morvan.
- Ne jamais lire ni déplacer les fichiers `*.dump` et `db-backup-*` à la racine.
- Hébergement Vercel : pas de connexion temps réel permanente. Le jeu en ligne demandera un serveur à part (décision au jalon M5).
