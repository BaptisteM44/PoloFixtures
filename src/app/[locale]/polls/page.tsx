import { prisma } from "@/lib/db";
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function PollsPage() {
  const t = await getTranslations("poll");

  // Sondages visibles publiquement : ouverts, ou récemment fermés (résultats).
  const polls = await prisma.poll.findMany({
    where: { status: { in: ["OPEN", "CLOSED"] } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }], // OPEN avant CLOSED
    select: {
      id: true, question: true, description: true, status: true,
      _count: { select: { voters: true } },
    },
  });

  const open = polls.filter((p) => p.status === "OPEN");
  const closed = polls.filter((p) => p.status === "CLOSED");

  return (
    <div className="page" style={{ maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ fontFamily: "var(--font-display)" }}>📊 {t("page_title")}</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: 24 }}>{t("page_intro")}</p>

      {polls.length === 0 && <p className="meta">{t("page_empty")}</p>}

      {open.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 32 }}>
          {open.map((p) => (
            <Link
              key={p.id}
              href={`/poll/${p.id}`}
              className="panel"
              style={{ padding: 18, textDecoration: "none", color: "inherit", display: "block" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <strong style={{ fontSize: 17 }}>{p.question}</strong>
                  {p.description && (
                    <p style={{ margin: "6px 0 0", fontSize: 14, color: "var(--text-muted)" }}>{p.description}</p>
                  )}
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--teal)", flexShrink: 0, whiteSpace: "nowrap" }}>
                  ● {t("open_badge")}
                </span>
              </div>
              <div style={{ marginTop: 10, fontSize: 13, color: "var(--teal)", fontWeight: 600 }}>
                {t("vote")} →
              </div>
            </Link>
          ))}
        </section>
      )}

      {closed.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 style={{ fontSize: 15, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {t("closed_section")}
          </h2>
          {closed.map((p) => (
            <Link
              key={p.id}
              href={`/poll/${p.id}`}
              className="panel"
              style={{ padding: 14, textDecoration: "none", color: "inherit", display: "flex", justifyContent: "space-between", gap: 12, opacity: 0.85 }}
            >
              <span style={{ fontSize: 14 }}>{p.question}</span>
              <span style={{ fontSize: 12, color: "var(--text-muted)", flexShrink: 0 }}>
                {t("total_votes", { count: p._count.voters })}
              </span>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
