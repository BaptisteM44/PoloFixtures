"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Team = {
  id: string;
  name: string;
  feePaid?: boolean;
  players: { player: { name: string } }[];
};

type Props = {
  teams: Team[];
  feePerTeam: number;
  currency: string;
};

export function PaymentTracker({ teams, feePerTeam, currency }: Props) {
  const router = useRouter();
  const selected = teams.filter((t) => (t as any).selected !== false);
  const [pending, setPending] = useState<string | null>(null);

  if (feePerTeam === 0 || selected.length === 0) return null;

  const paidCount = selected.filter((t) => t.feePaid).length;
  const totalDue = selected.length * feePerTeam;
  const totalPaid = paidCount * feePerTeam;

  const toggle = async (team: Team) => {
    if (!team.feePaid) {
      const ok = window.confirm(`Confirmer le paiement de ${team.name} ?`);
      if (!ok) return;
    }
    setPending(team.id);
    await fetch(`/api/teams/${team.id}/fee-paid`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feePaid: !team.feePaid }),
    });
    router.refresh();
    setPending(null);
  };

  return (
    <div className="panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <p style={{ fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>
          Suivi des paiements
        </p>
        <span style={{ fontSize: 12, color: paidCount === selected.length ? "var(--teal)" : "var(--text-muted)" }}>
          {paidCount}/{selected.length} équipes · {totalPaid} {currency} / {totalDue} {currency}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {selected.map((team) => (
          <div
            key={team.id}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "7px 10px", borderRadius: 8,
              background: team.feePaid ? "color-mix(in srgb, var(--teal) 8%, var(--bg-panel))" : "var(--bg-panel)",
              border: `1.5px solid ${team.feePaid ? "var(--teal)" : "var(--border)"}`,
              opacity: pending === team.id ? 0.5 : 1,
            }}
          >
            <button
              type="button"
              onClick={() => toggle(team)}
              disabled={pending === team.id}
              style={{
                width: 20, height: 20, borderRadius: 4, flexShrink: 0,
                border: `2px solid ${team.feePaid ? "var(--teal)" : "var(--border)"}`,
                background: team.feePaid ? "var(--teal)" : "transparent",
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, color: "#fff", padding: 0,
              }}
            >
              {team.feePaid ? "✓" : ""}
            </button>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{team.name}</span>
            <span style={{ fontSize: 11, color: team.feePaid ? "var(--teal)" : "var(--text-muted)", fontWeight: team.feePaid ? 700 : 400 }}>
              {team.feePaid ? `Payé · ${feePerTeam} ${currency}` : `En attente · ${feePerTeam} ${currency}`}
            </span>
          </div>
        ))}
      </div>

      {paidCount === selected.length && selected.length > 0 && (
        <p style={{ fontSize: 12, color: "var(--teal)", marginTop: 10, marginBottom: 0, textAlign: "center" }}>
          ✓ Tous les paiements sont reçus
        </p>
      )}
    </div>
  );
}
