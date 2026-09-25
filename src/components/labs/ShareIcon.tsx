/**
 * Icône "partager" façon Android/Material : trois points reliés par deux
 * traits en triangle.
 */
export function ShareIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

/**
 * Partage un item Labs. Priorité à la feuille de partage native du système
 * (Web Share API — Messages, WhatsApp, Mail…, dispo surtout sur mobile) ;
 * repli sur la copie presse-papiers si l'API n'existe pas (desktop) ou si
 * l'utilisateur annule la feuille native.
 *
 * @returns "shared" (feuille native utilisée), "copied" (lien copié) ou
 *   "cancelled" (l'utilisateur a fermé la feuille native sans partager).
 */
export async function shareItemUrl(
  itemId: string,
  title: string,
  fallbackPrompt: string
): Promise<"shared" | "copied" | "cancelled"> {
  const url = `${window.location.origin}/labs?id=${itemId}`;

  if (typeof navigator !== "undefined" && "share" in navigator) {
    try {
      await navigator.share({ title, url });
      return "shared";
    } catch (err) {
      // AbortError = l'utilisateur a fermé la feuille sans choisir — pas une
      // erreur, on ne bascule pas sur la copie silencieusement derrière lui.
      if (err instanceof Error && err.name === "AbortError") return "cancelled";
      // Autre échec (permission, contexte non sécurisé…) : on retente par la copie.
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    window.prompt(fallbackPrompt, url);
    return "copied";
  }
}
