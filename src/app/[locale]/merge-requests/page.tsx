"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

type MergeRequest = {
  id: string;
  createdAt: string;
  ghost: { id: string; name: string; slug: string | null; country: string; city: string | null; teams: { team: string; tournament: string }[] };
  requester: { id: string; name: string; slug: string | null; country: string; city: string | null; photoPath: string | null };
};

export default function MergeRequestsPage() {
  const t = useTranslations("merge_request");
  const [requests, setRequests] = useState<MergeRequest[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/merge-requests");
    setRequests(res.ok ? await res.json() : []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const decide = async (r: MergeRequest, decision: "approve" | "reject") => {
    if (decision === "approve" && !window.confirm(t("confirm_approve", { ghost: r.ghost.name, name: r.requester.name }))) return;
    setBusy(r.id);
    const res = await fetch(`/api/merge-requests/${r.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    setBusy(null);
    setMessage(res.ok ? t(decision === "approve" ? "done_approved" : "done_rejected") : t("error"));
    await load();
  };

  const place = (p: { city: string | null; country: string }) => (p.city ? `${p.city}, ${p.country}` : p.country);

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 16px", display: "grid", gap: 16 }}>
      <h1 style={{ margin: 0 }}>{t("title")}</h1>
      <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 14, lineHeight: 1.6 }}>{t("intro")}</p>
      {message && <p className="panel" style={{ margin: 0, padding: "10px 14px", fontSize: 14 }}>{message}</p>}
      {requests === null ? null : requests.length === 0 ? (
        <p className="meta">{t("empty")}</p>
      ) : (
        requests.map((r) => (
          <div key={r.id} className="panel" style={{ padding: 16, display: "grid", gap: 10 }}>
            <p style={{ margin: 0, fontSize: 15 }}>
              <Link href={`/player/${r.requester.slug ?? r.requester.id}`} style={{ fontWeight: 700, color: "var(--text)", textDecoration: "underline" }}>
                {r.requester.name}
              </Link>
              <span className="meta"> ({place(r.requester)})</span>
              {" "}{t("is")}{" "}
              <Link href={`/player/${r.ghost.slug ?? r.ghost.id}`} style={{ fontWeight: 700, color: "var(--text)", textDecoration: "underline" }}>
                {r.ghost.name}
              </Link>
              <span className="meta"> ({place(r.ghost)})</span>
            </p>
            {r.ghost.teams.length > 0 && (
              <p className="meta" style={{ margin: 0, fontSize: 13 }}>
                {t("played")} : {r.ghost.teams.map((tm) => `${tm.team} — ${tm.tournament}`).join(" · ")}
              </p>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="primary" disabled={busy === r.id} onClick={() => decide(r, "approve")}>
                {t("approve")}
              </button>
              <button type="button" className="ghost" disabled={busy === r.id} onClick={() => decide(r, "reject")}>
                {t("reject")}
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
