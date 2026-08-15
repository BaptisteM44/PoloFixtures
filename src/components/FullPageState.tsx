import type { ReactNode } from "react";

/**
 * État plein écran réutilisable (404, erreur, vide) : gros emoji, titre,
 * message, et une ou plusieurs actions. Centré verticalement dans la page.
 * Volontairement sans dépendance i18n/client — les libellés sont passés en props
 * pour rester utilisable aussi bien côté serveur (not-found) que client (error).
 */
export function FullPageState({
  emoji,
  title,
  description,
  actions,
}: {
  emoji: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        gap: 14,
        padding: "48px 20px",
      }}
    >
      <div style={{ fontSize: 64, lineHeight: 1 }} aria-hidden>{emoji}</div>
      <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 28 }}>{title}</h1>
      {description && (
        <p style={{ margin: 0, maxWidth: 440, color: "var(--text-muted)", lineHeight: 1.6 }}>
          {description}
        </p>
      )}
      {actions && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", marginTop: 8 }}>
          {actions}
        </div>
      )}
    </div>
  );
}
