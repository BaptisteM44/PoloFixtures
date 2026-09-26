import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["fr", "en", "de", "es", "pt"],
  defaultLocale: "fr",
  localePrefix: "always",
});
