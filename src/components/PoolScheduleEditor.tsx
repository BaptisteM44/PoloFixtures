"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("tournament");
  const [isPending, startTransition] = useTransition();
  const [poolATime, setPoolATime] = useState(poolAStart?.slice(11, 16) ?? "09:00");
  const [poolBTime, setPoolBTime] = useState(poolBStart?.slice(11, 16) ?? "12:00");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => { if (poolAStart) setPoolATime(poolAStart.slice(11, 16)); }, [poolAStart]);
  useEffect(() => { if (poolBStart) setPoolBTime(poolBStart.slice(11, 16)); }, [poolBStart]);

  const baseDate = toLocalDateString(tournamentDateStart);

  const handleSave = () => {
    startTransition(async () => {
      const poolADateTime = poolATime ? `${baseDate}T${poolATime}:00.000Z` : null;
      const poolBDateTime = poolBTime && poolCount > 1 ? `${baseDate}T${poolBTime}:00.000Z` : null;

      const res = await reschedulePoolMatchesAction(tournamentId, poolADateTime, poolBDateTime);
      if ("error" in res && res.error) {
        setMessage({ type: "error", text: res.error });
      } else {
        setMessage({ type: "success", text: t("orga_schedule_updated") });
        setTimeout(() => setMessage(null), 3000);
        router.refresh();
      }
    });
  };

  const slotDuration = gameDurationMin + 4;

  return (
    <div className="panel">
      <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 12 }}>
        ⏰ {t("orga_schedule_title")}
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-end" }}>
        <div>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
            {poolCount > 1 ? t("orga_schedule_pool_a") : t("orga_schedule_single")}
          </label>
          <input
            type="time"
            value={poolATime}
            onChange={(e) => setPoolATime(e.target.value)}
            disabled={isPending}
            style={{ padding: "8px 12px", borderRadius: 6, border: "1.5px solid var(--border)", fontSize: 14, width: 130 }}
          />
          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "4px 0 0" }}>
            {t("orga_schedule_slot", { game: gameDurationMin, total: slotDuration })}
          </p>
        </div>

        {poolCount > 1 && (
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              {t("orga_schedule_pool_b")}
            </label>
            <input
              type="time"
              value={poolBTime}
              onChange={(e) => setPoolBTime(e.target.value)}
              disabled={isPending}
              style={{ padding: "8px 12px", borderRadius: 6, border: "1.5px solid var(--border)", fontSize: 14, width: 130 }}
            />
            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "4px 0 0" }}>
              {t("orga_schedule_slot", { game: gameDurationMin, total: slotDuration })}
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
            {isPending ? t("orga_schedule_updating") : t("orga_schedule_apply")}
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
