"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { reschedulePoolMatchesAction } from "@/app/[locale]/tournament/[id]/edit/pool-schedule-actions";

interface Props {
  tournamentId: string;
  gameDurationMin: number;
  poolAStart?: string | null;
  poolBStart?: string | null;
  poolCount: number;
}

export function PoolScheduleEditor({ tournamentId, gameDurationMin, poolAStart, poolBStart, poolCount }: Props) {
  const t = useTranslations("tournament");
  const [isPending, startTransition] = useTransition();
  const [poolATime, setPoolATime] = useState(poolAStart?.slice(11, 16) ?? "09:00");
  const [poolBTime, setPoolBTime] = useState(poolBStart?.slice(11, 16) ?? "12:00");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSave = () => {
    startTransition(async () => {
      // Get today's date and combine with times
      const today = new Date().toISOString().slice(0, 10);
      const poolADateTime = poolATime ? new Date(`${today}T${poolATime}:00`).toISOString() : null;
      const poolBDateTime = poolBTime && poolCount > 1 ? new Date(`${today}T${poolBTime}:00`).toISOString() : null;

      const res = await reschedulePoolMatchesAction(tournamentId, poolADateTime, poolBDateTime);
      if ("error" in res && res.error) {
        setMessage({ type: "error", text: res.error });
      } else {
        setMessage({ type: "success", text: "Horaires mis à jour ✓" });
        setTimeout(() => setMessage(null), 3000);
      }
    });
  };

  const slotDuration = gameDurationMin + 4;

  return (
    <div className="panel" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
      <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 12 }}>
        ⏰ Horaires des poules
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Pool A */}
        <div>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
            Pool A — Heure de début
          </label>
          <input
            type="time"
            value={poolATime}
            onChange={(e) => setPoolATime(e.target.value)}
            disabled={isPending}
            style={{
              padding: "8px 12px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              fontSize: 13,
              width: "120px",
              cursor: isPending ? "not-allowed" : "pointer",
              opacity: isPending ? 0.6 : 1,
            }}
          />
          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "4px 0 0" }}>
            Durée estimée: ~{Math.ceil((3 * slotDuration) / 60)}h (3 matchs × {gameDurationMin}min + breaks)
          </p>
        </div>

        {/* Pool B */}
        {poolCount > 1 && (
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              Pool B — Heure de début
            </label>
            <input
              type="time"
              value={poolBTime}
              onChange={(e) => setPoolBTime(e.target.value)}
              disabled={isPending}
              style={{
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                fontSize: 13,
                width: "120px",
                cursor: isPending ? "not-allowed" : "pointer",
                opacity: isPending ? 0.6 : 1,
              }}
            />
            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "4px 0 0" }}>
              Durée estimée: ~{Math.ceil((3 * slotDuration) / 60)}h (3 matchs × {gameDurationMin}min + breaks)
            </p>
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={isPending}
          style={{
            padding: "8px 16px",
            borderRadius: 6,
            border: "1px solid var(--accent)",
            background: "var(--accent)",
            color: "white",
            fontSize: 13,
            fontWeight: 600,
            cursor: isPending ? "not-allowed" : "pointer",
            opacity: isPending ? 0.6 : 1,
            alignSelf: "flex-start",
          }}
        >
          {isPending ? "Mise à jour..." : "Mettre à jour les horaires"}
        </button>

        {message && (
          <p style={{ fontSize: 12, color: message.type === "success" ? "var(--teal)" : "var(--danger)" }}>
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}
