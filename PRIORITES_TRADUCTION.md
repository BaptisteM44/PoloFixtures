# PRIORITÉS DE TRADUCTION - BIKEPOLO NEXTJS

## Vue d'ensemble

**État global:** 85% de traduction complète (1217/1435 clés)

```
Allemand (DE):  1217 clés ✓  | 223 manquantes ✗ | 429 en anglais ⚠️
Espagnol (ES):  1217 clés ✓  | 223 manquantes ✗ | 416 en anglais ⚠️
Français (FR):  1435 clés ✓  
Anglais (EN):   1434 clés ✓
```

---

## PHASE 1: URGENT (Semaine 1) - 223 clés orphelines

### Tâche critique: Ajouter les clés manquantes

**Impact:** Bloque actuellement la création de tournois en DE/ES
**Effort estimé:** 4-6 heures
**Assigné à:** Traducteur DE/ES

### Sous-tâches par contexte

#### 1. TOURNOI - 85 clés (HAUTE PRIORITÉ)
**Raison:** Feature complète manquante  
**Impact utilisateur:** Formulaire de création brut en DE/ES

```
tournament.* = 85 clés
- Sections du formulaire (12)
- Champs (20)
- Options logistique (10)
- Co-organisateurs (6)
- Dashboard (12)
- Messages/erreurs (15)
- Listes d'équipes (10)
```

Fichier source: `TRADUCTIONS_PROPOSEES.json` → `de.de` et `es.es`

#### 2. ÉQUIPES & SÉLECTION - 46 clés (HAUTE-MOYENNE)
**Raison:** UX critique pour joueurs  
**Impact utilisateur:** Interface de gestion d'équipes confuse

```
team.* = 7 clés
my_teams.* = 22 clés
selection.* = 17 clés
free_agent.* = 1 clé
```

#### 3. ADMINISTRATION - 36 clés (MOYENNE)
**Raison:** Réservé aux administrateurs  
**Impact utilisateur:** Panneau d'admin inutilisable

```
admin.* = 36 clés
- Gestion joueurs/clubs (12)
- Configuration pays (10)
- Codes d'accès (6)
- Navigation (8)
```

#### 4. CLUBS & CONTINENTS - 34 clés (MOYENNE)
```
club.* = 17 clés
continent.* = 17 clés
```

#### 5. DIVERS - 10 clés (BASSE)
```
notifications.* = 1 clé
player.* = 1 clé
messages.* = 1 clé
(+ 7 autres contextes mineurs)
```

---

## PHASE 2: CRITIQUE (Semaines 2-3) - ~400 clés non traduites

### Problème: Texte anglais au lieu de traduction

**429 clés en DE** | **416 clés en ES** conservent du texte anglais

### Stratégie par contexte:

#### TRÈS URGENT (commun.*, bracket.*)
- `common.cancel`, `common.close`, `common.send` etc (30 clés)
- Utilisé partout dans l'interface
- **Effort:** 1-2 heures

#### URGENT (players.*, match.*)
- Visible aux joueurs dans tournois
- ~100+ clés
- **Effort:** 2-3 heures

#### NORMAL (bracket.*, standings.*)
- Affichage des classements
- ~150 clés
- **Effort:** 3-4 heures

#### STANDARD (misc, edge cases)
- Divers, rarements affichés
- ~100+ clés
- **Effort:** 2-3 heures

---

## PHASE 3: MAINTENANCE (Semaine 4+)

### 1. Validation & QA
- [ ] Tester interface en DE/ES dans tous les scénarios
- [ ] Vérifier longueur textes (prise d'espace UI)
- [ ] Checker variables `{count}`, `{date}`, `{name}`
- [ ] Emojis préservés correctement

### 2. Processus pour nouvelles clés
- [ ] Checklist avant merge: "Nouvelles clés traduites?"
- [ ] Template de PR mentionnant les 3 langues
- [ ] Outil d'extraction auto des clés manquantes

### 3. Documentation
- [ ] Guide de traduction BikePolo (conventions)
- [ ] Glossaire sport DE/ES
- [ ] Points délicats (gendered words en ES)

---

## FICHIERS À MODIFIER

### Source des traductions:
- **RAPPORT_TRADUCTIONS.md** - Détail complet
- **TRADUCTIONS_PROPOSEES.json** - Format JSON prêt à copier

### Fichiers à updater:
```
/messages/de.json  (ajouter 223 clés)
/messages/es.json  (ajouter 223 clés)
```

### Processus de merge:

1. Valider les traductions avec natifs DE/ES
2. Fusionner `TRADUCTIONS_PROPOSEES.json` → `de.json`/`es.json`
3. Tester en dev/staging (DE/ES uniquement)
4. Commit: "fix: add 223 missing German and Spanish translations"
5. Merge dans `main`

---

## CHECKLIST D'IMPLÉMENTATION

### Phase 1: Clés orphelines (URGENT)
- [ ] Copier 223 clés de `TRADUCTIONS_PROPOSEES.json`
- [ ] Valider avec locuteur natif allemand
- [ ] Valider avec locuteur natif espagnol
- [ ] Test en interface locale (DE/ES)
- [ ] Merge PR

**Timeline:** J1-J3 (48h production)

### Phase 2: Clés en anglais (CRITIQUE)
- [ ] Identifier toutes les ~400 clés restantes
- [ ] Prioriser par contexte (common → bracket → players)
- [ ] Traduire par batch de 50 clés
- [ ] Validation + tests
- [ ] Merge par contexte

**Timeline:** J4-J10 (une semaine)

### Phase 3: Maintenance (CONTINU)
- [ ] Documenter processus
- [ ] Mettre en place alertes de clés manquantes
- [ ] Audits mensuels

**Timeline:** Continu

---

## NOTES TECHNIQUES

### Variables à ne PAS traduire:
```
{count}, {max}, {date}, {name}, {country}
```

### Conventions conservées:
- Emojis: 📅 🏠 🥐 🍽️ 🌙 etc
- Formats: "1 — ", "← Back", "{x}/{y}"
- Sigles sportifs: SE, DE, RR (restent en anglais)
- Noms systèmes: "Swiss", "Round Robin"

### Points délicats:

**Allemand:**
- Capitalization des noms (Team, Turnier, Spieler)
- Compound words (Ansichten → "Übersicht")
- Gendered forms (Spieler/Spielerin)

**Espagnol:**
- Voseo vs tú (utiliser tú pour cohérence)
- Gendered nouns (equipo/jugador singulier/pluriel)
- Accents obligatoires

---

## RESSOURCES

- **Fichiers de traduction:** `/messages/`
- **Rapport détaillé:** `RAPPORT_TRADUCTIONS.md`
- **Traductions proposées:** `TRADUCTIONS_PROPOSEES.json`
- **Glossaire:** À créer

---

## CONTACTS

- Traducteur DE: [À désigner]
- Traducteur ES: [À désigner]
- QA Lead: [À désigner]
- Product Manager: Baptiste

---

**Rapport généré:** 25 mars 2026  
**Analyseur:** Claude Code  
**Statut:** À traiter - Roadmap établie
