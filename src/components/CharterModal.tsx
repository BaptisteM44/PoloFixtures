"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

type Props = {
  onAccepted: () => void;
};

export function CharterModal({ onAccepted }: Props) {
  const t = useTranslations("charter");
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleAccept = async () => {
    if (!checked) return;
    setSaving(true);
    await fetch("/api/account/charter", { method: "POST" });
    setSaving(false);
    onAccepted();
  };

  return (
    <div className="charter-modal-overlay">
      <div className="charter-modal" role="dialog" aria-modal="true">
        <div className="charter-modal__header">
          <span style={{ fontSize: 28 }}>📋</span>
          <h2 className="charter-modal__title">{t("title")}</h2>
        </div>

        <ul className="charter-modal__list">
          {(["point_1", "point_2", "point_3", "point_4", "point_5"] as const).map((key) => (
            <li key={key}>
              <span className="charter-modal__check">✓</span>
              {t(key)}
            </li>
          ))}
        </ul>

        <a
          href="/legal/charter"
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 12, color: "var(--teal)", display: "block", marginBottom: 16 }}
        >
          {t("read_full_charter")} →
        </a>

        <div className="charter-modal__actions">
          <label className="charter-modal__checkbox-label">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              style={{ accentColor: "var(--teal)", width: 16, height: 16, flexShrink: 0 }}
            />
            <span>{t("checkbox_label")}</span>
          </label>

          <button
            className="primary"
            onClick={handleAccept}
            disabled={!checked || saving}
            style={{ width: "100%", marginTop: 12 }}
          >
            {saving ? "…" : t("btn_continue")}
          </button>
        </div>
      </div>
    </div>
  );
}
