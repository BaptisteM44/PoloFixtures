import { getTranslations } from "next-intl/server";

type Row = { teamId: string; rank: number; tied: boolean; stageName: string };

/**
 * Classement final complet (onglet Récap, tournois en étapes) : une ligne par
 * équipe, les éliminés au même stade restent ex æquo (« 5e ex æquo »).
 */
export async function FinalRankingTable({ rows, teamNames, myTeamId }: { rows: Row[]; teamNames: Record<string, string>; myTeamId?: string | null }) {
  const t = await getTranslations("tournament");
  if (rows.length === 0) return null;
  return (
    <section className="panel final-ranking">
      <h2>{t("final_ranking_title")}</h2>
      <ol className="final-ranking__list">
        {rows.map((r) => (
          <li key={r.teamId} className={`final-ranking__row${r.rank <= 3 ? ` is-top${r.rank}` : ""}${r.teamId === myTeamId ? " is-mine" : ""}`}>
            <span className="final-ranking__rank">
              {r.rank}
              {r.tied && <small>{t("final_ranking_tied")}</small>}
            </span>
            <span className="final-ranking__team">{teamNames[r.teamId] ?? "?"}</span>
            <span className="final-ranking__stage">{r.stageName}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
