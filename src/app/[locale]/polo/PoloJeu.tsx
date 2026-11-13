"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";

/**
 * Monte le jeu dans la page. Le code du jeu (et three.js) n'est chargé qu'ici,
 * à la demande, côté navigateur : le reste du site ne grossit pas.
 *
 * Le jeu occupe toute la page : il recouvre le header et le footer du site.
 * Le bouton « Quitter » du menu du jeu ramène à l'accueil.
 */
export function PoloJeu() {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    // Pas de défilement de la page derrière le jeu
    const avant = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = avant; };
  }, []);

  useEffect(() => {
    let demonter: (() => void) | null = null;
    let annule = false;
    import("../../../polo-game")
      .then(({ monterJeu }) => {
        if (annule || !ref.current) return;
        demonter = monterJeu(ref.current, { quitter: () => router.push("/") });
      })
      .catch((e) => setErreur(e instanceof Error ? e.message : String(e)));
    return () => {
      annule = true;
      demonter?.();
    };
  }, [router]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "#2b3138" }}>
      <div ref={ref} style={{ width: "100%", height: "100dvh", overflow: "hidden", userSelect: "none" }} />
      {erreur && (
        <p role="alert" style={{ position: "absolute", left: 16, right: 16, top: 16, color: "#fcfbf5" }}>
          Le jeu n&apos;a pas pu se charger : {erreur}
        </p>
      )}
    </div>
  );
}
