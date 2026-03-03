# 🏅 Badge System — Roadmap & Design

> Ce fichier documente le système de badges prévu. À implémenter quand le concept sera finalisé.

---

## Architecture

### 1. Catalogue de badges
Un fichier `BADGE_CATALOG` qui décrit tous les badges existants (id, nom, emoji, description, catégorie, rareté). Facile à enrichir.

### 2. Attribution automatique
Un système qui scanne les données du joueur et attribue les badges débloqués. Persistés dans `player.badges` (array de badge IDs).

### 3. Badges affichés
Nouveau champ `player.displayBadges` (array, max 5) que le joueur choisit dans sa page profil. Seuls ceux-là apparaissent sur la PokemonCard.

### 4. Raretés
- **Commun** (gris) — Facile à obtenir, premiers pas
- **Rare** (bleu) — Nécessite de l'investissement
- **Épique** (violet) — Accomplissements significatifs
- **Légendaire** (doré) — Réservé aux exploits exceptionnels

---

## Catégories & Badges

### ⚡ Performance (match/tournoi)
| ID | Badge | Emoji | Condition | Rareté |
|---|---|---|---|---|
| first_blood | First Blood | 🩸 | Marquer son 1er but | Commun |
| hat_trick | Hat Trick | 🎩 | 3+ buts dans un tournoi | Commun |
| sniper | Sniper | 🎯 | 10+ buts en carrière | Rare |
| goal_machine | Goal Machine | 💣 | 50+ buts en carrière | Épique |
| century_club | Century Club | 💯 | 100+ buts en carrière | Légendaire |
| clean_ride | Clean Ride | 🧤 | 0 pénalités dans un tournoi (avec 1+ but) | Commun |
| hard_edge | Hard Edge | 💥 | 3+ pénalités dans un tournoi | Commun |
| unbeaten | Unbeaten | 🛡️ | Aucune défaite dans un tournoi | Rare |
| champion | Champion | 🏆 | Gagner un tournoi (bracket final) | Épique |
| back_to_back | Back to Back | 👑 | Gagner 2 tournois d'affilée | Légendaire |

### 🤝 Équipe
| ID | Badge | Emoji | Condition | Rareté |
|---|---|---|---|---|
| team_player | Team Player | 🤝 | Participer à son 1er tournoi | Commun |
| squad_up | Squad Up | 🫂 | 3+ tournois joués | Commun |
| veteran | Veteran | ⚔️ | 10+ tournois joués | Rare |
| road_warrior | Road Warrior | 🗺️ | Jouer dans 3+ pays différents | Rare |
| globe_trotter | Globe Trotter | 🌍 | Jouer sur 3+ continents | Épique |
| loyal_rider | Loyal Rider | 💛 | Jouer 3+ fois avec le même coéquipier | Rare |

### 🏗️ Organisation
| ID | Badge | Emoji | Condition | Rareté |
|---|---|---|---|---|
| host | Host | 📋 | Organiser son 1er tournoi | Commun |
| serial_organizer | Serial Organizer | 🎪 | Organiser 3+ tournois | Rare |
| community_builder | Community Builder | 🏗️ | Organiser 5+ tournois | Épique |
| mega_event | Mega Event | 🌟 | Organiser un tournoi avec 16+ équipes | Rare |

### 🌐 Engagement & Fidélité
| ID | Badge | Emoji | Condition | Rareté |
|---|---|---|---|---|
| welcome | Welcome | 👋 | Créer son compte | Commun |
| og | OG | 🏴 | Compte créé avant le 1er avril 2026 | Légendaire |
| regular | Regular | 📅 | Se connecter 30 jours différents | Rare |
| addict | Addict | 🔥 | Se connecter 100 jours différents | Épique |
| profile_complete | Profile Complete | ✨ | Remplir tous les champs du profil | Commun |
| say_cheese | Say Cheese | 📸 | Ajouter une photo de profil | Commun |

### 🎉 Social & Fun
| ID | Badge | Emoji | Condition | Rareté |
|---|---|---|---|---|
| chatterbox | Chatterbox | 💬 | Envoyer 50+ messages dans les chats | Commun |
| hype_machine | Hype Machine | 📣 | Envoyer 200+ messages | Rare |
| free_agent | Free Agent | 🆓 | S'inscrire comme agent libre | Commun |
| captain | Captain | © | Être capitaine 3+ fois | Rare |
| flinta_power | FLINTA Power | 🌈 | Se déclarer FLINTA | Commun |

### 🔮 Secrets / Easter eggs
| ID | Badge | Emoji | Condition | Rareté |
|---|---|---|---|---|
| night_owl | Night Owl | 🦉 | Envoyer un message entre 2h et 5h du matin | Rare |
| early_bird | Early Bird | 🐦 | Premier message d'un chat tournoi | Commun |
| collector | Collector | 🃏 | Débloquer 15+ badges | Rare |
| completionist | Completionist | 🏅 | Débloquer 30+ badges | Légendaire |

---

## Modifications techniques à prévoir

1. **`player.displayBadges`** — nouveau champ String[] (max 5 badges choisis pour affichage)
2. **`player.loginDays`** — compteur Int pour tracker les jours de connexion (incrémenté au login)
3. **`achievements.ts`** — réécriture complète avec catalogue + fonctions de calcul par catégorie
4. **Page profil** — sélecteur de badges à afficher sur sa carte (checkboxes, max 5)
5. **PokemonCard** — affiche emoji + nom avec couleur de rareté
6. **CSS** — bordures/couleurs selon rareté

---

## Évolution visuelle de la carte (Rareté)

La PokemonCard évolue visuellement en fonction du nombre de badges débloqués :

- **Common** (0-2 badges) — Carte simple, fond uni
- **Uncommon** (3-4 badges) — Bordure colorée, léger reflet
- **Rare** (5-9 badges) — Effet holographique subtil, bordure bleue
- **Epic** (10-14 badges) — Effet holographique prononcé, bordure violette, animation au hover
- **Legendary** (15+ badges) — Full holographique, particules, bordure dorée animée, effet rainbow au hover

Inspiré des vraies cartes Pokémon :
- Common → Normal card
- Uncommon → Reverse holo
- Rare → Holo rare
- Epic → Full art / Ultra rare
- Legendary → Secret rare / Gold card / Rainbow rare
