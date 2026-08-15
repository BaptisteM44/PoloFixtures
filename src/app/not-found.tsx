import Link from "next/link";
import { headers } from "next/headers";

/**
 * 404 RACINE : se déclenche pour toute URL qui ne matche aucune route sous
 * /[locale] (ex: /en/ok). À ce niveau le layout racine ne fournit pas de
 * <html>/<body> (ils vivent dans [locale]/layout) et le provider i18n n'est pas
 * monté. On fournit html/body soi-même et on résout la langue au mieux depuis
 * le referer (navigation interne) ; à défaut on retombe sur "en".
 */

const COPY = {
  fr: { title: "Page introuvable", desc: "Cette page n'existe pas ou a été déplacée.", home: "Retour à l'accueil" },
  en: { title: "Page not found", desc: "This page doesn't exist or has moved.", home: "Back to home" },
  de: { title: "Seite nicht gefunden", desc: "Diese Seite existiert nicht oder wurde verschoben.", home: "Zur Startseite" },
  es: { title: "Página no encontrada", desc: "Esta página no existe o se ha movido.", home: "Volver al inicio" },
} as const;

type Locale = keyof typeof COPY;
const LOCALES = Object.keys(COPY) as Locale[];

function resolveLocale(): Locale {
  const referer = headers().get("referer") ?? "";
  const seg = referer.replace(/^https?:\/\/[^/]+/, "").split("/").filter(Boolean)[0];
  if (seg && (LOCALES as string[]).includes(seg)) return seg as Locale;
  return "en";
}

export default function RootNotFound() {
  const locale = resolveLocale();
  const t = COPY[locale];

  return (
    <html lang={locale}>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          fontFamily: "system-ui, -apple-system, sans-serif",
          background: "#fcfbf5",
          color: "#1a1a1a",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            gap: 18,
            maxWidth: 440,
            width: "100%",
            padding: "40px 28px",
            background: "#fff",
            border: "2px solid #1a1a1a",
            borderRadius: 16,
            boxShadow: "6px 6px 0px #1a1a1a",
          }}
        >
          <div
            style={{
              fontSize: 64,
              fontWeight: 800,
              lineHeight: 1,
              letterSpacing: "-0.03em",
              background: "#fffc8a",
              padding: "6px 18px",
              border: "2px solid #1a1a1a",
              borderRadius: 12,
            }}
          >
            404
          </div>
          <h1 style={{ margin: 0, fontSize: 23 }}>{t.title}</h1>
          <p style={{ margin: 0, color: "#666660", lineHeight: 1.6, fontSize: 15 }}>{t.desc}</p>
          <Link
            href={`/${locale}`}
            style={{
              marginTop: 6,
              padding: "12px 22px",
              fontSize: 15,
              fontWeight: 700,
              border: "2px solid #1a1a1a",
              borderRadius: 10,
              background: "#60c9cf",
              color: "#1a1a1a",
              textDecoration: "none",
              boxShadow: "3px 3px 0px #1a1a1a",
            }}
          >
            {t.home}
          </Link>
        </div>
      </body>
    </html>
  );
}
