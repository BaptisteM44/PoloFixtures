"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type PendingTournament = {
  id: string;
  name: string;
  city: string;
  country: string;
  dateStart: string;
  dateEnd: string;
  createdAt: string;
  creatorName: string;
  creatorId: string | null;
};

type RejectedTournament = {
  id: string;
  name: string;
  city: string;
  country: string;
  dateStart: string;
  dateEnd: string;
  rejectionReason: string;
  creatorName: string;
  creatorId: string | null;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function TournamentRow({
  t,
  onApprove,
  onReject,
  approving,
}: {
  t: PendingTournament;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  approving: string | null;
}) {
  const waitingDays = Math.floor((Date.now() - new Date(t.createdAt).getTime()) / 86400000);

  return (
    <div className="panel" style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "center" }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <strong style={{ fontFamily: "var(--font-display)", fontSize: 15 }}>{t.name}</strong>
          {waitingDays > 3 && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: "color-mix(in srgb, var(--yellow) 20%, var(--surface))", border: "1.5px solid var(--yellow)", color: "var(--text)" }}>
              {waitingDays}j d&apos;attente
            </span>
          )}
        </div>
        <p className="meta" style={{ margin: "0 0 2px" }}>{t.city}, {t.country} · {formatDate(t.dateStart)} → {formatDate(t.dateEnd)}</p>
        <p className="meta" style={{ margin: 0 }}>
          Créé par{" "}
          {t.creatorId
            ? <Link href={`/player/${t.creatorId}`} style={{ color: "var(--teal)", textDecoration: "none", fontWeight: 600 }}>{t.creatorName}</Link>
            : <span>{t.creatorName}</span>
          }
          {" · "}
          <Link href={`/tournament/${t.id}/edit`} style={{ color: "var(--text-muted)", fontSize: 11 }}>Voir l&apos;édition →</Link>
        </p>
      </div>
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <button
          className="primary"
          style={{ fontSize: 12, padding: "6px 14px" }}
          disabled={approving === t.id}
          onClick={() => onApprove(t.id)}
        >
          {approving === t.id ? "…" : "✓ Approuver"}
        </button>
        <button
          className="ghost"
          style={{ fontSize: 12, padding: "6px 14px", borderColor: "var(--pink)", color: "var(--pink)" }}
          onClick={() => onReject(t.id)}
        >
          ✗ Refuser
        </button>
      </div>
    </div>
  );
}

export function AdminTournamentsPanel({
  pending,
  rejected,
}: {
  pending: PendingTournament[];
  rejected: RejectedTournament[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [approving, setApproving] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [rejectSubmitting, setRejectSubmitting] = useState(false);

  const handleApprove = async (id: string) => {
    setApproving(id);
    await fetch(`/api/admin/tournaments/${id}/approve`, { method: "POST" });
    startTransition(() => router.refresh());
    setApproving(null);
  };

  const openRejectModal = (id: string) => {
    setRejectingId(id);
    setRejectReason("");
    setRejectError(null);
  };

  const closeRejectModal = () => {
    setRejectingId(null);
    setRejectReason("");
    setRejectError(null);
  };

  const handleRejectSubmit = async () => {
    if (!rejectingId) return;
    if (rejectReason.trim().length < 10) {
      setRejectError("La raison doit faire au moins 10 caractères.");
      return;
    }
    setRejectSubmitting(true);
    setRejectError(null);
    const res = await fetch(`/api/admin/tournaments/${rejectingId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: rejectReason.trim() }),
    });
    if (res.ok) {
      closeRejectModal();
      startTransition(() => router.refresh());
    } else {
      const data = await res.json().catch(() => ({}));
      setRejectError(data.error ?? "Erreur lors du refus.");
    }
    setRejectSubmitting(false);
  };

  const rejectingTournament = pending.find((t) => t.id === rejectingId);

  return (
    <>
      {/* Modal refus */}
      {rejectingId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div className="panel" style={{ width: "100%", maxWidth: 480, padding: "28px 32px" }}>
            <h3 style={{ margin: "0 0 8px" }}>Refuser le tournoi</h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 20px" }}>
              <strong>{rejectingTournament?.name}</strong> — L&apos;organisateur verra ce message et pourra corriger puis resoumettre.
            </p>
            <label className="field-row" style={{ marginBottom: 12 }}>
              Raison du refus *
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Ex: Le nom du tournoi est trop court, l'adresse du lieu est manquante, les dates semblent incorrectes…"
                rows={4}
                style={{ resize: "vertical", fontFamily: "inherit", fontSize: 13 }}
                autoFocus
              />
            </label>
            {rejectError && <p className="error" style={{ marginBottom: 12 }}>{rejectError}</p>}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="ghost" onClick={closeRejectModal} disabled={rejectSubmitting}>Annuler</button>
              <button
                style={{ background: "var(--pink)", color: "#fff", border: "2px solid var(--pink)", borderRadius: "var(--radius)", padding: "8px 18px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}
                onClick={handleRejectSubmit}
                disabled={rejectSubmitting || rejectReason.trim().length < 10}
              >
                {rejectSubmitting ? "Envoi…" : "Confirmer le refus"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pending list */}
      {pending.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ marginBottom: 16 }}>Tournois en attente <span style={{ fontSize: 14, fontWeight: 400, color: "var(--text-muted)" }}>({pending.length})</span></h2>
          <div style={{ display: "grid", gap: 12 }}>
            {pending.map((t) => (
              <TournamentRow
                key={t.id}
                t={t}
                onApprove={handleApprove}
                onReject={openRejectModal}
                approving={approving}
              />
            ))}
          </div>
        </section>
      )}

      {/* Rejected list */}
      {rejected.length > 0 && (
        <section>
          <h2 style={{ marginBottom: 16 }}>Tournois refusés <span style={{ fontSize: 14, fontWeight: 400, color: "var(--text-muted)" }}>({rejected.length})</span></h2>
          <div style={{ display: "grid", gap: 12 }}>
            {rejected.map((t) => (
              <div key={t.id} className="panel" style={{ borderColor: "color-mix(in srgb, var(--pink) 40%, var(--border))" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                  <div>
                    <strong style={{ fontFamily: "var(--font-display)", fontSize: 15 }}>{t.name}</strong>
                    <p className="meta" style={{ margin: "2px 0" }}>{t.city}, {t.country} · {formatDate(t.dateStart)} → {formatDate(t.dateEnd)}</p>
                    <p className="meta" style={{ margin: 0 }}>Par {t.creatorName}</p>
                  </div>
                  <Link href={`/tournament/${t.id}/edit`} className="ghost" style={{ fontSize: 12, flexShrink: 0 }}>Voir édition →</Link>
                </div>
                <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: "color-mix(in srgb, var(--pink) 8%, var(--surface))", border: "1.5px solid color-mix(in srgb, var(--pink) 30%, var(--border))" }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "var(--pink)", margin: "0 0 4px" }}>Raison du refus :</p>
                  <p style={{ fontSize: 13, margin: 0 }}>{t.rejectionReason}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {pending.length === 0 && rejected.length === 0 && (
        <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Aucun tournoi en attente ou refusé.</p>
      )}
    </>
  );
}
