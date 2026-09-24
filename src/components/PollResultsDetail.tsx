"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { countryToContinent } from "@/lib/country-utils";

type VoterPlayer = { name: string; city: string | null; country: string; club: string | null };
type Voter = {
  isGuest: boolean;
  guestInfo: Record<string, string> | null;
  createdAt: string;
  player: VoterPlayer | null;
};
type Demographic = { isGuest: boolean; club: string | null; city: string | null; country: string | null };
type Comment = { comment: string; createdAt: string };
type ResultsData = {
  poll: {
    id: string; question: string; description: string | null; options: string[]; status: string;
    blockedAt?: string | null; blockedReason?: string | null;
  };
  visible: boolean;
  counts?: Record<string, number>;
  totalBallots?: number;
  voterCount?: number;
  demographics?: Demographic[];
  voters?: Voter[];
  comments?: Comment[];
  canSeeParticipants?: boolean;
};

/** Compte les occurrences d'une valeur (club/ville/pays) — ignore les vides. */
function tally(items: Demographic[], pick: (d: Demographic) => string | null | undefined): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const d of items) {
    const val = pick(d)?.trim();
    if (!val) continue;
    counts.set(val, (counts.get(val) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Résultats détaillés d'un sondage pour son créateur ou l'admin : décompte par
 * option (toujours visible pour eux, quel que soit showResults), commentaires
 * anonymes, répartition des participants. La liste NOMINATIVE des participants
 * n'est renvoyée par l'API qu'à l'admin.
 */
export function PollResultsDetail({ pollId, backHref }: { pollId: string; backHref: string }) {
  const t = useTranslations("poll_manage");
  const tHome = useTranslations("home");
  const locale = useLocale();
  const [data, setData] = useState<ResultsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/polls/${pollId}/results`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setData)
      .finally(() => setLoading(false));
  }, [pollId]);

  if (loading) return <p className="meta" style={{ marginTop: 16 }}>{t("loading")}</p>;
  if (!data) return <p className="meta" style={{ marginTop: 16 }}>{t("not_found")}</p>;

  const { poll, counts = {}, totalBallots = 0, voterCount = 0, demographics = [], voters = [], comments = [] } = data;
  const maxCount = Math.max(1, ...Object.values(counts));

  const KNOWN_CONTINENTS = ["EU", "NA", "SA", "AS", "AF", "OC"];
  const continentLabel = (code: string) =>
    KNOWN_CONTINENTS.includes(code) ? tHome(`continent_${code.toLowerCase()}` as never) : code;
  const clubStats = tally(demographics, (d) => d.club);
  const cityStats = tally(demographics, (d) => d.city);
  const countryStats = tally(demographics, (d) => d.country);
  const continentStats = tally(demographics, (d) => {
    const cont = d.country ? countryToContinent(d.country) : null;
    return cont ? continentLabel(cont) : null;
  });

  // Colonnes du formulaire guest rencontrées (pour l'export CSV admin).
  const guestKeys = Array.from(new Set(voters.flatMap((v) => (v.guestInfo ? Object.keys(v.guestInfo) : []))));

  const exportCsv = () => {
    const headers = ["type", "date", "name", "city", "country", "club", ...guestKeys];
    const rows = voters.map((v) => [
      v.isGuest ? "guest" : "registered",
      new Date(v.createdAt).toISOString(),
      v.player?.name ?? v.guestInfo?.name ?? v.guestInfo?.nom ?? "",
      v.player?.city ?? v.guestInfo?.city ?? v.guestInfo?.ville ?? "",
      v.player?.country ?? v.guestInfo?.country ?? v.guestInfo?.pays ?? "",
      v.player?.club ?? v.guestInfo?.club ?? "",
      ...guestKeys.map((k) => v.guestInfo?.[k] ?? ""),
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `poll-${poll.id}-voters.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ maxWidth: 720, marginTop: 16, display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <Link href={backHref} className="ghost" style={{ fontSize: 13 }}>{t("back")}</Link>
        <h1 style={{ fontFamily: "var(--font-display)", margin: "8px 0 4px" }}>{poll.question}</h1>
        {poll.description && <p style={{ color: "var(--text-muted)", margin: 0 }}>{poll.description}</p>}
      </div>

      {poll.blockedAt && (
        <div style={{ fontSize: 13, background: "color-mix(in srgb, var(--danger) 10%, var(--surface))", borderRadius: 8, padding: "10px 14px" }}>
          <strong>{t("blocked_banner")}</strong>
          {poll.blockedReason && <div>{t("blocked_reason", { reason: poll.blockedReason })}</div>}
        </div>
      )}

      {/* Résultats — toujours visibles ici pour le créateur et l'admin */}
      <div className="panel" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        <h3 style={{ margin: 0 }}>{t("results_count", { count: totalBallots })}</h3>
        {poll.options.map((opt) => {
          const c = counts[opt] ?? 0;
          const pct = totalBallots > 0 ? Math.round((c / totalBallots) * 100) : 0;
          return (
            <div key={opt}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 2 }}>
                <span>{opt}</span><span style={{ fontWeight: 700 }}>{c} · {pct}%</span>
              </div>
              <div style={{ height: 12, background: "var(--surface-2)", borderRadius: 999, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(c / maxCount) * 100}%`, background: "var(--teal)", transition: "width .3s" }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Répartition démographique — jamais croisée avec le choix voté */}
      {demographics.length > 0 && (
        <div className="panel" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          <h3 style={{ margin: 0 }}>{t("demographics_title")}</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
            {[
              { title: t("col_club"), stats: clubStats },
              { title: t("col_city"), stats: cityStats },
              { title: t("col_country"), stats: countryStats },
              { title: t("col_continent"), stats: continentStats },
            ].map(({ title, stats }) => (
              <div key={title}>
                <strong style={{ fontSize: 13 }}>{title}</strong>
                {stats.length === 0 ? (
                  <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" }}>{t("no_data")}</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
                    {stats.slice(0, 8).map((s) => (
                      <div key={s.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</span>
                        <strong style={{ flexShrink: 0, marginLeft: 8 }}>{s.count}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Commentaires anonymes */}
      {comments.length > 0 && (
        <div className="panel" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
          <h3 style={{ margin: 0 }}>{t("comments_title", { count: comments.length })}</h3>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>{t("comments_anon")}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {comments.map((c, i) => (
              <div key={i} style={{ fontSize: 14, padding: "8px 12px", background: "var(--surface-2)", borderRadius: 8, borderLeft: "3px solid var(--teal)" }}>
                {c.comment}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Participants — liste nominative pour l'admin, simple compteur sinon */}
      <div className="panel" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <h3 style={{ margin: 0 }}>{t("participants_title", { count: voterCount })}</h3>
          {data.canSeeParticipants && voters.length > 0 && (
            <button className="ghost" style={{ fontSize: 12 }} onClick={exportCsv}>{t("export_csv")}</button>
          )}
        </div>
        {!data.canSeeParticipants ? (
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>🔒 {t("participants_private")}</p>
        ) : (
          <>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>{t("participants_note")}</p>
            {voters.length === 0 ? (
              <p className="meta">{t("no_voters")}</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border-light)" }}>
                      <th style={{ padding: "6px 8px" }}>{t("col_type")}</th>
                      <th style={{ padding: "6px 8px" }}>{t("col_date")}</th>
                      <th style={{ padding: "6px 8px" }}>{t("col_name")}</th>
                      <th style={{ padding: "6px 8px" }}>{t("col_club")}</th>
                      <th style={{ padding: "6px 8px" }}>{t("col_city")}</th>
                      <th style={{ padding: "6px 8px" }}>{t("col_country")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {voters.map((v, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid var(--border-light)" }}>
                        <td style={{ padding: "6px 8px" }}>{v.isGuest ? t("type_guest") : t("type_registered")}</td>
                        <td style={{ padding: "6px 8px", color: "var(--text-muted)" }}>{new Date(v.createdAt).toLocaleString(locale)}</td>
                        <td style={{ padding: "6px 8px" }}>{v.player?.name ?? v.guestInfo?.name ?? v.guestInfo?.nom ?? "—"}</td>
                        <td style={{ padding: "6px 8px" }}>{v.player?.club ?? v.guestInfo?.club ?? "—"}</td>
                        <td style={{ padding: "6px 8px" }}>{v.player?.city ?? v.guestInfo?.city ?? v.guestInfo?.ville ?? "—"}</td>
                        <td style={{ padding: "6px 8px" }}>{v.player?.country ?? v.guestInfo?.country ?? v.guestInfo?.pays ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
