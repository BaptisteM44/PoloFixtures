"use client";

import { useRouter } from "next/navigation";
import { useTransition, useState } from "react";
import { useTranslations } from "next-intl";
import { generateBracketAction, applySeedingAction } from "@/app/[locale]/tournament/[id]/edit/actions";
import { generateSplitSwissBracketAction } from "@/app/[locale]/tournament/[id]/edit/split-swiss-actions";

interface Props {
  tournamentId: string;
  returnPath: string;
  hasQualifyingMatches: boolean;
  isRR?: boolean;
  saturdayFormat?: string;
  /** "buttons" = bracket already exists; "launch" = first-time launch */
  mode: "buttons" | "launch";
}

export function BracketActions({ tournamentId, returnPath, hasQualifyingMatches, isRR, saturdayFormat, mode }: Props) {
  const t = useTranslations("tournament");
  const tc = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // { isError } explicite plutôt que deviner via message.startsWith("Erreur") :
  // ce dernier ne fonctionnait que par coïncidence (le préfixe était toujours
  // en français) et aurait affiché une erreur en vert/teal dans les autres langues.
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const label = isRR ? "Round Robin" : "bracket";

  const doGenerate = () =>
    saturdayFormat === "SPLIT_SWISS"
      ? generateSplitSwissBracketAction(tournamentId)
      : generateBracketAction(tournamentId);

  const handleGenerate = () => {
    startTransition(async () => {
      setMessage(null);
      const res = await doGenerate();
      if (res && "error" in res) {
        setMessage({ text: `${tc("error")} : ${res.error}`, isError: true });
      } else {
        setMessage({ text: isRR ? t("bracket_rr_generated") : t("bracket_generated"), isError: false });
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
      const res = await doGenerate();
      if (res && "error" in res) {
        setMessage({ text: `${tc("error")} : ${res.error}`, isError: true });
      } else {
        setMessage({ text: isRR ? t("bracket_rr_regenerated") : t("bracket_regenerated"), isError: false });
        router.refresh();
      }
    });
  };

  const handleSeeding = () => {
    startTransition(async () => {
      setMessage(null);
      await applySeedingAction(tournamentId);
      setMessage({ text: t("seeding_applied"), isError: false });
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
        {message && <p style={{ marginTop: 12, color: message.isError ? "var(--danger)" : "var(--teal)", fontSize: 13 }}>{message.text}</p>}
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
        <span style={{ fontSize: 12, color: message.isError ? "var(--danger)" : "var(--teal)" }}>
          {message.text}
        </span>
      )}
    </div>
  );
}
