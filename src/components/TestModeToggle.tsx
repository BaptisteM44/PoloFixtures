"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export function TestModeToggle({ tournamentId, initialTestMode }: { tournamentId: string; initialTestMode: boolean }) {
  const router = useRouter();
  const t = useTranslations("tournament");
  const [testMode, setTestMode] = useState(initialTestMode);
  const [pending, setPending] = useState(false);

  const handleToggle = async () => {
    setPending(true);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/test-mode`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testMode: !testMode }),
      });
      if (res.ok) {
        const data = await res.json();
        setTestMode(data.testMode);
        router.refresh();
      }
    } catch (error) {
      console.error("Error toggling test mode:", error);
    }
    setPending(false);
  };

  return (
    <div className="panel" style={{ display: "flex", alignItems: "center", gap: 12, padding: 16 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", flex: 1, margin: 0 }}>
        <input
          type="checkbox"
          checked={testMode}
          onChange={handleToggle}
          disabled={pending}
          style={{ width: 18, height: 18, cursor: pending ? "not-allowed" : "pointer" }}
        />
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>🧪 {t("field_test_mode")}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("field_test_mode_desc")}</div>
        </div>
      </label>
      {pending && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>…</span>}
    </div>
  );
}
