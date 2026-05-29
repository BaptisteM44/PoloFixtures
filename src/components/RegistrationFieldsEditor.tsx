"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";

type RegistrationField = {
  id: string;
  label: string;
  required: boolean;
  target: "PLAYER" | "TEAM" | "CAPTAIN";
  order: number;
};

export function RegistrationFieldsEditor({ tournamentId }: { tournamentId: string }) {
  const t = useTranslations("reg_fields");
  const [fields, setFields] = useState<RegistrationField[]>([]);
  const [loading, setLoading] = useState(true);
  const [addLabel, setAddLabel] = useState("");
  const [addTarget, setAddTarget] = useState<"PLAYER" | "TEAM" | "CAPTAIN">("PLAYER");
  const [addRequired, setAddRequired] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch(`/api/tournaments/${tournamentId}/registration-fields`);
    if (res.ok) setFields(await res.json());
    setLoading(false);
  };

  useEffect(() => { load(); }, [tournamentId]);

  const handleAdd = async () => {
    if (!addLabel.trim()) return;
    setAdding(true);
    setAddError(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/registration-fields`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: addLabel.trim(), target: addTarget, required: addRequired }),
    });
    setAdding(false);
    if (res.ok) {
      setAddLabel("");
      setAddTarget("PLAYER");
      setAddRequired(false);
      await load();
    } else {
      setAddError(t("error_add"));
    }
  };

  const handleDelete = async (field: RegistrationField) => {
    if (!confirm(t("confirm_delete", { label: field.label }))) return;
    await fetch(`/api/tournaments/${tournamentId}/registration-fields/${field.id}`, { method: "DELETE" });
    await load();
  };

  const handleToggleRequired = async (field: RegistrationField) => {
    await fetch(`/api/tournaments/${tournamentId}/registration-fields/${field.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ required: !field.required }),
    });
    setFields((prev) => prev.map((f) => f.id === field.id ? { ...f, required: !f.required } : f));
  };

  const targetLabel = (target: "PLAYER" | "TEAM" | "CAPTAIN") => {
    if (target === "PLAYER") return t("target_player");
    if (target === "TEAM") return t("target_team");
    return t("target_captain");
  };

  return (
    <div>
      <p style={{ fontWeight: 700, fontFamily: "var(--font-display)", marginBottom: 12, fontSize: 14 }}>
        {t("title")}
      </p>
      <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16, marginTop: -8 }}>
        {t("subtitle")}
      </p>

      {loading ? (
        <p className="meta">{t("loading")}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {fields.length === 0 && (
            <p className="meta" style={{ fontSize: 12 }}>{t("empty")}</p>
          )}
          {fields.map((field) => (
            <div key={field.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "var(--surface-2)", borderRadius: 8, border: "1.5px solid var(--border)" }}>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{field.label}</span>
              <span style={{ fontSize: 11, color: "var(--text-muted)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, padding: "1px 7px" }}>
                {targetLabel(field.target)}
              </span>
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }}>
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={() => handleToggleRequired(field)}
                  style={{ width: 12, height: 12 }}
                />
                {t("required")}
              </label>
              <button
                type="button"
                onClick={() => handleDelete(field)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger, #e53e3e)", fontSize: 16, padding: "0 4px", lineHeight: 1 }}
                title={t("btn_delete")}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <input
          value={addLabel}
          onChange={(e) => setAddLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleAdd();
            }
          }}
          placeholder={t("field_label_placeholder")}
          style={{ flex: 1, minWidth: 160, fontSize: 13 }}
          maxLength={200}
        />
        <select
          value={addTarget}
          onChange={(e) => setAddTarget(e.target.value as "PLAYER" | "TEAM" | "CAPTAIN")}
          style={{ fontSize: 12, padding: "6px 10px" }}
        >
          <option value="PLAYER">{t("target_player")}</option>
          <option value="TEAM">{t("target_team")}</option>
          <option value="CAPTAIN">{t("target_captain")}</option>
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>
          <input
            type="checkbox"
            checked={addRequired}
            onChange={(e) => setAddRequired(e.target.checked)}
            style={{ width: 13, height: 13 }}
          />
          {t("required")}
        </label>
        <button type="button" onClick={() => void handleAdd()} className="ghost" disabled={adding || !addLabel.trim()} style={{ fontSize: 12 }}>
          {adding ? "…" : t("btn_add")}
        </button>
      </div>
      {addError && <p className="error" style={{ fontSize: 12, marginTop: 4 }}>{addError}</p>}
    </div>
  );
}
