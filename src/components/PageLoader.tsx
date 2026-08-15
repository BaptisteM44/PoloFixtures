/**
 * Loader plein segment, utilisé par les loading.tsx (fallback Suspense pendant
 * le chargement des données serveur d'une page). Spinner CSS pur, sans JS.
 */
export function PageLoader() {
  return (
    <div
      style={{
        minHeight: "50vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 40,
      }}
    >
      <span
        aria-label="Chargement"
        role="status"
        style={{
          width: 40,
          height: 40,
          border: "3px solid var(--border-light, #e5e5e5)",
          borderTopColor: "var(--teal, #60c9cf)",
          borderRadius: "50%",
          display: "inline-block",
          animation: "pageloader-spin 0.7s linear infinite",
        }}
      />
      <style>{`@keyframes pageloader-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
