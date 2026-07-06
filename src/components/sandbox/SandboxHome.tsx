"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createSandboxAction, deleteSandboxAction } from "@/app/[locale]/sandbox/actions";
import { PipelineBuilder } from "@/components/sandbox/PipelineBuilder";

type PresetInfo = { key: string; label: string; description: string; minTeams: number };
type SandboxRow = {
  id: string; name: string; status: string; teamCount: number;
  stages: Array<{ name: string; status: string }>;
  createdAt: string;
};

export function SandboxHome({ presets, tournaments }: { presets: PresetInfo[]; tournaments: SandboxRow[] }) {
  const t = useTranslations("sandbox");
  const router = useRouter();
  const [mode, setMode] = useState<"preset" | "custom">("custom");
  const [presetKey, setPresetKey] = useState(presets[0]?.key ?? "");
  const [teamCount, setTeamCount] = useState(16);
  const [courtsCount, setCourtsCount] = useState(2);
  const [duration, setDuration] = useState(12);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selected = presets.find((p) => p.key === presetKey);
  const statusLabel = (status: string) => t(`status_${status.toLowerCase()}` as never);

  return (
    <main className="container" style={{ padding: "24px 16px", maxWidth: 900 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <h1 style={{ fontSize: 24, margin: 0 }}>{t("title")}</h1>
        <span style={{ fontSize: 11, fontWeight: 700, background: "var(--amber, #f59e0b)", color: "#000", padding: "2px 8px", borderRadius: 6 }}>TEST</span>
      </div>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 20 }}>
        {t("intro")}
      </p>

      {/* ── Sélecteur de mode ── */}
      <div className="tabs-bar" style={{ marginBottom: 16 }}>
        <div className="tabs">
          <button type="button" className={`tab${mode === "preset" ? " active" : ""}`} onClick={() => setMode("preset")}>{t("tab_preset")}</button>
          <button type="button" className={`tab${mode === "custom" ? " active" : ""}`} onClick={() => setMode("custom")}>{t("tab_custom")}</button>
        </div>
      </div>

      {mode === "custom" && <div style={{ marginBottom: 24 }}><PipelineBuilder maxTeams={64} /></div>}

      {/* ── Création (preset) ── */}
      {mode === "preset" && (
      <div className="panel" style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 12 }}>
          {t("new_test")}
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8, marginBottom: 14 }}>
          {presets.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => { setPresetKey(p.key); if (teamCount < p.minTeams) setTeamCount(p.minTeams); }}
              style={{
                textAlign: "left", padding: "10px 12px", borderRadius: 10, cursor: "pointer",
                border: `1px solid ${presetKey === p.key ? "var(--teal, #14b8a6)" : "var(--border)"}`,
                background: presetKey === p.key ? "color-mix(in srgb, var(--teal, #14b8a6) 12%, transparent)" : "transparent",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 14 }}>{p.label}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{p.description}</div>
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "end" }}>
          <label style={{ fontSize: 13 }}>
            {t("teams")}<br />
            <input type="number" min={selected?.minTeams ?? 4} max={64} value={teamCount}
              onChange={(e) => setTeamCount(Number(e.target.value))} style={{ width: 80 }} />
          </label>
          <label style={{ fontSize: 13 }}>
            {t("courts")}<br />
            <input type="number" min={1} max={4} value={courtsCount}
              onChange={(e) => setCourtsCount(Number(e.target.value))} style={{ width: 80 }} />
          </label>
          <label style={{ fontSize: 13 }}>
            {t("duration")}<br />
            <input type="number" min={5} max={40} value={duration}
              onChange={(e) => setDuration(Number(e.target.value))} style={{ width: 80 }} />
          </label>
          <button
            className="primary"
            disabled={pending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const res = await createSandboxAction({ presetKey, teamCount, courtsCount, gameDurationMin: duration });
                if (res.error) setError(res.error);
                else if (res.id) router.push(`/sandbox/${res.id}`);
              });
            }}
          >
            {pending ? t("creating") : t("create")}
          </button>
        </div>
        {error && <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 10 }}>{error}</p>}
      </div>
      )}

      {/* ── Mes tournois de test ── */}
      {tournaments.length > 0 && (
        <div className="panel">
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 12 }}>
            {t("my_tests")}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {tournaments.map((row) => {
              const done = row.stages.filter((s) => s.status === "DONE").length;
              return (
                <div key={row.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 10 }}>
                  <a href={`/sandbox/${row.id}`} style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{row.name}</a>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{row.teamCount} {t("teams_short")} · {t("stages_progress", { done, total: row.stages.length })}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: row.status === "COMPLETED" ? "var(--teal, #14b8a6)" : "var(--border)", color: row.status === "COMPLETED" ? "#fff" : "inherit" }}>
                    {statusLabel(row.status)}
                  </span>
                  <button className="ghost" style={{ fontSize: 12, color: "var(--danger)" }}
                    onClick={() => {
                      if (!window.confirm(t("delete_confirm", { name: row.name }))) return;
                      startTransition(async () => {
                        await deleteSandboxAction(row.id);
                        router.refresh();
                      });
                    }}>
                    🗑
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </main>
  );
}
