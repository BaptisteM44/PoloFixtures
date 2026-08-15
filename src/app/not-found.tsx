import Link from "next/link";

/**
 * 404 RACINE : se déclenche pour les URL qui ne matchent aucune route sous
 * /[locale] (ex: /en/ok). À ce niveau, le layout racine ne fournit PAS de
 * <html>/<body> (ils vivent dans [locale]/layout) — cette page doit donc les
 * fournir elle-même, sinon Next.js lève « Missing required html tags ».
 * Texte statique fr/en (pas de provider i18n disponible ici).
 */
export default function RootNotFound() {
  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          gap: 14,
          padding: 24,
          fontFamily: "system-ui, sans-serif",
          background: "#faf9f5",
          color: "#1a1a1a",
        }}
      >
        <div style={{ fontSize: 60 }} aria-hidden>🤷</div>
        <h1 style={{ margin: 0, fontSize: 26 }}>Page introuvable</h1>
        <p style={{ margin: 0, maxWidth: 420, color: "#555", lineHeight: 1.6 }}>
          Cette page n'existe pas ou a été déplacée.
          <br />
          <span style={{ color: "#888" }}>This page doesn't exist or has moved.</span>
        </p>
        <Link
          href="/"
          style={{
            marginTop: 8,
            padding: "12px 20px",
            fontSize: 15,
            fontWeight: 700,
            border: "2px solid #1a1a1a",
            borderRadius: 10,
            background: "#60c9cf",
            color: "#1a1a1a",
            textDecoration: "none",
          }}
        >
          Accueil / Home
        </Link>
      </body>
    </html>
  );
}
