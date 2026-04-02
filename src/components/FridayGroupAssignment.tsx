"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { saveFridayGroupsAction } from "@/app/[locale]/tournament/[id]/edit/berlin-mixed-actions";

type Team = {
  id: string;
  name: string;
  seed: number;
  fridayGroup?: string | null;
};

interface Props {
  tournamentId: string;
  teams: Team[];
  isLocked: boolean;
}

export function FridayGroupAssignment({ tournamentId, teams, isLocked }: Props) {
  const t = useTranslations("tournament");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  // Init from existing fridayGroup values
  const initGroups = (): { A: string[]; B: string[] } => {
    const A: string[] = [];
    const B: string[] = [];
    const none: string[] = [];
    for (const t of teams) {
      if (t.fridayGroup === "A") A.push(t.id);
      else if (t.fridayGroup === "B") B.push(t.id);
      else none.push(t.id);
    }
    // Auto-distribute unassigned by seed (serpentin)
    none.sort((a, b) => {
      const ta = teams.find((t) => t.id === a)!;
      const tb = teams.find((t) => t.id === b)!;
      return ta.seed - tb.seed;
    });
    none.forEach((id, i) => {
      const round = Math.floor(i / 2);
      const pos = i % 2;
      const toA = round % 2 === 0 ? pos === 0 : pos === 1;
      if (toA) A.push(id);
      else B.push(id);
    });
    return { A, B };
  };

  const [groups, setGroups] = useState<{ A: string[]; B: string[] }>(initGroups);
  const teamMap = new Map(teams.map((t) => [t.id, t]));

  const moveTeam = (teamId: string, to: "A" | "B") => {
    setGroups((prev) => {
      const A = prev.A.filter((id) => id !== teamId);
      const B = prev.B.filter((id) => id !== teamId);
      if (to === "A") A.push(teamId);
      else B.push(teamId);
      return { A, B };
    });
  };

  const handleSave = () => {
    startTransition(async () => {
      setMessage(null);
      const res = await saveFridayGroupsAction(tournamentId, groups.A, groups.B);
      if (res && "error" in res) {
        setMessage(`Erreur : ${res.error}`);
      } else {
        setMessage(t("friday_groups_saved"));
        router.refresh();
      }
    });
  };

  const renderGroup = (label: "A" | "B") => {
    const ids = groups[label];
    return (
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 8 }}>
          Groupe {label} — {ids.length} équipes
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minHeight: 80 }}>
          {ids.map((id) => {
            const team = teamMap.get(id);
            if (!team) return null;
            const other: "A" | "B" = label === "A" ? "B" : "A";
            return (
              <div key={id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 10px", background: "var(--bg)", borderRadius: 6, border: "1px solid var(--border)", fontSize: 13 }}>
                <span>#{team.seed} {team.name}</span>
                {!isLocked && (
                  <button
                    type="button"
                    onClick={() => moveTeam(id, other)}
                    style={{ fontSize: 11, padding: "2px 8px", cursor: "pointer", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-muted)" }}
                  >
                    → {other}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {renderGroup("A")}
        {renderGroup("B")}
      </div>
      {!isLocked && (
        <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <button
            type="button"
            className="primary"
            onClick={handleSave}
            disabled={pending}
            style={{ fontSize: 13, padding: "8px 20px" }}
          >
            {pending ? t("friday_groups_saving") : t("friday_groups_save")}
          </button>
          {message && (
            <span style={{ fontSize: 12, color: message.startsWith("Erreur") ? "var(--danger)" : "var(--teal)" }}>
              {message}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
