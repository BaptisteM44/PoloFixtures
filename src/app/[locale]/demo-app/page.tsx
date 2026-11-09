/**
 * DÉMO — prototype « Poloperator en mode app » à tester sur téléphone :
 * barre d'onglets, en-tête compact, carte live, feuilles du bas, tirer pour
 * rafraîchir, retour par balayage, vibration, hors ligne, diagnostic.
 * Entièrement factice (aucune donnée du site), non indexée.
 *
 * viewport-fit=cover : sans lui, l'encoche et la barre d'accueil de l'iPhone
 * ne sont pas exposées (env(safe-area-inset-*) vaut 0).
 */
import type { Viewport } from "next";
import { AppShellDemo } from "@/components/demo-app/AppShellDemo";

export const metadata = { title: "Démo app", robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#fcfbf5" };

export default function DemoAppPage() {
  return <AppShellDemo />;
}
