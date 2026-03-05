"use client";

import { useState } from "react";
import { AdminNav } from "@/components/AdminNav";

export default function AdminSettingsPage() {
  const [refCode, setRefCode] = useState("");
  const [orgaCode, setOrgaCode] = useState("");
  const [adminCode, setAdminCode] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const save = async () => {
    setStatus("Saving...");
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
    setStatus("Updated codes");
  };

  return (
    <div className="admin-page">
      <h1>Access Codes</h1>
      <AdminNav />
      <div className="panel form">
        <label>
          REF Code
          <input value={refCode} onChange={(e) => setRefCode(e.target.value)} placeholder="REF2025" />
        </label>
        <label>
          ORGA Code
          <input value={orgaCode} onChange={(e) => setOrgaCode(e.target.value)} placeholder="ORGA2025" />
        </label>
        <label>
          ADMIN Code
          <input value={adminCode} onChange={(e) => setAdminCode(e.target.value)} placeholder="ADMIN2025" />
        </label>
        <button onClick={save}>Save Codes</button>
        {status && <p className="meta">{status}</p>}
      </div>
    </div>
  );
}
