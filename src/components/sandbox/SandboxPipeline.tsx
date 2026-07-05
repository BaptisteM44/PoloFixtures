"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BracketView } from "@/components/BracketView";
import {
  launchStageAction,
  simulatePassAction,
  simulateStageAction,
  simulateAllAction,
  resetStagesAction,
  deleteSandboxAction,
} from "@/app/[locale]/sandbox/actions";

type MatchRow = {
  id: string; roundIndex: number; positionInRound: number;
  groupKey: string | null; bracketSide: string | null;
  status: string; courtName: string; startAt: string;
  teamA: string | null; teamB: string | null;
  teamAId: string | null; teamBId: string | null;
  scoreA: number; scoreB: number;
  nextMatchWinId: string | null; nextSlotWin: string | null;
  nextMatchLoseId: string | null; nextSlotLose: string | null;
  winnerTeamId: string | null; phase: string;
};

type StageRow = {
  id: string; order: number; name: string; type: string; status: string;
  config: Record<string, unknown>; groups: string[]; entriesCount: number;
  standingsByGroup: Array<{ groupKey: string; ranking: string[] }>;
  matches: MatchRow[];
};

type Props = {
  tournament: { id: string; name: string; status: string; timezone: string; teamCount: number; teams: Array<{ id: string; name: string; seed: number }> };
  stages: StageRow[];
  podium: string[] | null;
};

const TYPE_LABEL: Record<string, string> = {
  RR: "Poules", SWISS: "Swiss", CROSS_POOL: "Cross-pool", PLACEMENT: "Placement", SE: "Élim. simple", DE: "Double élim.",
};
const STATUS_META: Record<string, { label: string; color: string }> = {
  PENDING: { label: "En attente", color: "var(--text-muted)" },
  ACTIVE: { label: "▶ En cours", color: "var(--amber, #f59e0b)" },
  DONE: { label: "✓ Terminée", color: "var(--teal, #14b8a6)" },
  SKIPPED: { label: "Sautée", color: "var(--text-muted)" },
};

function fmtTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("fr-BE", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export function SandboxPipeline({ tournament, stages, podium }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [openStage, setOpenStage] = useState<number | null>(
    stages.find((s) => s.status === "ACTIVE")?.order ?? stages.find((s) => s.status === "PENDING")?.order ?? 0
  );

  const act = (fn: () => Promise<{ ok?: boolean; error?: string } | { id?: string; error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res && "error" in res && res.error) setError(res.error);
      router.refresh();
    });
  };

  const nextPending = stages.find((s) => s.status === "PENDING" &&
    stages.every((p) => p.order >= s.order || p.status === "DONE" || p.status === "SKIPPED"));

  return (
    <main className="container" style={{ padding: "24px 16px", maxWidth: 1000 }}>
      {/* ── Bandeau TEST ── */}
      <div style={{ background: "repeating-linear-gradient(45deg, #f59e0b22, #f59e0b22 10px, transparent 10px, transparent 20px)", border: "1px solid #f59e0b", borderRadius: 10, padding: "8px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 800 }}>🧪 MODE TEST</span>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Tournoi fictif — invisible du public, sans impact ELO/badges.</span>
        <a href="/sandbox" style={{ marginLeft: "auto", fontSize: 12 }}>← Bac à sable</a>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>{tournament.name}</h1>
        <span style={{ fontSize: 12, fontWeight: 700, color: tournament.status === "COMPLETED" ? "var(--teal, #14b8a6)" : "var(--text-muted)" }}>
          {tournament.status === "COMPLETED" ? "🏆 Terminé" : tournament.status === "LIVE" ? "En cours" : "Prêt à lancer"}
        </span>
      </div>

      {podium && (
        <div className="panel" style={{ marginBottom: 14, display: "flex", gap: 18, fontSize: 14 }}>
          <span>🥇 <strong>{podium[0]}</strong></span>
          {podium[1] && <span>🥈 {podium[1]}</span>}
          {podium[2] && <span>🥉 {podium[2]}</span>}
        </div>
      )}

      {/* ── Commandes globales ── */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
        <button className="primary" disabled={pending || tournament.status === "COMPLETED"} onClick={() => act(() => simulateAllAction(tournament.id))}>
          ⚡ Simuler tout le tournoi
        </button>
        <button className="ghost" disabled={pending || tournament.status === "COMPLETED"} onClick={() => act(() => simulateStageAction(tournament.id))}>
          Simuler l&apos;étape
        </button>
        <button className="ghost" disabled={pending || tournament.status === "COMPLETED"} onClick={() => act(() => simulatePassAction(tournament.id))}>
          Simuler une passe
        </button>
        <button className="ghost" style={{ color: "var(--danger)" }} disabled={pending}
          onClick={() => { if (window.confirm("Tout remettre à zéro ?")) act(() => resetStagesAction(tournament.id, 0)); }}>
          ↺ Tout reset
        </button>
        <button className="ghost" style={{ color: "var(--danger)" }} disabled={pending}
          onClick={() => {
            if (!window.confirm("Supprimer ce tournoi de test ?")) return;
            startTransition(async () => { await deleteSandboxAction(tournament.id); router.push("/sandbox"); });
          }}>
          🗑 Supprimer
        </button>
      </div>

      {error && <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 12 }}>{error}</p>}
      {pending && <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 12 }}>⏳ Simulation en cours…</p>}

      {/* ── Timeline des étapes ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {stages.map((stage) => {
          const meta = STATUS_META[stage.status] ?? STATUS_META.PENDING;
          const isOpen = openStage === stage.order;
          const doneMatches = stage.matches.filter((m) => m.status === "FINISHED").length;
          const isBracket = stage.type === "SE" || stage.type === "DE";

          return (
            <div key={stage.id} className="panel" style={{ borderLeft: `3px solid ${meta.color}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => setOpenStage(isOpen ? null : stage.order)}>
                <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text-muted)" }}>{stage.order + 1}</span>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{stage.name}</span>
                <span style={{ fontSize: 11, padding: "1px 8px", borderRadius: 6, border: "1px solid var(--border)", color: "var(--text-muted)" }}>
                  {TYPE_LABEL[stage.type] ?? stage.type}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: meta.color }}>{meta.label}</span>
                <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-muted)" }}>
                  {stage.matches.length > 0 ? `${doneMatches}/${stage.matches.length} matchs` : stage.entriesCount > 0 ? `${stage.entriesCount} équipes` : ""}
                  {" "}{isOpen ? "▾" : "▸"}
                </span>
              </div>

              {/* Boutons de l'étape */}
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                {stage.status === "PENDING" && nextPending?.order === stage.order && (
                  <button className="primary" style={{ fontSize: 13 }} disabled={pending}
                    onClick={(e) => { e.stopPropagation(); act(() => launchStageAction(tournament.id, stage.order)); }}>
                    ▶ Lancer cette étape
                  </button>
                )}
                {(stage.status === "ACTIVE" || stage.status === "DONE") && (
                  <button className="ghost" style={{ fontSize: 12, color: "var(--danger)" }} disabled={pending}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`Reset "${stage.name}" et toutes les étapes suivantes ?`)) act(() => resetStagesAction(tournament.id, stage.order));
                    }}>
                    ↺ Reset depuis ici
                  </button>
                )}
              </div>

              {/* Détail de l'étape */}
              {isOpen && (stage.status === "ACTIVE" || stage.status === "DONE") && (
                <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 14 }}>
                  {/* Classements */}
                  {!isBracket && stage.standingsByGroup.length > 0 && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                      {stage.standingsByGroup.map(({ groupKey, ranking }) => (
                        <div key={groupKey || "_"} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "8px 12px" }}>
                          <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 6 }}>
                            {groupKey ? `Classement — Groupe ${groupKey}` : "Classement"}
                          </p>
                          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13 }}>
                            {ranking.map((n, i) => <li key={i}>{n}</li>)}
                          </ol>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Bracket visuel pour SE/DE */}
                  {isBracket && stage.matches.length > 0 && (
                    <BracketView
                      matches={stage.matches.map((m) => ({
                        ...m,
                        startAt: new Date(m.startAt),
                        teamA: m.teamAId ? { id: m.teamAId, name: m.teamA } : null,
                        teamB: m.teamBId ? { id: m.teamBId, name: m.teamB } : null,
                      })) as never}
                      tournamentId={tournament.id}
                      teams={tournament.teams.map((x) => ({ id: x.id, name: x.name, bracketNumber: x.seed }))}
                      isOrganizer={false}
                      isLive={false}
                    />
                  )}

                  {/* Liste des matchs par round */}
                  {!isBracket && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {stage.matches.map((m) => (
                        <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "4px 8px", borderRadius: 8, background: m.status === "FINISHED" ? "transparent" : "color-mix(in srgb, var(--amber, #f59e0b) 8%, transparent)" }}>
                          <span style={{ color: "var(--text-muted)", fontSize: 11, minWidth: 72 }}>
                            R{m.roundIndex}{m.groupKey ? ` · Gr.${m.groupKey}` : ""} · {fmtTime(m.startAt, tournament.timezone)}
                          </span>
                          <span style={{ flex: 1, textAlign: "right", fontWeight: m.winnerTeamId === m.teamAId ? 700 : 400 }}>{m.teamA ?? "—"}</span>
                          <span style={{ fontWeight: 700, minWidth: 44, textAlign: "center" }}>
                            {m.teamB === null ? "BYE" : m.status === "FINISHED" ? `${m.scoreA}–${m.scoreB}` : "vs"}
                          </span>
                          <span style={{ flex: 1, fontWeight: m.winnerTeamId === m.teamBId ? 700 : 400 }}>{m.teamB ?? ""}</span>
                          <span style={{ fontSize: 11, color: "var(--text-muted)", minWidth: 52 }}>{m.courtName}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
