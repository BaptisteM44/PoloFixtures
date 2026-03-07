"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

type LinkRow = {
  id: string;
  label: string;
  url: string;
  addedBy: { id: string; name: string };
  createdAt: string;
};

export function OrgaLinkBoard({
  links: initial,
  tournamentId,
}: {
  links: LinkRow[];
  tournamentId: string;
}) {
  const t = useTranslations("tournament");
  const [links, setLinks] = useState<LinkRow[]>(initial);
  const [isPending, startTransition] = useTransition();
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");

  const api = `/api/tournaments/${tournamentId}/orga/links`;

  const addLink = () => {
    if (!label.trim() || !url.trim()) return;
    startTransition(async () => {
      const res = await fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim(), url: url.trim() }),
      });
      if (res.ok) {
        const link = await res.json();
        setLinks((prev) => [link, ...prev]);
        setLabel("");
        setUrl("");
      }
    });
  };

  const deleteLink = (id: string) => {
    setLinks((prev) => prev.filter((l) => l.id !== id));
    startTransition(async () => {
      await fetch(`${api}/${id}`, { method: "DELETE" });
    });
  };

  return (
    <div className="orga-link-board">
      <h3 style={{ margin: "0 0 16px", fontFamily: "var(--font-display)", fontSize: 16 }}>{t("orga_links_title")}</h3>

      {/* Add form */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t("orga_links_add_label")}
          style={{ flex: "1 1 120px", fontSize: 13 }}
        />
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t("orga_links_add_url")}
          onKeyDown={(e) => e.key === "Enter" && addLink()}
          style={{ flex: "2 1 200px", fontSize: 13 }}
        />
        <button className="primary" onClick={addLink} disabled={!label.trim() || !url.trim() || isPending} style={{ fontSize: 12, padding: "6px 14px" }}>
          {t("orga_links_add_btn")}
        </button>
      </div>

      {/* Links list */}
      {links.length === 0 ? (
        <p className="meta" style={{ textAlign: "center", padding: 20 }}>{t("orga_links_empty")}</p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {links.map((link) => (
            <div key={link.id} className="orga-link-pill">
              <a href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a>
              <button
                onClick={() => deleteLink(link.id)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 14, padding: 0, lineHeight: 1 }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
