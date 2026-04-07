"use client";

import { useRouter } from "next/navigation";
import { useTransition, useState } from "react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("tournament");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const label = isRR ? "Round Robin" : "bracket";

  const handleGenerate = () => {
    startTransition(async () => {
      setMessage(null);
      const res = await generateBracketAction(tournamentId);
      if (res && "error" in res) {
        setMessage(`Erreur : ${res.error}`);
      } else {
        setMessage(isRR ? t("bracket_rr_generated") : t("bracket_generated"));
        router.refresh();
      }
    });
  };

  const handleRegenerate = () => {
    setConfirmOpen(true);
  };

  const confirmRegenerate = () => {
    setConfirmOpen(false);
    startTransition(async () => {
      setMessage(null);
      const res = await generateBracketAction(tournamentId);
      if (res && "error" in res) {
        setMessage(`Erreur : ${res.error}`);
      } else {
        setMessage(isRR ? t("bracket_rr_regenerated") : t("bracket_regenerated"));
        router.refresh();
      }
    });
  };

  const handleSeeding = () => {
    startTransition(async () => {
      setMessage(null);
      await applySeedingAction(tournamentId);
      setMessage(t("seeding_applied"));
      router.refresh();
    });
  };

  if (mode === "launch") {
    return (
      <div>
        <button
          className="primary"
          style={{ fontSize: 16, padding: "12px 32px" }}
          onClick={handleGenerate}
          disabled={pending}
        >
          {pending ? t("generating") : isRR ? `🔄 ${t("bracket_launch_rr")}` : `🏆 ${t("bracket_launch")}`}
        </button>
        {message && <p style={{ marginTop: 12, color: message.startsWith("Erreur") ? "var(--danger)" : "var(--teal)", fontSize: 13 }}>{message}</p>}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "var(--teal)", fontWeight: 700 }}>
          ✓ {isRR ? t("bracket_rr_exists") : t("bracket_exists")}
        </span>
        <button
          className="ghost"
          style={{ fontSize: 11, padding: "4px 12px", color: "var(--danger)" }}
          onClick={handleRegenerate}
          disabled={pending}
        >
          {pending ? "..." : `⚠ ${t("bracket_regenerate")}`}
        </button>
        {hasQualifyingMatches && (
          <button
            className="ghost"
            style={{ fontSize: 11, padding: "4px 12px" }}
            onClick={handleSeeding}
            disabled={pending}
          >
            {pending ? "..." : t("bracket_apply_seeding")}
          </button>
        )}
      </div>

      {hasQualifyingMatches && (
        <span className="meta" style={{ fontSize: 11 }}>
          {t("bracket_seeding_hint")}
        </span>
      )}

      {/* Confirmation modale inline */}
      {confirmOpen && (
        <div className="panel" style={{ padding: "12px 16px", border: "2px solid var(--danger)", display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>
            {t("bracket_confirm_regenerate", { label })}
          </p>
          <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>
            {t("bracket_confirm_warning")}
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="primary"
              style={{ fontSize: 12, padding: "6px 16px", background: "var(--danger)", borderColor: "var(--danger)" }}
              onClick={confirmRegenerate}
              disabled={pending}
            >
              {pending ? "..." : t("confirm_yes")}
            </button>
            <button
              className="ghost"
              style={{ fontSize: 12, padding: "6px 16px" }}
              onClick={() => setConfirmOpen(false)}
            >
              {t("confirm_cancel")}
            </button>
          </div>
        </div>
      )}

      {message && (
        <span style={{ fontSize: 12, color: message.startsWith("Erreur") ? "var(--danger)" : "var(--teal)" }}>
          {message}
        </span>
      )}
    </div>
  );
}
