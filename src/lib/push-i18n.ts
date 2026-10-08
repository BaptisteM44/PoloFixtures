/**
 * Notifications push dans la langue de chaque appareil : on reprend le texte
 * de la cloche (lib/notif-label), traduit avec les messages de cette langue.
 */
import { createTranslator } from "next-intl";
import { notifLabel } from "@/lib/notif-label";

export const PUSH_LOCALES = ["fr", "en", "de", "es", "pt"] as const;
export type PushLocale = (typeof PUSH_LOCALES)[number];

type Dict = { [key: string]: string | Dict };
const deepMerge = (base: Dict, over: Dict): Dict => {
  const out: Dict = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const b = out[k];
    out[k] = typeof v === "object" && typeof b === "object" ? deepMerge(b, v) : v;
  }
  return out;
};

const cache = new Map<PushLocale, Dict>();
async function messagesFor(locale: PushLocale): Promise<Dict> {
  const hit = cache.get(locale);
  if (hit) return hit;
  const own = (await import(`../../messages/${locale}.json`)).default as Dict;
  // Portugais : un texte pas encore traduit retombe sur l'anglais (comme le site).
  const messages = locale === "pt" ? deepMerge((await import("../../messages/en.json")).default as Dict, own) : own;
  cache.set(locale, messages);
  return messages;
}

const asLocale = (l: string | null | undefined): PushLocale | null =>
  PUSH_LOCALES.includes(l as PushLocale) ? (l as PushLocale) : null;

const BY_COUNTRY: Record<string, PushLocale> = {
  France: "fr", Belgium: "fr", Luxembourg: "fr", Monaco: "fr", Switzerland: "fr", Senegal: "fr", Morocco: "fr", Tunisia: "fr", Algeria: "fr",
  Germany: "de", Austria: "de", Liechtenstein: "de",
  Spain: "es", Mexico: "es", Argentina: "es", Chile: "es", Colombia: "es", Peru: "es", Uruguay: "es", Venezuela: "es",
  Ecuador: "es", Bolivia: "es", Paraguay: "es", "Costa Rica": "es", Guatemala: "es", Cuba: "es", "Dominican Republic": "es",
  Portugal: "pt", Brazil: "pt", Angola: "pt", Mozambique: "pt",
};
/**
 * Langue d'un appareil : celle enregistrée à l'abonnement ; sinon (anciens
 * abonnements) devinée d'après le pays du joueur ; anglais par défaut.
 */
export function pushLocale(subLocale: string | null | undefined, country: string | null | undefined): PushLocale {
  return asLocale(subLocale) ?? (country ? BY_COUNTRY[country] : undefined) ?? "en";
}

/** Titre/texte/lien d'une notification push, dans la langue donnée. */
export async function localizedPush(
  locale: PushLocale,
  type: string,
  payload: Record<string, string | number>,
  tag: string,
): Promise<{ title: string; body: string; url: string; tag: string }> {
  const t = createTranslator({ locale, messages: await messagesFor(locale), namespace: "notifications" });
  const p = Object.fromEntries(Object.entries(payload).map(([k, v]) => [k, String(v)]));
  const { title, sub, href } = notifLabel(t as never, { type, payload: p });
  return { title, body: sub || "Poloperator", url: `/${locale}${href}`, tag };
}
