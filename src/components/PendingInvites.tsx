"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

type Invite = {
  id: string;
  squadId: string;
  squadName: string;
  invitedByName: string;
};

export function PendingInvites({ invites }: { invites: Invite[] }) {
  const t = useTranslations("my_teams");
  const router = useRouter();
  const [list, setList] = useState(invites);
  const [loading, setLoading] = useState<string | null>(null);

  if (list.length === 0) return null;

  const respond = async (inviteId: string, squadId: string, action: "accept" | "decline") => {
    setLoading(inviteId);
    await fetch(`/api/invitations/${inviteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setList((prev) => prev.filter((i) => i.id !== inviteId));
    setLoading(null);
    if (action === "accept") {
      router.push(`/my-teams/${squadId}`);
    } else {
      router.refresh();
    }
  };

  return (
    <div className="panel" style={{ marginBottom: 24 }}>
      <p style={{ fontSize: 11, fontWeight: 700, margin: "0 0 12px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {t("invites_title")}
      </p>
      <div style={{ display: "grid", gap: 10 }}>
        {list.map((inv) => (
          <div key={inv.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <strong style={{ fontSize: 14 }}>{inv.squadName}</strong>
              <p className="meta" style={{ margin: "2px 0 0" }}>{t("invite_from", { name: inv.invitedByName })}</p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="primary"
                style={{ fontSize: 12, padding: "5px 14px" }}
                disabled={loading === inv.id}
                onClick={() => respond(inv.id, inv.squadId, "accept")}
              >
                {t("btn_accept")}
              </button>
              <button
                className="ghost"
                style={{ fontSize: 12, padding: "5px 14px" }}
                disabled={loading === inv.id}
                onClick={() => respond(inv.id, inv.squadId, "decline")}
              >
                {t("btn_decline")}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
