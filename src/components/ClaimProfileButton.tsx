"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

type Status = "NONE" | "PENDING" | "REJECTED";

/** Sur un profil créé sans compte : « c'est moi » → demande de fusion validée par l'orga. */
export function ClaimProfileButton({ ghostId, ghostName }: { ghostId: string; ghostName: string }) {
  const t = useTranslations("merge_request");
  const [status, setStatus] = useState<Status | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch(`/api/players/${ghostId}/merge-request`)
      .then((r) => (r.ok ? r.json() : { status: "NONE" }))
      .then((d) => setStatus(d.status ?? "NONE"))
      .catch(() => setStatus("NONE"));
  }, [ghostId]);

  const claim = async () => {
    if (!window.confirm(t("claim_confirm", { ghost: ghostName }))) return;
    setSending(true);
    const res = await fetch(`/api/players/${ghostId}/merge-request`, { method: "POST" });
    setSending(false);
    if (res.ok) setStatus("PENDING");
  };

  if (status === null) return null;
  if (status === "PENDING") return <p className="meta" style={{ fontSize: 13, margin: "0 0 16px" }}>⏳ {t("claim_pending")}</p>;

  return (
    <div style={{ margin: "0 0 20px", display: "grid", gap: 6 }}>
      {status === "REJECTED" && <p className="meta" style={{ fontSize: 13, margin: 0 }}>{t("claim_rejected")}</p>}
      <p className="meta" style={{ fontSize: 12, margin: 0 }}>{t("claim_hint")}</p>
      <button type="button" className="ghost" style={{ justifySelf: "start", fontSize: 13 }} disabled={sending} onClick={claim}>
        {status === "REJECTED" ? t("claim_retry") : t("claim_btn")}
      </button>
    </div>
  );
}
