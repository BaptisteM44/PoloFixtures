# Jeu de bike polo — mode d'emploi du projet

Ce dossier est la mémoire du projet. Tout agent (et toute nouvelle session) commence par lire
`STATE.md`, puis seulement les documents utiles à sa tâche. Rien n'est commencé côté code.

| Fichier | Rôle | Qui le modifie |
|---|---|---|
| `STATE.md` | Où on en est, tâche en cours, prochaines tâches. Court (< 60 lignes). | polo-producer |
| `GDD.md` | Le jeu : vision, piliers, commandes, chute et tap-in, modes. | polo-designer (validé par Morvan) |
| `RULES.md` | Résumé du règlement EHBA 2023 : règle réelle, V1, plus tard. | polo-designer (validé par Morvan) |
| `TECH.md` | Architecture, budgets de perf et de poids, conventions. | session principale |
| `ROADMAP.md` | Jalons M0 → M5 avec critères d'acceptation. | polo-producer |
| `DECISIONS.md` | Journal des décisions (une ligne datée par décision). | tout le monde, en ajout seul |
| `qa/` | Rapports de test, un fichier par jalon. | polo-qa |

## L'équipe (`.claude/agents/`)

| Agent | Modèle | Sert à |
|---|---|---|
| `polo-producer` | haiku | Découper un jalon en tâches, tenir `STATE.md` et `ROADMAP.md` à jour |
| `polo-designer` | sonnet | Règles, commandes, valeurs de réglage, GDD |
| `polo-gameplay` | sonnet | Simulation : contrôle direct, tir et passe au clic, chute et tap-in, balle, règles, entrées |
| `polo-render` | sonnet | three.js : caméra iso vivante, personnages et terrain, lumière, effets, ralentis |
| `polo-ai` | sonnet | Bots : coéquipiers, adversaires, gardien |
| `polo-ui-audio` | sonnet | HUD, menus, sons, commandes tactiles |
| `polo-integration` | sonnet | Page Next.js, comptes, clubs, scores (propose, ne migre jamais seul) |
| `polo-qa` | haiku | Tests de simulation sans navigateur, conformité à `RULES.md`, budgets, rapport |
| `polo-reviewer` | sonnet | Relecture d'un diff avant validation, sans l'avoir écrit |

Commandes : `/polo-status` (où on en est), `/polo-next` (fait la prochaine tâche), `/polo-playtest` (vérifie le jalon en cours).

## Règles pour que ça coûte peu

1. **Une tâche = un agent.** Pas de lancement en parallèle sauf demande explicite de Morvan.
2. **`STATE.md` d'abord.** Un agent ne relit pas tout le dépôt : il lit `STATE.md` et les fichiers cités dans sa tâche.
3. **Tests sans navigateur d'abord.** La simulation tourne dans Node (vitest). Les captures d'écran sont réservées à la fin d'un jalon.
4. **Petits diffs.** Une tâche touche un seul sous-dossier de `src/polo-game/`.
5. **Pas d'achat sans accord.** Modèles et sons : faits par nous (code, Blender) ou en licence libre (CC0), source notée dans `DECISIONS.md`. Tout achat d'asset ou travail d'artiste est une décision de Morvan. Aucune dépendance ajoutée sans son accord.
6. **Haiku pour la routine, Sonnet pour le code.** Le réglage fin du ressenti (jalon M0) se fait en session principale avec Morvan, pas en agent.
7. **Pas de commit ni de push sans demande de Morvan.**
