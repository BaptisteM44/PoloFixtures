import { createHmac } from "crypto";

/**
 * Empreinte anonyme d'un votant pour un sondage donné (anti-double-vote).
 *
 * On utilise HMAC-SHA256 avec un secret serveur : sans le secret, impossible de
 * recalculer le hash à partir d'un playerId/email → l'émargement ne trahit pas
 * l'identité en clair. Le hash est déterministe (même votant → même hash), ce
 * qui permet de détecter un second vote via la contrainte unique en base.
 *
 * ⚠️ Limite honnête : ce n'est pas de l'anonymat inviolable. Quelqu'un ayant le
 * secret serveur ET la liste des participants pourrait recalculer les hash et
 * recouper. C'est "anonyme en pratique" (l'orga voit des hash, pas des noms),
 * pas "anonyme même contre un attaquant qui a tout le serveur".
 */

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) {
    // En prod ce secret existe toujours (auth). S'il manque, on refuse plutôt
    // que de hasher avec une valeur vide (qui rendrait les hash prévisibles).
    throw new Error("NEXTAUTH_SECRET manquant : impossible de sécuriser les votes.");
  }
  return s;
}

/** Hash d'un votant INSCRIT (par playerId). */
export function hashPlayerVoter(pollId: string, playerId: string): string {
  return createHmac("sha256", secret()).update(`poll:${pollId}:player:${playerId}`).digest("hex");
}

/** Hash d'un votant GUEST (par email normalisé). */
export function hashGuestVoter(pollId: string, email: string): string {
  const normalized = email.trim().toLowerCase();
  return createHmac("sha256", secret()).update(`poll:${pollId}:email:${normalized}`).digest("hex");
}
