"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

export function WithdrawTeamPanel({
  tournamentId,
  teamName,
  waitlisted,
  isCaptain,
}: {
  tournamentId: string;
  teamName: string;
  waitlisted: boolean;
  isCaptain: boolean;
}) {
  const t = useTranslations("team");
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleWithdraw = async () => {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/register-team`, { method: "DELETE" });
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json();
      setError(data.error ?? t("withdraw_error"));
      setLoading(false);
      setConfirm(false);
    }
  };

  return (
    <div style={{ marginTop: 16, padding: "16px 20px", background: "color-mix(in srgb, var(--teal) 8%, var(--surface))", border: "2px solid var(--teal)", borderRadius: "var(--radius)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 22 }}>{waitlisted ? "⏳" : "✅"}</span>
        <div>
          <p style={{ margin: 0, fontWeight: 700, fontFamily: "var(--font-display)", fontSize: 15 }}>
            {waitlisted ? t("registered_waitlisted") : t("registered_confirmed")}
          </p>
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>{teamName}</p>
        </div>
      </div>

      {isCaptain && (
        confirm ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{t("withdraw_confirm")}</span>
            <button
              className="ghost"
              style={{ fontSize: 12, color: "var(--danger)", borderColor: "var(--danger)", padding: "3px 12px" }}
              onClick={handleWithdraw}
              disabled={loading}
            >
              {loading ? "…" : t("withdraw_yes")}
            </button>
            <button className="ghost" style={{ fontSize: 12, padding: "3px 12px" }} onClick={() => setConfirm(false)}>
              {t("withdraw_no")}
            </button>
          </div>
        ) : (
          <button
            className="ghost"
            style={{ fontSize: 12, color: "var(--danger)", borderColor: "var(--danger)", marginTop: 8 }}
            onClick={() => setConfirm(true)}
          >
            {t("withdraw_btn")}
          </button>
        )
      )}
      {!isCaptain && (
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "8px 0 0" }}>{t("withdraw_captain_only")}</p>
      )}
      {error && <p style={{ fontSize: 13, color: "var(--danger)", margin: "8px 0 0" }}>{error}</p>}
    </div>
  );
}
