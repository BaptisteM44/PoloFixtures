"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { ContactModal } from "./ContactModal";

type FreeAgent = {
  id: string;
  name: string;
  email: string;
  city: string | null;
  country: string | null;
  notes?: string | null;
  playerId?: string | null;
};

type Props = {
  agents: FreeAgent[];
  canDelete: boolean;
  deleteAction?: (id: string) => Promise<{ ok?: boolean }>;
  title?: string;
  publicView?: boolean;
  currentPlayerId?: string | null;
};

export function FreeAgentList({ agents, canDelete, deleteAction, title = "Demandes reçues", publicView = false, currentPlayerId }: Props) {
  const t = useTranslations("free_agent");
  const [isPending, startTransition] = useTransition();

  if (agents.length === 0) return null;

  const handleDelete = (id: string) => {
    if (!deleteAction) return;
    if (!confirm("Supprimer cette demande ?")) return;
    startTransition(async () => {
      await deleteAction!(id);
    });
  };

  const handleWithdraw = (id: string) => {
    if (!confirm(t("withdraw_confirm"))) return;
    startTransition(async () => {
      const res = await fetch(`/api/free-agents?id=${id}`, { method: "DELETE" });
      if (res.ok) window.location.reload();
    });
  };

  return (
    <div className="free-agent-list">
      {title && <h4>{title}</h4>}
      <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
        {agents.map((agent) => (
          <div key={agent.id} className="free-agent-row">
            <div className="free-agent-row__info">
              <strong>{agent.name}</strong>
              {!publicView && <span className="meta">{agent.email}</span>}
              {(agent.city || agent.country) && (
                <span className="meta">
                  {[agent.city, agent.country].filter(Boolean).join(", ")}
                </span>
              )}
              {!publicView && agent.notes && (
                <span className="meta" style={{ fontStyle: "italic" }}>{agent.notes}</span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              {publicView && agent.playerId && agent.playerId !== currentPlayerId && (
                <ContactModal
                  recipientId={agent.playerId}
                  recipientName={agent.name}
                  freeAgentId={agent.id}
                />
              )}
              {publicView && currentPlayerId && agent.playerId === currentPlayerId && (
                <button
                  type="button"
                  onClick={() => handleWithdraw(agent.id)}
                  disabled={isPending}
                  className="ghost"
                  style={{ fontSize: 12, color: "var(--danger)" }}
                >
                  {t("withdraw")}
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  onClick={() => handleDelete(agent.id)}
                  disabled={isPending}
                  title="Supprimer"
                  className="free-agent-row__delete"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
