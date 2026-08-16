"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { savePoolAssignmentAction } from "@/app/[locale]/tournament/[id]/edit/actions";

type Team = {
  id: string;
  name: string;
  seed: number;
};

type Pool = {
  id: string;
  name: string;
  teams: { team: Team }[];
};

interface Props {
  tournamentId: string;
  teams: Team[];
  pools: Pool[];
  poolCount: number;
  isLocked: boolean;
}

export function PoolAssignment({ tournamentId, teams, pools, poolCount, isLocked }: Props) {
  const t = useTranslations("tournament");
  const tc = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // { isError } explicite plutôt que deviner via message.startsWith("Erreur") :
  // ne fonctionnait qu'en français, affichait une erreur en teal (succès) dans
  // les autres langues.
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  // Initialize assignments from existing pools or empty
  const poolNames = Array.from({ length: poolCount }, (_, i) => `Pool ${String.fromCharCode(65 + i)}`);

  const initAssignments = (): Record<string, string[]> => {
    const result: Record<string, string[]> = {};
    for (const name of poolNames) result[name] = [];

    // Populate from existing pools
    for (const pool of pools) {
      if (result[pool.name]) {
        result[pool.name] = pool.teams.map((pt) => pt.team.id);
      }
    }
    return result;
  };

  const [assignments, setAssignments] = useState<Record<string, string[]>>(initAssignments);

  const assignedTeamIds = new Set(Object.values(assignments).flat());
  const unassigned = teams.filter((t) => !assignedTeamIds.has(t.id)).sort((a, b) => a.seed - b.seed);

  const teamMap = new Map(teams.map((t) => [t.id, t]));

  const moveToPool = (teamId: string, poolName: string) => {
    setAssignments((prev) => {
      const next = { ...prev };
      // Remove from any existing pool
      for (const key of Object.keys(next)) {
        next[key] = next[key].filter((id) => id !== teamId);
      }
      // Add to target pool
      next[poolName] = [...next[poolName], teamId];
      return next;
    });
  };

  const removeFromPool = (teamId: string) => {
    setAssignments((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        next[key] = next[key].filter((id) => id !== teamId);
      }
      return next;
    });
  };

  const autoDistribute = () => {
    const sorted = [...teams].sort((a, b) => a.seed - b.seed);
    const result: Record<string, string[]> = {};
    for (const name of poolNames) result[name] = [];

    sorted.forEach((team, idx) => {
      const round = Math.floor(idx / poolCount);
      const posInRound = idx % poolCount;
      const poolIdx = round % 2 === 0 ? posInRound : poolCount - 1 - posInRound;
      result[poolNames[poolIdx]].push(team.id);
    });

    setAssignments(result);
  };

  const handleSave = () => {
    startTransition(async () => {
      setMessage(null);
      const data = poolNames.map((name) => ({
        poolName: name,
        teamIds: assignments[name] || [],
      }));
      const res = await savePoolAssignmentAction(tournamentId, data);
      if (res && "error" in res) {
        setMessage({ text: `${tc("error")} : ${res.error}`, isError: true });
      } else {
        setMessage({ text: t("pool_assignment_saved"), isError: false });
        router.refresh();
      }
    });
  };

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>{t("pool_assignment_title")}</h3>
        {!isLocked && (
          <>
            <button
              className="ghost"
              style={{ fontSize: 11, padding: "3px 10px" }}
              onClick={autoDistribute}
              disabled={pending}
            >
              {t("pool_auto_distribute")}
            </button>
            <button
              className="primary"
              style={{ fontSize: 11, padding: "3px 10px" }}
              onClick={handleSave}
              disabled={pending}
            >
              {pending ? "..." : t("pool_save_assignment")}
            </button>
          </>
        )}
        {message && (
          <span style={{ fontSize: 12, color: message.isError ? "var(--danger)" : "var(--teal)" }}>
            {message.text}
          </span>
        )}
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {/* Unassigned teams */}
        <div style={{
          flex: "1 1 180px",
          minWidth: 180,
          border: "1px dashed var(--border)",
          borderRadius: 8,
          padding: 10,
          background: "var(--bg-soft)",
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: "var(--text-muted)" }}>
            {t("pool_unassigned")} ({unassigned.length})
          </div>
          {unassigned.map((team) => (
            <div key={team.id} style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "4px 8px",
              marginBottom: 4,
              borderRadius: 6,
              background: "var(--bg)",
              fontSize: 13,
            }}>
              <span>#{team.seed} {team.name}</span>
              {!isLocked && (
                <select
                  style={{ fontSize: 11, padding: "1px 4px" }}
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) moveToPool(team.id, e.target.value);
                    e.target.value = "";
                  }}
                >
                  <option value="" disabled>+</option>
                  {poolNames.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              )}
            </div>
          ))}
          {unassigned.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
              {t("pool_all_assigned")}
            </div>
          )}
        </div>

        {/* Pool columns */}
        {poolNames.map((poolName) => {
          const poolTeamIds = assignments[poolName] || [];
          return (
            <div key={poolName} style={{
              flex: "1 1 180px",
              minWidth: 180,
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: 10,
              background: "var(--bg)",
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: "var(--teal)" }}>
                {poolName} ({poolTeamIds.length})
              </div>
              {poolTeamIds.map((teamId) => {
                const team = teamMap.get(teamId);
                if (!team) return null;
                return (
                  <div key={teamId} style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "4px 8px",
                    marginBottom: 4,
                    borderRadius: 6,
                    background: "var(--bg-soft)",
                    fontSize: 13,
                  }}>
                    <span>#{team.seed} {team.name}</span>
                    {!isLocked && (
                      <button
                        className="ghost"
                        style={{ fontSize: 10, padding: "1px 6px", color: "var(--danger)" }}
                        onClick={() => removeFromPool(teamId)}
                      >
                        x
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
