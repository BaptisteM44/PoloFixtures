"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminClubActions({ clubId, mode }: { clubId: string; mode: "pending" | "approved" }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const approve = async () => {
    setLoading(true);
    await fetch(`/api/admin/clubs/${clubId}/approve`, { method: "POST" });
    router.refresh();
    setLoading(false);
  };

  const reject = async () => {
    if (!confirm("Supprimer ce club ?")) return;
    setLoading(true);
    await fetch(`/api/admin/clubs/${clubId}/approve`, { method: "DELETE" });
    router.refresh();
    setLoading(false);
  };

  if (mode === "pending") return (
    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
      <button className="primary" style={{ fontSize: 13 }} onClick={approve} disabled={loading}>✓ Approuver</button>
      <button className="ghost" style={{ fontSize: 13, color: "var(--danger)" }} onClick={reject} disabled={loading}>✗ Rejeter</button>
    </div>
  );

  return (
    <button className="ghost" style={{ fontSize: 13, color: "var(--danger)" }} onClick={reject} disabled={loading}>Supprimer</button>
  );
}
