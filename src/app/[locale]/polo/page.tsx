import type { Metadata } from "next";
import { PoloJeu } from "./PoloJeu";

/**
 * Jeu de bike polo — jalon M0 : terrain d'entraînement (voir docs/polo-game/).
 * Page de travail : non indexée, non liée depuis le site.
 */
export const metadata: Metadata = {
  title: "Polo — terrain d'entraînement",
  robots: { index: false, follow: false },
};

export default function PoloPage() {
  return <PoloJeu />;
}
