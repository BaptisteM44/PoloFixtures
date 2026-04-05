"use client";

import { useRef, useState, useEffect } from "react";
import { useLocale } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { routing } from "@/i18n/routing";

const LABELS: Record<string, string> = {
  fr: "FR",
  en: "EN",
  de: "DE",
  es: "ES",
};

/** inline=true → affiche les 4 boutons directement sans dropdown (pour le drawer mobile) */
export function LanguageSwitcher({ inline = false }: { inline?: boolean }) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) closePanel();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const closePanel = () => {
    if (!open) return;
    setClosing(true);
    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 150);
  };

  const handleToggle = () => {
    if (open) { closePanel(); return; }
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    setClosing(false);
    setOpen(true);
  };

  const switchLocale = (next: string) => {
    const query = searchParams.toString();
    const target = query ? `${pathname}?${query}` : pathname;
    router.replace(target as Parameters<typeof router.replace>[0], { locale: next as "fr" | "en" | "de" | "es" });
    closePanel();
  };

  // Version inline pour le drawer mobile
  if (inline) {
    return (
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        {routing.locales.map((loc: string) => (
          <button
            key={loc}
            onClick={() => switchLocale(loc)}
            disabled={loc === locale}
            style={{
              fontSize: 12, fontWeight: loc === locale ? 700 : 400,
              padding: "3px 7px", borderRadius: 4,
              border: loc === locale ? "1px solid var(--accent)" : "1px solid transparent",
              background: "transparent",
              cursor: loc === locale ? "default" : "pointer",
              color: loc === locale ? "var(--accent)" : "var(--text-muted)",
            }}
          >
            {LABELS[loc]}
          </button>
        ))}
      </div>
    );
  }

  // Version dropdown pour le header desktop
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={handleToggle}
        className="header-icon-btn"
        aria-label="Switch language"
      >
        {LABELS[locale]}
      </button>

      {open && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 8px)", right: 0,
            width: 120, maxWidth: "calc(100vw - 16px)", background: "var(--surface)", border: "2px solid var(--border)",
            borderRadius: "var(--radius)", boxShadow: "var(--shadow-lg)",
            zIndex: 1000, overflow: "hidden",
            animation: closing
              ? "notif-slide-up 0.15s ease-in forwards"
              : "notif-slide-down 0.18s cubic-bezier(0.22, 1, 0.36, 1) forwards",
            transformOrigin: "top right",
          }}
        >
          {routing.locales.map((loc: string) => (
            <button
              key={loc}
              onClick={() => switchLocale(loc)}
              disabled={loc === locale}
              style={{
                display: "flex", alignItems: "center", width: "100%",
                padding: "10px 14px", border: "none", borderBottom: "1px solid var(--border-light)",
                background: loc === locale ? "color-mix(in srgb, var(--accent) 12%, var(--surface))" : "transparent",
                cursor: loc === locale ? "default" : "pointer",
                fontSize: 13, fontWeight: loc === locale ? 700 : 400,
                color: loc === locale ? "var(--accent)" : "var(--text)",
                fontFamily: "var(--font-display)",
                textAlign: "left",
              }}
            >
              {LABELS[loc]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
