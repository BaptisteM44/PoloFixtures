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

type ConfirmTarget = "cross_pool" | "se" | "de" | null;

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
  const tc = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget>(null);

  if (!hasCrossPool) return null;

  const run = (action: (id: string) => Promise<any>, successMsg: string) => {
    setConfirmTarget(null);
    startTransition(async () => {
      setMessage(null);
      const res = await action(tournamentId);
      if (res && "error" in res) setMessage({ text: `${tc("error")} : ${res.error}`, isError: true });
      else {
        setMessage({ text: successMsg, isError: false });
        router.refresh();
      }
    });
  };

  const stepRow = (
    step: number,
    label: string,
    isGenerated: boolean,
    isFinished: boolean,
    canGenerate: boolean,
    waitMessage: string,
    target: ConfirmTarget,
    action: (id: string) => Promise<any>,
    successMsg: string,
  ) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: isFinished ? "var(--teal)" : "var(--text)" }}>
          {step}. {label}
        </span>

        {!isGenerated ? (
          <button
            className="primary"
            style={{ fontSize: 12, padding: "4px 12px" }}
            onClick={() => run(action, successMsg)}
            disabled={pending || !canGenerate}
            title={!canGenerate ? waitMessage : ""}
          >
            {pending && confirmTarget === null ? "..." : t("btn_generate")}
          </button>
        ) : (
          <>
            {isFinished && <span style={{ color: "var(--teal)", fontSize: 11, fontWeight: 700 }}>✓ OK</span>}
            <button
              className="ghost"
              style={{ fontSize: 11, padding: "4px 10px", color: "var(--danger)" }}
              onClick={() => setConfirmTarget(target)}
              disabled={pending}
            >
              {pending ? "..." : `⚠ ${t("btn_regenerate")}`}
            </button>
          </>
        )}
      </div>

      {/* Inline confirmation */}
      {confirmTarget === target && (
        <div className="panel" style={{ padding: "10px 14px", border: "2px solid var(--danger)", display: "flex", flexDirection: "column", gap: 6 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 600 }}>
            {t("confirm_regenerate_step", { step: label })}
          </p>
          <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)" }}>
            {t("confirm_regenerate_warning")}
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="primary"
              style={{ fontSize: 11, padding: "4px 14px", background: "var(--danger)", borderColor: "var(--danger)" }}
              onClick={() => run(action, successMsg)}
              disabled={pending}
            >
              {pending ? "..." : t("confirm_yes")}
            </button>
            <button
              className="ghost"
              style={{ fontSize: 11, padding: "4px 14px" }}
              onClick={() => setConfirmTarget(null)}
            >
              {t("confirm_cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "12px 0" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-muted)" }}>
        {t("cross_pool_format_title")}
      </div>

      {stepRow(1, t("step_cross_pool"), crossPoolGenerated, crossPoolFinished, poolMatchesFinished, t("cross_pool_wait_pools"), "cross_pool", generateCrossPoolAction, t("cross_pool_generated"))}
      {stepRow(2, t("step_se_bracket"), seGenerated, seRound1Finished, crossPoolFinished, t("se_wait_cross_pool"), "se", generateCrossPoolSEAction, t("se_bracket_generated"))}
      {stepRow(3, t("step_de_bracket"), deGenerated, false, seRound1Finished, t("de_wait_se"), "de", generateCrossPoolDEAction, t("de_bracket_generated"))}

      {message && (
        <div style={{ fontSize: 12, color: message.isError ? "var(--danger)" : "var(--teal)" }}>
          {message.text}
        </div>
      )}
    </div>
  );
}
