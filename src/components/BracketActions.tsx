"use client";

import { useRouter } from "next/navigation";
import { useTransition, useState } from "react";
import { generateBracketAction, applySeedingAction } from "@/app/[locale]/tournament/[id]/edit/actions";

interface Props {
  tournamentId: string;
  returnPath: string;
  hasQualifyingMatches: boolean;
  isRR?: boolean;
  /** "buttons" = bracket already exists; "launch" = first-time launch */
  mode: "buttons" | "launch";
}

export function BracketActions({ tournamentId, returnPath, hasQualifyingMatches, isRR, mode }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const handleRegenerate = () => {
    const label = isRR ? "Round Robin" : "bracket";
    const confirmed = window.confirm(`Régénérer le ${label} ? Les matchs existants seront supprimés.`);
    if (!confirmed) return;
    startTransition(async () => {
      setMessage(null);
      const res = await generateBracketAction(tournamentId);
      if (res && "error" in res) {
        setMessage(`Erreur : ${res.error}`);
      } else {
        setMessage(`${isRR ? "Round Robin" : "Bracket"} régénéré !`);
        router.refresh();
      }
    });
  };

  const handleSeeding = () => {
    startTransition(async () => {
      setMessage(null);
      await applySeedingAction(tournamentId);
      setMessage("Seeding appliqué !");
      router.refresh();
    });
  };

  if (mode === "launch") {
    return (
      <div>
        <button
          className="primary"
          style={{ fontSize: 16, padding: "12px 32px" }}
          onClick={handleRegenerate}
          disabled={pending}
        >
          {pending ? "Génération..." : isRR ? "🔄 Lancer le Round Robin" : "🏆 Lancer le bracket"}
        </button>
        {message && <p style={{ marginTop: 12, color: message.startsWith("Erreur") ? "var(--danger)" : "var(--teal)", fontSize: 13 }}>{message}</p>}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
      <button
        className="ghost"
        style={{ fontSize: 12, padding: "5px 14px", color: "var(--danger)" }}
        onClick={handleRegenerate}
        disabled={pending}
      >
        {pending ? "..." : isRR ? "Régénérer le Round Robin" : "Régénérer le bracket"}
      </button>
      {hasQualifyingMatches && (
        <button
          className="ghost"
          style={{ fontSize: 12, padding: "5px 14px" }}
          onClick={handleSeeding}
          disabled={pending}
        >
          {pending ? "..." : "Appliquer le seeding"}
        </button>
      )}
      {hasQualifyingMatches && (
        <span className="meta" style={{ fontSize: 11 }}>
          Recalcule le seeding depuis les standings actuels
        </span>
      )}
      {message && (
        <span style={{ fontSize: 12, color: message.startsWith("Erreur") ? "var(--danger)" : "var(--teal)" }}>
          {message}
        </span>
      )}
    </div>
  );
}
