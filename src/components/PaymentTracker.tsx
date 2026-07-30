"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/lib/payment-methods";

type Team = {
  id: string;
  name: string;
  feePaid?: boolean;
  paymentMethod?: PaymentMethod | null;
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

  // Récap par mode de paiement (montant encaissé via chaque canal).
  const byMethod = (Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[])
    .map((m) => ({
      method: m,
      count: selected.filter((t) => t.feePaid && t.paymentMethod === m).length,
    }))
    .filter((x) => x.count > 0);
  const unspecifiedPaid = selected.filter((t) => t.feePaid && !t.paymentMethod).length;

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

  const setMethod = async (team: Team, method: PaymentMethod) => {
    setPending(team.id);
    await fetch(`/api/teams/${team.id}/fee-paid`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feePaid: true, paymentMethod: method }),
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

      {(byMethod.length > 0 || unspecifiedPaid > 0) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          {byMethod.map(({ method, count }) => (
            <span key={method} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: "color-mix(in srgb, var(--teal) 10%, var(--bg-panel))", border: "1px solid var(--teal)", color: "var(--teal)", fontWeight: 600 }}>
              {PAYMENT_METHOD_LABELS[method]} : {count * feePerTeam} {currency}
            </span>
          ))}
          {unspecifiedPaid > 0 && (
            <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: "var(--bg-panel)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
              Mode non précisé : {unspecifiedPaid * feePerTeam} {currency}
            </span>
          )}
        </div>
      )}

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
            {team.feePaid && (
              <select
                value={team.paymentMethod ?? ""}
                onChange={(e) => setMethod(team, e.target.value as PaymentMethod)}
                disabled={pending === team.id}
                style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg-panel)" }}
              >
                <option value="" disabled>Mode ?</option>
                {(Object.entries(PAYMENT_METHOD_LABELS) as [PaymentMethod, string][]).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            )}
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
