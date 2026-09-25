"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

type ApprovalItem = {
  id: string;
  countries: string[];
  continents: string[];
  global: boolean;
  club: { id: string; name: string } | null;
  poll: {
    id: string; question: string; description: string | null; options: string[]; status: string;
    createdBy: { name: string; slug: string | null } | null;
  };
};

/**
 * Demandes de ciblage à trancher : un gérant/admin de club voit celles qui
 * visent son club, l'admin du site voit tout. Ne s'affiche que s'il y en a.
 */
export function PollApprovalQueue() {
  const t = useTranslations("poll_manage");
  const tHome = useTranslations("home");
  const continentLabel = (code: string) => tHome(`continent_${code.toLowerCase()}` as never);
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    fetch("/api/polls/approvals", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { approvals: [] }))
      .then((d) => setItems(d.approvals ?? []))
      .catch(() => {});
  useEffect(() => { load(); }, []);

  const decide = async (id: string, approve: boolean) => {
    let reason: string | null = null;
    if (!approve) {
      reason = window.prompt(t("approval_reject_prompt"));
      if (reason === null) return;
    }
    setBusy(id);
    setError(null);
    const res = await fetch(`/api/polls/approvals/${id}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approve, reason }),
    });
    if (!res.ok) setError(t("err_generic"));
    setBusy(null);
    load();
  };

  if (items.length === 0) return null;

  return (
    <section id="approvals" className="panel" style={{ padding: 16, display: "grid", gap: 12, borderColor: "var(--yellow)" }}>
      <h3 style={{ margin: 0 }}>⏳ {t("approvals_title", { count: items.length })}</h3>
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>{t("approvals_intro")}</p>
      {error && <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{error}</p>}
      {items.map((a) => {
        const target = a.club?.name
          ?? (a.global ? t("target_everyone") : [...a.countries, ...a.continents.map(continentLabel)].join(", "));
        return (
          <div key={a.id} style={{ borderTop: "1px solid var(--border-light)", paddingTop: 10, display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {a.poll.createdBy
                ? (a.poll.createdBy.slug
                  ? <Link href={`/player/${a.poll.createdBy.slug}`}>{a.poll.createdBy.name}</Link>
                  : a.poll.createdBy.name)
                : "?"}
              {" · "}{t("approval_wants", { target })}
            </div>
            <strong>{a.poll.question}</strong>
            {a.poll.description && <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>{a.poll.description}</p>}
            <div style={{ fontSize: 13 }}>{a.poll.options.join(" · ")}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="primary" style={{ fontSize: 12 }} disabled={busy === a.id} onClick={() => decide(a.id, true)}>
                ✓ {t("btn_approve")}
              </button>
              <button className="danger" style={{ fontSize: 12 }} disabled={busy === a.id} onClick={() => decide(a.id, false)}>
                {t("btn_reject")}
              </button>
            </div>
          </div>
        );
      })}
    </section>
  );
}
