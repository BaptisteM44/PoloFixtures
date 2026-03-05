"use client";

import { useLocale } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

const LABELS: Record<string, string> = {
  fr: "🇫🇷 FR",
  en: "🇬🇧 EN",
  de: "🇩🇪 DE",
  es: "🇪🇸 ES",
};

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  function switchLocale(next: string) {
    router.replace(pathname, { locale: next as "fr" | "en" | "de" | "es" });
  }

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      {routing.locales.map((loc: string) => (
        <button
          key={loc}
          onClick={() => switchLocale(loc)}
          style={{
            fontSize: 11,
            fontWeight: loc === locale ? 700 : 400,
            padding: "2px 6px",
            borderRadius: 4,
            border: loc === locale ? "1px solid var(--accent)" : "1px solid transparent",
            background: "transparent",
            cursor: loc === locale ? "default" : "pointer",
            color: loc === locale ? "var(--accent)" : "var(--text-muted)",
            transition: "all 0.15s",
          }}
          disabled={loc === locale}
          aria-label={`Switch to ${loc}`}
        >
          {LABELS[loc]}
        </button>
      ))}
    </div>
  );
}
