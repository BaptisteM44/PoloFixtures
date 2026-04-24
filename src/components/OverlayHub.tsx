"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

type TournamentInfo = {
  id: string;
  name: string;
  slug: string | null;
  status: string;
  courtsCount: number;
  dateStart: Date | string;
  dateEnd: Date | string;
  city: string | null;
  country: string | null;
};

export function OverlayHub({ tournaments }: { tournaments: TournamentInfo[] }) {
  const t = useTranslations("overlay");
  const [copied, setCopied] = useState<string | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const getOverlayUrl = (tournament: TournamentInfo, courtIndex: number) => {
    const slug = tournament.slug || tournament.id;
    const base = typeof window !== "undefined" ? window.location.origin : "";
    return `${base}/fr/tournament/${slug}/overlay?court=${courtIndex + 1}&theme=${theme}`;
  };

  const copyUrl = (url: string, key: string) => {
    navigator.clipboard.writeText(url);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Theme selector */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <span style={{ fontWeight: 600 }}>{t("theme")} :</span>
        <button
          className={`btn btn--sm ${theme === "dark" ? "btn--primary" : "btn--ghost"}`}
          onClick={() => setTheme("dark")}
        >
          Dark
        </button>
        <button
          className={`btn btn--sm ${theme === "light" ? "btn--primary" : "btn--ghost"}`}
          onClick={() => setTheme("light")}
        >
          Light
        </button>
      </div>

      {tournaments.map((tournament) => (
        <div key={tournament.id} className="card" style={{ padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <h3 style={{ margin: 0 }}>{tournament.name}</h3>
              <span className="meta">
                {tournament.city}
                {tournament.country ? `, ${tournament.country}` : ""}
                {" — "}
                <span
                  className="pill"
                  style={{
                    fontSize: 11,
                    background: tournament.status === "LIVE" ? "var(--danger)" : "var(--teal)",
                    color: "#fff",
                  }}
                >
                  {tournament.status}
                </span>
              </span>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Array.from({ length: tournament.courtsCount }, (_, i) => {
              const url = getOverlayUrl(tournament, i);
              const key = `${tournament.id}-${i}`;
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: "var(--surface-2)",
                  }}
                >
                  <span style={{ fontWeight: 600, minWidth: 80 }}>Court {i + 1}</span>
                  <code
                    style={{
                      flex: 1,
                      fontSize: 12,
                      padding: "4px 8px",
                      borderRadius: 4,
                      background: "var(--surface-3)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {url}
                  </code>
                  <button
                    className="btn btn--sm btn--ghost"
                    onClick={() => copyUrl(url, key)}
                    style={{ whiteSpace: "nowrap" }}
                  >
                    {copied === key ? t("copied") : t("copy")}
                  </button>
                  <button
                    className="btn btn--sm btn--ghost"
                    onClick={() => setPreviewUrl(previewUrl === url ? null : url)}
                    style={{ whiteSpace: "nowrap" }}
                  >
                    {previewUrl === url ? t("hide_preview") : t("preview")}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Preview iframe */}
          {previewUrl && previewUrl.includes(tournament.slug || tournament.id) && (
            <div
              style={{
                marginTop: 16,
                borderRadius: 8,
                overflow: "hidden",
                border: "1px solid var(--border)",
                background: theme === "dark" ? "#000" : "#f0f0f0",
              }}
            >
              <iframe
                src={previewUrl}
                style={{
                  width: "100%",
                  height: 200,
                  border: "none",
                }}
                title="Overlay preview"
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
