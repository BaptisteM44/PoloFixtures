"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export function TestModeToggle({ tournamentId, initialTestMode, initialHidden }: { tournamentId: string; initialTestMode: boolean; initialHidden: boolean }) {
  const router = useRouter();
  const t = useTranslations("tournament_edit");
  const [testMode, setTestMode] = useState(initialTestMode);
  const [hidden, setHidden] = useState(initialHidden);
  const [pending, setPending] = useState(false);

  const patch = async (updates: { testMode?: boolean; hidden?: boolean }) => {
    setPending(true);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/test-mode`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const data = await res.json();
        if (typeof data.testMode === "boolean") setTestMode(data.testMode);
        if (typeof data.hidden === "boolean") setHidden(data.hidden);
        router.refresh();
      }
    } catch (error) {
      console.error("Error toggling test mode:", error);
    }
    setPending(false);
  };

  const handleTestModeToggle = () => {
    const newTestMode = !testMode;
    const newHidden = newTestMode ? true : false;
    setTestMode(newTestMode);
    setHidden(newHidden);
    patch({ testMode: newTestMode, hidden: newHidden });
  };

  const handleHiddenToggle = () => {
    const newHidden = !hidden;
    setHidden(newHidden);
    patch({ hidden: newHidden });
  };

  return (
    <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
      <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "14px 16px", background: testMode ? "color-mix(in srgb, var(--yellow) 8%, var(--surface))" : undefined, margin: 0 }}>
        <input
          type="checkbox"
          checked={testMode}
          onChange={handleTestModeToggle}
          disabled={pending}
          style={{ width: 18, height: 18, cursor: pending ? "not-allowed" : "pointer", flexShrink: 0 }}
        />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>🧪 {t("field_test_mode")}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("field_test_mode_desc")}</div>
        </div>
        {pending && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>…</span>}
      </label>
      {testMode && (
        <div style={{ borderTop: "1px solid var(--border)", padding: "10px 16px 10px 44px", background: "var(--bg-secondary)" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", margin: 0 }}>
            <input
              type="checkbox"
              checked={hidden}
              onChange={handleHiddenToggle}
              disabled={pending}
              style={{ width: 16, height: 16, cursor: pending ? "not-allowed" : "pointer", flexShrink: 0 }}
            />
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>👁 {t("field_hidden")}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("field_hidden_desc")}</div>
            </div>
          </label>
        </div>
      )}
    </div>
  );
}
