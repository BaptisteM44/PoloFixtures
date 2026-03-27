"use client";

import { useRouter } from "next/navigation";
import { useTransition, useState } from "react";
import { useTranslations } from "next-intl";
import {
  generateCrossPoolAction,
  generateCrossPoolSEAction,
  generateCrossPoolDEAction,
} from "@/app/[locale]/tournament/[id]/edit/actions";

interface Props {
  tournamentId: string;
  hasCrossPool: boolean;
  /** Current state of the tournament phases */
  poolMatchesFinished: boolean;
  crossPoolGenerated: boolean;
  crossPoolFinished: boolean;
  seGenerated: boolean;
  seRound1Finished: boolean;
  deGenerated: boolean;
}

export function CrossPoolActions({
  tournamentId,
  hasCrossPool,
  poolMatchesFinished,
  crossPoolGenerated,
  crossPoolFinished,
  seGenerated,
  seRound1Finished,
  deGenerated,
}: Props) {
  const t = useTranslations("tournament");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  if (!hasCrossPool) return null;

  const handleCrossPool = () => {
    if (crossPoolGenerated && !window.confirm(t("cross_pool_regenerate_confirm"))) return;
    startTransition(async () => {
      setMessage(null);
      const res = await generateCrossPoolAction(tournamentId);
      if (res && "error" in res) setMessage(`Erreur : ${res.error}`);
      else {
        setMessage(t("cross_pool_generated"));
        router.refresh();
      }
    });
  };

  const handleSE = () => {
    if (seGenerated && !window.confirm(t("se_regenerate_confirm"))) return;
    startTransition(async () => {
      setMessage(null);
      const res = await generateCrossPoolSEAction(tournamentId);
      if (res && "error" in res) setMessage(`Erreur : ${res.error}`);
      else {
        setMessage(t("se_bracket_generated"));
        router.refresh();
      }
    });
  };

  const handleDE = () => {
    if (deGenerated && !window.confirm(t("de_regenerate_confirm"))) return;
    startTransition(async () => {
      setMessage(null);
      const res = await generateCrossPoolDEAction(tournamentId);
      if (res && "error" in res) setMessage(`Erreur : ${res.error}`);
      else {
        setMessage(t("de_bracket_generated"));
        router.refresh();
      }
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 0" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-muted)" }}>
        {t("cross_pool_format_title")}
      </div>

      {/* Step 1: Cross-pool */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: crossPoolFinished ? "var(--teal)" : "var(--text)" }}>
          1. {t("step_cross_pool")}
        </span>
        <button
          className={crossPoolGenerated ? "ghost" : "primary"}
          style={{ fontSize: 12, padding: "4px 12px" }}
          onClick={handleCrossPool}
          disabled={pending || !poolMatchesFinished}
          title={!poolMatchesFinished ? t("cross_pool_wait_pools") : ""}
        >
          {pending ? "..." : crossPoolGenerated ? t("cross_pool_regenerate") : t("cross_pool_generate")}
        </button>
        {crossPoolFinished && <span style={{ color: "var(--teal)", fontSize: 11 }}>OK</span>}
      </div>

      {/* Step 2: SE bracket */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: seRound1Finished ? "var(--teal)" : "var(--text)" }}>
          2. {t("step_se_bracket")}
        </span>
        <button
          className={seGenerated ? "ghost" : "primary"}
          style={{ fontSize: 12, padding: "4px 12px" }}
          onClick={handleSE}
          disabled={pending || !crossPoolFinished}
          title={!crossPoolFinished ? t("se_wait_cross_pool") : ""}
        >
          {pending ? "..." : seGenerated ? t("se_regenerate") : t("se_generate")}
        </button>
        {seRound1Finished && <span style={{ color: "var(--teal)", fontSize: 11 }}>OK</span>}
      </div>

      {/* Step 3: DE bracket */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: deGenerated ? "var(--teal)" : "var(--text)" }}>
          3. {t("step_de_bracket")}
        </span>
        <button
          className={deGenerated ? "ghost" : "primary"}
          style={{ fontSize: 12, padding: "4px 12px" }}
          onClick={handleDE}
          disabled={pending || !seRound1Finished}
          title={!seRound1Finished ? t("de_wait_se") : ""}
        >
          {pending ? "..." : deGenerated ? t("de_regenerate") : t("de_generate")}
        </button>
      </div>

      {message && (
        <div style={{ fontSize: 12, color: message.startsWith("Erreur") ? "var(--danger)" : "var(--teal)" }}>
          {message}
        </div>
      )}
    </div>
  );
}
