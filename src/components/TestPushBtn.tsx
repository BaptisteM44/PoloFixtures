"use client";

import { useState } from "react";

export function TestPushBtn() {
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function handleTest() {
    setSending(true);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/test-push", { method: "POST" });
      const data = await res.json();
      if (data.error) {
        setStatus(`${data.error}`);
      } else if (data.failed > 0) {
        setStatus(`${data.sent}/${data.total} OK, ${data.failed} erreur(s): ${data.errors?.join(", ")}`);
      } else {
        setStatus(`OK — ${data.sent} envoyé(s) sur ${data.total} subscription(s)`);
      }
    } catch (e: any) {
      setStatus(`Erreur: ${e.message}`);
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <button className="primary" onClick={handleTest} disabled={sending} style={{ fontSize: 12 }}>
        {sending ? "Envoi..." : "Test Push Notif"}
      </button>
      {status && <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0, textAlign: "center", maxWidth: 200, wordBreak: "break-word" }}>{status}</p>}
    </div>
  );
}
