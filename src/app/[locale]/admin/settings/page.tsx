"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AdminNav } from "@/components/AdminNav";

export default function AdminSettingsPage() {
  const t = useTranslations("admin");
  const [refCode, setRefCode] = useState("");
  const [orgaCode, setOrgaCode] = useState("");
  const [adminCode, setAdminCode] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const save = async () => {
    setStatus(t("status_saving"));
    await fetch("/api/admin/access-codes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        codes: [
          { role: "REF", code: refCode },
          { role: "ORGA", code: orgaCode },
          { role: "ADMIN", code: adminCode }
        ]
      })
    });
    setStatus(t("status_saved"));
  };

  return (
    <div className="admin-page">
      <h1>{t("settings_title")}</h1>
      <AdminNav />
      <div className="panel form">
        <label>
          {t("ref_code_label")}
          <input value={refCode} onChange={(e) => setRefCode(e.target.value)} placeholder="REF2025" />
        </label>
        <label>
          {t("orga_code_label")}
          <input value={orgaCode} onChange={(e) => setOrgaCode(e.target.value)} placeholder="ORGA2025" />
        </label>
        <label>
          {t("admin_code_label")}
          <input value={adminCode} onChange={(e) => setAdminCode(e.target.value)} placeholder="ADMIN2025" />
        </label>
        <button onClick={save}>{t("btn_save_codes")}</button>
        {status && <p className="meta">{status}</p>}
      </div>
    </div>
  );
}
