"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { reschedulePoolMatchesAction } from "@/app/[locale]/tournament/[id]/edit/pool-schedule-actions";

interface Props {
  tournamentId: string;
  gameDurationMin: number;
  poolAStart?: string | null;
  poolBStart?: string | null;
  poolCount: number;
  tournamentDateStart?: string | Date | null;
}

function toLocalDateString(dateInput?: string | Date | null): string {
  if (!dateInput) return new Date().toISOString().slice(0, 10);
  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  // Use UTC date to avoid timezone shift
  return d.toISOString().slice(0, 10);
}

export function PoolScheduleEditor({
  tournamentId,
  gameDurationMin,
  poolAStart,
  poolBStart,
  poolCount,
  tournamentDateStart,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [poolATime, setPoolATime] = useState(poolAStart?.slice(11, 16) ?? "09:00");
  const [poolBTime, setPoolBTime] = useState(poolBStart?.slice(11, 16) ?? "12:00");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Sync state when server-side props update (after router.refresh)
  useEffect(() => { if (poolAStart) setPoolATime(poolAStart.slice(11, 16)); }, [poolAStart]);
  useEffect(() => { if (poolBStart) setPoolBTime(poolBStart.slice(11, 16)); }, [poolBStart]);

  const baseDate = toLocalDateString(tournamentDateStart);

  const handleSave = () => {
    startTransition(async () => {
      const poolADateTime = poolATime ? new Date(`${baseDate}T${poolATime}:00`).toISOString() : null;
      const poolBDateTime = poolBTime && poolCount > 1 ? new Date(`${baseDate}T${poolBTime}:00`).toISOString() : null;

      const res = await reschedulePoolMatchesAction(tournamentId, poolADateTime, poolBDateTime);
      if ("error" in res && res.error) {
        setMessage({ type: "error", text: res.error });
      } else {
        setMessage({ type: "success", text: "Horaires mis à jour ✓" });
        setTimeout(() => setMessage(null), 3000);
        router.refresh();
      }
    });
  };

  const slotDuration = gameDurationMin + 4;

  return (
    <div className="panel">
      <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 12 }}>
        ⏰ Horaire de début
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-end" }}>
        {/* Pool A / unique */}
        <div>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
            {poolCount > 1 ? "Pool A — Heure de début" : "Heure de début des matchs"}
          </label>
          <input
            type="time"
            value={poolATime}
            onChange={(e) => setPoolATime(e.target.value)}
            disabled={isPending}
            style={{ padding: "8px 12px", borderRadius: 6, border: "1.5px solid var(--border)", fontSize: 14, width: 130 }}
          />
          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "4px 0 0" }}>
            Slot : {gameDurationMin}min + 4min pause = {slotDuration}min
          </p>
        </div>

        {/* Pool B — only if multiple pools */}
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
              style={{ padding: "8px 12px", borderRadius: 6, border: "1.5px solid var(--border)", fontSize: 14, width: 130 }}
            />
            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "4px 0 0" }}>
              Slot : {gameDurationMin}min + 4min pause = {slotDuration}min
            </p>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
          <button
            className="primary"
            onClick={handleSave}
            disabled={isPending}
            style={{ fontSize: 13 }}
          >
            {isPending ? "Mise à jour…" : "Appliquer"}
          </button>
          {message && (
            <p style={{ fontSize: 12, color: message.type === "success" ? "var(--teal)" : "var(--danger)", margin: 0 }}>
              {message.text}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
