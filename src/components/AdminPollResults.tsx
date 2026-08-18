"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { countryToContinent } from "@/lib/country-utils";

type VoterPlayer = { name: string; city: string | null; country: string; club: string | null };
type Voter = {
  isGuest: boolean;
  guestInfo: Record<string, string> | null;
  createdAt: string;
  player: VoterPlayer | null;
};
type Comment = { comment: string; createdAt: string };
type ResultsData = {
  poll: { id: string; question: string; description: string | null; options: string[]; status: string };
  visible: boolean;
  counts?: Record<string, number>;
  totalBallots?: number;
  voterCount?: number;
  voters?: Voter[];
  comments?: Comment[];
};

const CONTINENT_LABEL: Record<string, string> = {
  EU: "Europe", NA: "Amérique du Nord", SA: "Amérique du Sud", AS: "Asie",
  AF: "Afrique", OC: "Océanie", AN: "Antarctique",
};

/** Compte les occurrences d'une valeur (club/ville/pays) tous types de votants
 * confondus — pour les stats démographiques. Ignore les valeurs vides. */
function tally(voters: Voter[], pick: (v: Voter) => string | null | undefined): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const v of voters) {
    const val = pick(v)?.trim();
    if (!val) continue;
    counts.set(val, (counts.get(val) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Résultats détaillés pour l'admin : le décompte par option (visible EN TOUT
 * TEMPS pour l'admin, quel que soit le réglage showResults) + la liste des
 * participants (émargement — qui a voté), SANS jamais montrer ce qu'ils ont
 * voté (l'API ne renvoie de toute façon aucun lien votant↔choix).
 */
export function AdminPollResults({ pollId }: { pollId: string }) {
  const [data, setData] = useState<ResultsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/polls/${pollId}/results`)
      .then((res) => res.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [pollId]);

  if (loading) return <p className="meta" style={{ marginTop: 16 }}>Chargement…</p>;
  if (!data) return <p className="meta" style={{ marginTop: 16 }}>Sondage introuvable.</p>;

  const { poll, counts = {}, totalBallots = 0, voterCount = 0, voters = [], comments = [] } = data;
  const maxCount = Math.max(1, ...Object.values(counts));

  // Toutes les clés de champs guest rencontrées (pour les colonnes du tableau/export).
  const guestKeys = Array.from(
    new Set(voters.flatMap((v) => (v.guestInfo ? Object.keys(v.guestInfo) : [])))
  );

  // Stats démographiques : club/ville/pays/continent, tous types confondus (le
  // club d'un inscrit vient de son profil, celui d'un guest de guestInfo.club).
  const countryOf = (v: Voter) => v.player?.country ?? v.guestInfo?.country ?? v.guestInfo?.pays;
  const clubStats = tally(voters, (v) => v.player?.club ?? v.guestInfo?.club);
  const cityStats = tally(voters, (v) => v.player?.city ?? v.guestInfo?.city ?? v.guestInfo?.ville);
  const countryStats = tally(voters, countryOf);
  const continentStats = tally(voters, (v) => {
    const c = countryOf(v);
    const cont = c ? countryToContinent(c) : null;
    return cont ? (CONTINENT_LABEL[cont] ?? cont) : null;
  });

  const exportCsv = () => {
    const headers = ["type", "date", "nom", "ville", "pays", "club", ...guestKeys];
    const rows = voters.map((v) => [
      v.isGuest ? "invité" : "inscrit",
      new Date(v.createdAt).toLocaleString("fr-FR"),
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
    a.download = `sondage-${poll.id}-votants.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ maxWidth: 720, marginTop: 16, display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <Link href="/admin/polls" className="ghost" style={{ fontSize: 13 }}>← Retour aux sondages</Link>
        <h1 style={{ fontFamily: "var(--font-display)", margin: "8px 0 4px" }}>{poll.question}</h1>
        {poll.description && <p style={{ color: "var(--text-muted)", margin: 0 }}>{poll.description}</p>}
      </div>

      {/* Résultats — toujours visibles ici pour l'admin, indépendamment de showResults */}
      <div className="panel" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        <h3 style={{ margin: 0 }}>Résultats ({totalBallots} bulletin{totalBallots !== 1 ? "s" : ""})</h3>
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

      {/* Stats démographiques — combien de votants par club/ville/pays, tous
          types confondus. Jamais croisé avec le choix voté. */}
      {voters.length > 0 && (
        <div className="panel" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          <h3 style={{ margin: 0 }}>Participation par club / ville / pays / continent</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
            {[
              { title: "Club", stats: clubStats },
              { title: "Ville", stats: cityStats },
              { title: "Pays", stats: countryStats },
              { title: "Continent", stats: continentStats },
            ].map(({ title, stats }) => (
              <div key={title}>
                <strong style={{ fontSize: 13 }}>{title}</strong>
                {stats.length === 0 ? (
                  <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" }}>Aucune donnée.</p>
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

      {/* Commentaires anonymes (attachés aux bulletins, non reliables au votant) */}
      {comments.length > 0 && (
        <div className="panel" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
          <h3 style={{ margin: 0 }}>Commentaires ({comments.length})</h3>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
            🔒 Anonymes : impossible de savoir qui a écrit quoi.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {comments.map((c, i) => (
              <div key={i} style={{ fontSize: 14, padding: "8px 12px", background: "var(--surface-2)", borderRadius: 8, borderLeft: "3px solid var(--teal)" }}>
                {c.comment}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Participants (émargement) — qui a voté, JAMAIS quoi */}
      <div className="panel" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <h3 style={{ margin: 0 }}>Participants ({voterCount})</h3>
          {voters.length > 0 && (
            <button className="ghost" style={{ fontSize: 12 }} onClick={exportCsv}>⬇ Export CSV</button>
          )}
        </div>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
          🔒 Cette liste montre QUI a voté, jamais CE QU'ils ont voté (le système ne stocke aucun lien entre les deux).
        </p>
        {voters.length === 0 ? (
          <p className="meta">Aucun votant pour l'instant.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border-light)" }}>
                  <th style={{ padding: "6px 8px" }}>Type</th>
                  <th style={{ padding: "6px 8px" }}>Date</th>
                  <th style={{ padding: "6px 8px" }}>Nom</th>
                  <th style={{ padding: "6px 8px" }}>Club</th>
                  <th style={{ padding: "6px 8px" }}>Ville</th>
                  <th style={{ padding: "6px 8px" }}>Pays</th>
                </tr>
              </thead>
              <tbody>
                {voters.map((v, i) => {
                  const name = v.player?.name ?? v.guestInfo?.name ?? v.guestInfo?.nom ?? "—";
                  const club = v.player?.club ?? v.guestInfo?.club ?? "—";
                  const city = v.player?.city ?? v.guestInfo?.city ?? v.guestInfo?.ville ?? "—";
                  const country = v.player?.country ?? v.guestInfo?.country ?? v.guestInfo?.pays ?? "—";
                  return (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border-light)" }}>
                      <td style={{ padding: "6px 8px" }}>{v.isGuest ? "Invité" : "Inscrit"}</td>
                      <td style={{ padding: "6px 8px", color: "var(--text-muted)" }}>{new Date(v.createdAt).toLocaleString("fr-FR")}</td>
                      <td style={{ padding: "6px 8px" }}>{name}</td>
                      <td style={{ padding: "6px 8px" }}>{club}</td>
                      <td style={{ padding: "6px 8px" }}>{city}</td>
                      <td style={{ padding: "6px 8px" }}>{country}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
