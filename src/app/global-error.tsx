"use client";

import { useEffect } from "react";

/**
 * Dernier filet de sécurité : ne se déclenche que si le ROOT layout lui-même
 * plante (les error.tsx de segment gèrent le reste). Il remplace tout le
 * document, donc il doit fournir ses propres <html>/<body> et ne peut PAS
 * dépendre du provider i18n (potentiellement cassé) → texte statique fr/en.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global error]", error?.digest ?? "", error);
  }, [error]);

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
          gap: 16,
          padding: 24,
          fontFamily: "system-ui, sans-serif",
          background: "#faf9f5",
          color: "#1a1a1a",
        }}
      >
        <div style={{ fontSize: 56 }} aria-hidden>🛠️</div>
        <h1 style={{ margin: 0, fontSize: 26 }}>Une erreur est survenue</h1>
        <p style={{ margin: 0, maxWidth: 420, color: "#555", lineHeight: 1.6 }}>
          Quelque chose s'est mal passé. Réessayez ou rechargez la page.
          <br />
          <span style={{ color: "#888" }}>Something went wrong. Please try again.</span>
        </p>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            marginTop: 8,
            padding: "12px 20px",
            fontSize: 15,
            fontWeight: 700,
            border: "2px solid #1a1a1a",
            borderRadius: 10,
            background: "#60c9cf",
            color: "#1a1a1a",
            cursor: "pointer",
          }}
        >
          Réessayer / Try again
        </button>
      </body>
    </html>
  );
}
