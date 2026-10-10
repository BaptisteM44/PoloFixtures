"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { previewPipeline, previewTotals, type PreviewStageInput, type PreviewWarning } from "@/engine/pipeline-preview";

/**
 * Parcours d'un tournoi en étapes, calculé à l'avance pour un nombre
 * d'équipes : qui entre dans chaque étape, comment ça se joue, qui va où
 * ensuite. Deux publics :
 *  - "public" : « Comment se joue le tournoi », pour les joueurs ;
 *  - "orga"   : le même aperçu + estimations de matchs et avertissements
 *               (plage de rangs qui dépasse l'effectif, Swiss trop long…).
 */
export function FormatFlow({ stages, teamCount, audience }: { stages: PreviewStageInput[]; teamCount: number; audience: "public" | "orga" }) {
  const t = useTranslations("format_flow");
  // Orga : « et si j'ai 13 équipes ? » — nombre d'équipes simulé, modifiable.
  const [count, setCount] = useState(Math.max(teamCount, 2));
  const n = audience === "orga" ? count : teamCount;
  if (stages.length === 0 || n < 2) return null;
  const preview = previewPipeline(stages, n);
  const totals = previewTotals(preview);

  const sizesLabel = (sizes: number[]) => {
    const min = Math.min(...sizes), max = Math.max(...sizes);
    return min === max ? String(min) : `${min}–${max}`;
  };
  const typeLabel = (s: (typeof preview)[number], i: number) => {
    if (s.type === "SE") return t(stages[i].config.thirdPlace ? "type_SE_third" : "type_SE");
    return t(`type_${s.type}`);
  };
  const warn = (stageName: string, w: PreviewWarning) => {
    switch (w.kind) {
      case "range_beyond": return t("warn_range_beyond", { stage: stageName, from: w.from, to: w.to, source: w.group ? `${w.source} · ${w.group}` : w.source, size: w.size });
      case "range_empty": return t("warn_range_empty", { stage: stageName, from: w.from, source: w.group ? `${w.source} · ${w.group}` : w.source, size: w.size });
      case "swiss_too_long": return t("warn_swiss_too_long", { rounds: w.rounds, max: w.maxRounds });
      case "overlap": return t("warn_overlap", { from: w.from, to: w.to, source: w.group ? `${w.source} · ${w.group}` : w.source, other: w.other });
      case "too_small": return t("warn_too_small", { teams: w.teams, min: w.min });
      case "cross_pool_groups": return t("warn_cross_pool_groups");
    }
  };

  return (
    <section className={`format-flow format-flow--${audience}`}>
      <h3>{audience === "public" ? t("title_public") : t("title_orga")}</h3>
      {audience === "orga" ? (
        <p className="meta format-flow__count">
          <label>
            {t("simulate_for")}{" "}
            <input type="number" min={2} max={128} value={count} onChange={(e) => setCount(Math.max(2, Number(e.target.value) || 2))} />
          </label>
          {" · "}{t("total", { count: totals.matches })}
        </p>
      ) : (
        <p className="meta">{t("based_on", { count: n })}</p>
      )}
      <ol className="format-flow__list">
        {preview.map((s, i) => {
          const isLast = s.outflows.length === 0;
          return (
            <li key={i} className={`format-flow__stage${s.warnings.length && audience === "orga" ? " has-warn" : ""}`}>
              <div className="format-flow__head">
                <span className="format-flow__num">{i + 1}</span>
                <strong>{s.name}</strong>
                <span className="format-flow__type">{typeLabel(s, i)}</span>
              </div>
              <p className="format-flow__facts">
                {[
                  t("teams", { count: s.teams }),
                  s.groupSizes.length > 1 ? t("groups", { count: s.groupSizes.length, sizes: sizesLabel(s.groupSizes) }) : null,
                  s.rounds ? t("rounds", { count: s.rounds }) : null,
                  audience === "orga" ? t("matches", { count: s.matches }) : null,
                ].filter(Boolean).join(" · ")}
              </p>
              {s.outflows.length > 0 && (
                <ul className="format-flow__out">
                  {s.outflows.map((o, j) => (
                    <li key={j}>→ {o.group ? t("out_ranks_group", { from: o.from, to: o.to_, group: o.group, stage: o.to }) : t("out_ranks", { from: o.from, to: o.to_, stage: o.to })}</li>
                  ))}
                  <li className="meta">{t("rest_ranked")}</li>
                </ul>
              )}
              {isLast && (s.type === "SE" || s.type === "DE") && <p className="format-flow__final">🏆 {t("final_stage")}</p>}
              {audience === "orga" && s.warnings.length > 0 && (
                <ul className="format-flow__warn">
                  {s.warnings.map((w, j) => <li key={j}>⚠️ {warn(s.name, w)}</li>)}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
