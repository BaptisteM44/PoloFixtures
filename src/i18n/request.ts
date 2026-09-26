import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  // Fallback to defaultLocale if locale is not valid
  if (!locale || !routing.locales.includes(locale as (typeof routing.locales)[number])) {
    locale = routing.defaultLocale;
  }

  const messages = (await import(`../../messages/${locale}.json`)).default;
  // Portugais = langue la plus récente : un texte pas encore traduit s'affiche
  // en anglais plutôt que de casser la page.
  if (locale === "pt") {
    const en = (await import("../../messages/en.json")).default;
    return { locale, messages: deepMerge(en, messages) };
  }
  return { locale, messages };
});

type Dict = { [key: string]: string | Dict };

function deepMerge(base: Dict, over: Dict): Dict {
  const out: Dict = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const b = out[k];
    out[k] = typeof v === "object" && typeof b === "object" ? deepMerge(b, v) : v;
  }
  return out;
}
