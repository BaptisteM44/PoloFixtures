# Audit des formats — refonte formats

> Généré par le harnais de simulation (`src/sim/`) le 2026-07-03.
> Chaque format est joué EN ENTIER contre une DB locale jetable, en passant par
> les vraies actions serveur et la vraie route de saisie de score — exactement
> le chemin de code de la prod.

## ✅ ÉTAT ACTUEL (après Phase 1) : 15/15 AU VERT

La Phase 1 a corrigé les 3 bugs ci-dessous via :
- **Nouveau moteur DE générique** (`src/engine/bracket-core.ts` + `de.ts` + `persist-de.ts`) :
  plan de bracket complet (WB/LB/GF/reset) pour n'importe quel nombre d'équipes,
  byes gérés par contraction de fantômes, liens vérifiés par construction.
  123 tests unitaires (n=3..32, simulations complètes jouées de bout en bout).
  `generateBracketAction` (chemin DE) est rebranché dessus — l'ancien câblage
  slot-claiming de ~400 lignes est court-circuité.
- **Fix planification Swiss** : chaque round démarre après le dernier match du
  round précédent (`generateSwissRoundAction`).
- **Fix planification cross-pool** : le bracket démarre après le dernier match
  cross-pool (`generateCrossPoolSEAction`).

Le tableau et l'analyse ci-dessous documentent l'état AVANT Phase 1 (référence historique).

---

# Phase 0 — état initial (historique)

## Comment relancer l'audit

```bash
# 1. Démarrer la DB de simulation locale (une fois par session)
/opt/homebrew/opt/postgresql@18/bin/pg_ctl -D .simdb -o "-p 5433 -k /tmp" start

# 2. (première fois seulement) pousser le schéma
mv .env .env.simbak && DATABASE_URL="postgresql://sim@localhost:5433/bikepolo_sim" \
  DIRECT_URL="postgresql://sim@localhost:5433/bikepolo_sim" \
  npx prisma db push --skip-generate ; mv .env.simbak .env

# 3. Lancer l'audit
npx vitest run -c vitest.sim.config.ts
```

⚠️ Le CLI Prisma lit `.env` en priorité (donc la **prod Coolify**) — d'où le `mv .env` temporaire.
Le harnais lui-même vérifie `current_database() = bikepolo_sim` avant toute écriture.
Note : depuis le Mac, l'URL du `.env` (hostname Docker interne Coolify) ne résout pas — 
les opérations de schéma sur la prod passent par le terminal DB de Coolify (SQL idempotent).

## Résultats (seed RNG 42)

| Format | Verdict | Matchs | Problème |
|---|---|---|---|
| ALL_DAY + SE ×8 (+3e place) | ✅ OK | 36 | — |
| ALL_DAY + **DE** ×8 | ❌ **CRITIQUE** | 39 | Bracket bloqué : 3 slots jamais remplis, propagation W R1→R2 cassée, tournoi jamais COMPLETED |
| SPLIT_POOLS×2 + SE ×16 (+3e) | ✅ OK | 72 | — |
| SPLIT_POOLS×2 + **DE** ×16 | ❌ **CRITIQUE** | 80 | 6 slots jamais remplis (R1, R4, R5, R6), 2 propagations cassées |
| SPLIT_POOLS×2 + **DE** ×16 (GF reset) | ❌ **CRITIQUE** | 80 | 7 slots jamais remplis, mêmes causes |
| SPLIT_POOLS×2 + cross-pool + SE ×16 | ⚠️ MOYEN | 72 | Bracket et cross-pool planifiés au même horaire (dateEnd) |
| SWISS(5) + SE ×16 | ⚠️ MOYEN | 48 | Tous les rounds Swiss générés au même horaire (dateStart) → conflits de planning permanents |
| SWISS(5) + **DE** ×16 | ❌ **CRITIQUE** | 51 | Bracket DE bloqué (idem) + conflits horaires Swiss |
| SWISS(6) + SWISS_SPLIT_SE ×18 | ⚠️ MOYEN | 72 | Conflits horaires Swiss uniquement — les 2 brackets (Top 10 / Bottom 8) fonctionnent |
| SPLIT_POOLS×2 + SPLIT_SE ×16 | ✅ OK | 80 | — |
| GRAZ ×16 | ✅ OK | 78 | — |
| KIOSQUE ×16 | ✅ OK | 70 | — |
| MTP_OPEN ×20 | ✅ OK | 134 | (le match GF-reset dormant est un comportement légitime) |
| BIG_APPLE ×16 | ✅ OK | 84 | — |
| SPLIT_SWISS ×16 + **DE** | ❌ **CRITIQUE** | 64 | Même bug DE via generateBracketAction (délégation) |
| BERLIN_MIXED | ⬜ NON AUDITÉ | — | Orchestration manuelle complexe — à couvrir en v2 du harnais |

## Synthèse

### 🔴 Bug n°1 — CRITIQUE : la Double Élimination de `generateBracketAction` est cassée
**Tous** les tournois `sundayFormat = DE` génèrent un bracket dont le loser bracket
n'est pas correctement câblé :
- des matchs LB ne reçoivent jamais leur 2e équipe (slots `B∅` définitifs) ;
- la propagation du vainqueur W R1 → W R2 envoie l'équipe dans un slot écrasé ensuite
  (collision d'assignation de slots) ;
- conséquence : **le tournoi ne peut jamais se terminer** (jamais COMPLETED).

Fait notable : les tests unitaires `de-linking.test.ts` passent (48/48) alors que le
comportement réel de bout en bout est cassé → les tests lib ne testaient pas le vrai
chemin de code. C'est LA démonstration de la valeur du harnais et de la refonte.

À corriger en priorité en Phase 1 (moteur DE générique + tests bout en bout).

### 🟠 Bug n°2 — MOYEN : la planification Swiss met tous les rounds au même horaire
`generateSwissRoundAction` planifie chaque round à `dateStart` pile, tous terrains
confondus. En prod, la re-planification en cascade (à chaque match fini) masque
partiellement le problème, mais le planning affiché est faux tant que rien n'est joué.

### 🟠 Bug n°3 — MOYEN : cross-pool et bracket planifiés au même horaire (dateEnd)

### ✅ Formats sains (chemin nominal, sans égalités)
ALL_DAY+SE, SPLIT_POOLS+SE, SPLIT_SE, SWISS_SPLIT_SE (brackets), GRAZ, KIOSQUE, MTP_OPEN, BIG_APPLE.

## Limites connues du harnais v1
- Pas d'égalités générées (les brackets des formats spéciaux acceptent une égalité
  à la clôture — bug latent connu, la route ne bloque les nuls que pour `phase=BRACKET`).
- Pas de corrections de score après coup, pas de resets (à couvrir en v2).
- Berlin Mixed non couvert.
