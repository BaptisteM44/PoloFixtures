/**
 * Libellé affiché d'un format d'inscription. La valeur stockée reste
 * « ABC Chapeau » (le code la compare partout) ; seul l'affichage est traduit,
 * via la clé common.format_abc_hat.
 */
export const ABC_HAT_FORMAT = "ABC Chapeau";

export function formatLabel(format: string, abcHatLabel: string): string {
  return format === ABC_HAT_FORMAT ? abcHatLabel : format;
}
