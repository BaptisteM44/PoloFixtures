/**
 * Badge catalog — visual display info for each badge.
 * Used by PokemonCard and badge display components.
 *
 * NOTE: This is the "display" catalog only (emoji, name, rarity).
 * The actual badge-earning logic will come later (see docs/badge-system-roadmap.md).
 */

export type BadgeRarity = "common" | "rare" | "epic" | "mythic" | "legendary";

export interface BadgeInfo {
  id: string;
  name: string;
  emoji: string;
  description: string;
  category: "performance" | "team" | "organization" | "engagement" | "social" | "secret";
  rarity: BadgeRarity;
}

export const BADGE_CATALOG: Record<string, BadgeInfo> = {
  // ─────────────────────────────────────────────────────
  // ⚡ Performance
  // ─────────────────────────────────────────────────────
  first_blood:   { id: "first_blood",   name: "First Blood",    emoji: "🩸", description: "Marquer son 1er but",                               category: "performance", rarity: "common" },
  hat_trick:     { id: "hat_trick",     name: "Hat Trick",      emoji: "🎩", description: "3+ buts dans un tournoi",                           category: "performance", rarity: "common" },
  clean_ride:    { id: "clean_ride",    name: "Clean Ride",     emoji: "🧤", description: "0 pénalités dans un tournoi (au moins 1 but)",       category: "performance", rarity: "common" },
  hard_edge:     { id: "hard_edge",     name: "Hard Edge",      emoji: "💥", description: "3+ pénalités dans un tournoi",                      category: "performance", rarity: "common" },
  tidal_wave:    { id: "tidal_wave",    name: "Tidal Wave",     emoji: "🌊", description: "Gagner un match par 5+ buts d'écart",               category: "performance", rarity: "rare" },
  dicey:         { id: "dicey",         name: "Golden Touch",   emoji: "⭐", description: "Gagner un match en golden goal",                    category: "performance", rarity: "rare" },
  golden_double: { id: "golden_double", name: "Golden Double",  emoji: "🌟", description: "Gagner 3+ matchs en golden goal en carrière",         category: "performance", rarity: "epic" },
  unbeaten:      { id: "unbeaten",      name: "Unbeaten",       emoji: "🛡️", description: "Aucune défaite dans un tournoi",                   category: "performance", rarity: "rare" },
  sniper:        { id: "sniper",        name: "Sniper",         emoji: "🎯", description: "15+ buts en carrière",                              category: "performance", rarity: "rare" },
  eruption:      { id: "eruption",      name: "Eruption",       emoji: "🌋", description: "5 buts dans un seul match",                         category: "performance", rarity: "epic" },
  on_fire:       { id: "on_fire",       name: "On Fire",        emoji: "🔥", description: "Gagner 5 matches consécutifs dans un tournoi",       category: "performance", rarity: "epic" },
  dragon_slayer: { id: "dragon_slayer", name: "Dragon Slayer",  emoji: "🐉", description: "Battre le tenant du titre",                         category: "performance", rarity: "epic" },
  goal_machine:  { id: "goal_machine",  name: "Goal Machine",   emoji: "💣", description: "75+ buts en carrière",                              category: "performance", rarity: "epic" },
  champion:      { id: "champion",      name: "Champion",       emoji: "🏆", description: "Gagner un tournoi",                                 category: "performance", rarity: "epic" },
  comeback_kid:  { id: "comeback_kid",  name: "Comeback Kid",   emoji: "🔄", description: "Gagner un match après avoir été mené de 3+ buts",   category: "performance", rarity: "mythic" },
  back_to_back:  { id: "back_to_back",  name: "Back to Back",   emoji: "👑", description: "Gagner 2 tournois d'affilée",                       category: "performance", rarity: "mythic" },
  century_club:  { id: "century_club",  name: "Century Club",   emoji: "💯", description: "150+ buts en carrière",                             category: "performance", rarity: "legendary" },

  // ─────────────────────────────────────────────────────
  // 🤝 Équipe
  // ─────────────────────────────────────────────────────
  team_player:   { id: "team_player",   name: "Team Player",    emoji: "🤝", description: "Participer à son 1er tournoi",                      category: "team", rarity: "common" },
  squad_up:      { id: "squad_up",      name: "Squad Up",       emoji: "🫂", description: "5+ tournois joués",                                 category: "team", rarity: "common" },
  loyal_rider:   { id: "loyal_rider",   name: "Loyal Rider",    emoji: "💛", description: "Jouer 3+ fois avec le même coéquipier",             category: "team", rarity: "rare" },
  veteran:       { id: "veteran",       name: "Veteran",        emoji: "⚔️", description: "15+ tournois joués",                               category: "team", rarity: "rare" },
  road_warrior:  { id: "road_warrior",  name: "Road Warrior",   emoji: "🗺️", description: "Jouer dans 3+ pays différents",                    category: "team", rarity: "rare" },
  grassroots:    { id: "grassroots",    name: "Grassroots",     emoji: "🌿", description: "Participer à un tournoi de moins de 6 équipes",     category: "team", rarity: "common" },
  globe_trotter:   { id: "globe_trotter",   name: "Globe Trotter",   emoji: "🌍", description: "Jouer sur 3+ continents",                            category: "team", rarity: "mythic" },
  five_continents: { id: "five_continents", name: "Five Continents", emoji: "🌐", description: "Jouer sur les 5 continents",                          category: "team", rarity: "legendary" },
  wild_card:       { id: "wild_card",       name: "Wild Card",       emoji: "🃏", description: "Rejoindre comme agent libre et finir top 3",           category: "team", rarity: "epic" },
  circus_act:      { id: "circus_act",      name: "Circus Act",      emoji: "🎪", description: "Participer à 3+ tournois dans le même mois",          category: "team", rarity: "mythic" },
  united_nations:  { id: "united_nations",  name: "United Nations",  emoji: "🇺🇳", description: "Jouer dans une équipe avec 3 nationalités différentes", category: "team", rarity: "epic" },

  // ─────────────────────────────────────────────────────
  // 🏗️ Organisation
  // ─────────────────────────────────────────────────────
  host:              { id: "host",              name: "Host",              emoji: "📋", description: "Organiser son 1er tournoi",                     category: "organization", rarity: "common" },
  patient_zero:      { id: "patient_zero",      name: "Patient Zero",      emoji: "🦠", description: "Être le premier inscrit à un tournoi",          category: "organization", rarity: "rare" },
  mega_event:        { id: "mega_event",        name: "Mega Event",        emoji: "🌟", description: "Organiser un tournoi de 16+ équipes",           category: "organization", rarity: "rare" },
  serial_organizer:  { id: "serial_organizer",  name: "Serial Organizer",  emoji: "🎪", description: "Organiser 5+ tournois",                        category: "organization", rarity: "rare" },
  community_builder: { id: "community_builder", name: "Community Builder", emoji: "🏗️", description: "Organiser 10+ tournois",                       category: "organization", rarity: "epic" },

  // ─────────────────────────────────────────────────────
  // 🌐 Engagement
  // ─────────────────────────────────────────────────────
  welcome:          { id: "welcome",          name: "Welcome",          emoji: "👋", description: "Créer son compte",                                  category: "engagement", rarity: "common" },
  say_cheese:       { id: "say_cheese",       name: "Say Cheese",       emoji: "📸", description: "Ajouter une photo de profil",                       category: "engagement", rarity: "common" },
  profile_complete: { id: "profile_complete", name: "Profile Complete", emoji: "✨", description: "Remplir tous les champs du profil",                 category: "engagement", rarity: "common" },
  bookmarked:       { id: "bookmarked",       name: "Bookmarked",       emoji: "🔖", description: "Épingler ses 5 badges sur la carte",                category: "engagement", rarity: "common" },
  broadcaster:      { id: "broadcaster",      name: "Broadcaster",      emoji: "📡", description: "Partager un lien de tournoi",                       category: "engagement", rarity: "common" },
  card_designer:    { id: "card_designer",    name: "Card Designer",    emoji: "🎨", description: "Choisir un thème de carte non-standard",            category: "engagement", rarity: "common" },
  regular:          { id: "regular",          name: "Regular",          emoji: "📅", description: "Se connecter 30 jours différents",                  category: "engagement", rarity: "rare" },
  addict:           { id: "addict",           name: "Addict",           emoji: "🔋", description: "Se connecter 100 jours différents",                 category: "engagement", rarity: "epic" },
  og:               { id: "og",               name: "OG",               emoji: "🏴", description: "Compte créé avant le 1er avril 2026",               category: "engagement", rarity: "legendary" },

  // ─────────────────────────────────────────────────────
  // 🎉 Social
  // ─────────────────────────────────────────────────────
  free_agent:   { id: "free_agent",   name: "Free Agent",   emoji: "🆓", description: "S'inscrire comme agent libre",               category: "social", rarity: "common" },
  chatterbox:   { id: "chatterbox",   name: "Chatterbox",   emoji: "💬", description: "Envoyer 50+ messages",                       category: "social", rarity: "common" },
  captain:      { id: "captain",      name: "Captain",      emoji: "©️", description: "Être capitaine 3+ fois",                    category: "social", rarity: "rare" },
  hype_machine: { id: "hype_machine", name: "Hype Machine", emoji: "📣", description: "Envoyer 300+ messages",                     category: "social", rarity: "rare" },

  // ─────────────────────────────────────────────────────
  // 🔮 Secret / Easter egg
  // ─────────────────────────────────────────────────────
  early_bird:    { id: "early_bird",    name: "Early Bird",    emoji: "🐦", description: "Premier message d'un chat tournoi",                     category: "secret", rarity: "common" },
  pit_stop:      { id: "pit_stop",      name: "Pit Stop",      emoji: "🍕", description: "Mentionner la nourriture dans un chat pendant un match", category: "secret", rarity: "common" },
  time_traveler: { id: "time_traveler", name: "Time Traveler", emoji: "📖", description: "Renseigner une année de début avant 2015",              category: "secret", rarity: "rare" },
  night_owl:     { id: "night_owl",     name: "Night Owl",     emoji: "🦉", description: "Envoyer un message entre 2h et 5h",                     category: "secret", rarity: "rare" },
  night_ride:    { id: "night_ride",    name: "Night Ride",    emoji: "🌙", description: "Jouer un match commençant après 22h",                    category: "secret", rarity: "rare" },
  rob_in_hood:   { id: "rob_in_hood",   name: "Robin Hood",    emoji: "🏹", description: "Battre une équipe classée 5+ rangs au-dessus",           category: "secret", rarity: "epic" },
  rubber_ducky:  { id: "rubber_ducky",  name: "Rubber Ducky",  emoji: "🦆", description: "Gagner un match à 2 contre 3",                          category: "secret", rarity: "epic" },
  collector:     { id: "collector",     name: "Collector",     emoji: "🃏", description: "Débloquer 20+ badges",                                  category: "secret", rarity: "epic" },
  completionist: { id: "completionist", name: "Completionist", emoji: "🏅", description: "Débloquer 40+ badges",                                  category: "secret", rarity: "mythic" },
  phantom:       { id: "phantom",       name: "Phantom",       emoji: "👻", description: "Jouer un tournoi sans apparaître dans le top 5…puis en gagner un", category: "secret", rarity: "legendary" },
  askip:         { id: "askip",         name: "Askip",         emoji: "🐬", description: "Perdre tous ses matchs d'un tournoi — et revenir quand même",         category: "secret", rarity: "rare" },
  birthday_ride: { id: "birthday_ride", name: "Birthday Ride", emoji: "🎂", description: "Participer à un tournoi le jour de son anniversaire",                 category: "secret", rarity: "rare" },
};

/** Lookup a badge by ID or try by legacy name match. Returns fallback for unknown badges. */
export function getBadgeInfo(badgeIdOrName: string): BadgeInfo {
  // Direct ID match
  if (BADGE_CATALOG[badgeIdOrName]) return BADGE_CATALOG[badgeIdOrName];

  // Legacy name match (e.g. "Hat Trick" → hat_trick)
  const byName = Object.values(BADGE_CATALOG).find(
    (b) => b.name.toLowerCase() === badgeIdOrName.toLowerCase()
  );
  if (byName) return byName;

  // Fallback for unknown badges
  return {
    id: badgeIdOrName,
    name: badgeIdOrName,
    emoji: "⚡",
    description: "",
    category: "performance",
    rarity: "common",
  };
}

/** Card visual rarity — based on badge quality AND quantity.
 *
 * A badge counts toward all tiers at or below its own rarity level.
 * (legendary counts as mythic, epic, rare, common too)
 *
 * Tier thresholds:
 *   ★     (uncommon)  =  1+ badge total
 *   ★★    (rare)      =  5+ badges total  AND  5+ rare-or-above
 *   ★★★   (epic)      = 12+ badges total  AND  5+ epic-or-above
 *   ★★★★  (mythic)    = 20+ badges total  AND  5+ mythic-or-above
 *   ★★★★★ (legendary) = 30+ badges total  AND  3+ legendary
 */
export type CardRarity = "common" | "uncommon" | "rare" | "epic" | "mythic" | "legendary";

const RARITY_RANK: Record<BadgeRarity, number> = {
  common: 1, rare: 2, epic: 3, mythic: 4, legendary: 5,
};

export function getCardRarity(badgeIds: string[]): CardRarity {
  const total = badgeIds.length;
  if (total === 0) return "common";

  const counts = { rare: 0, epic: 0, mythic: 0, legendary: 0 };
  for (const id of badgeIds) {
    const info = BADGE_CATALOG[id];
    if (!info) continue;
    const rank = RARITY_RANK[info.rarity] ?? 1;
    if (rank >= 2) counts.rare++;
    if (rank >= 3) counts.epic++;
    if (rank >= 4) counts.mythic++;
    if (rank >= 5) counts.legendary++;
  }

  if (total >= 30 && counts.legendary >= 3) return "legendary";
  if (total >= 20 && counts.mythic    >= 5) return "mythic";
  if (total >= 12 && counts.epic      >= 5) return "epic";
  if (total >= 5  && counts.rare      >= 5) return "rare";
  return "uncommon";
}
